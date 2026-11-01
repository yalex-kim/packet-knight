// 1시간 경제·진행 시뮬레이션 (PRD §8.1·§8.3) — 교육 → 알바 → (사냥) → 던전 → 강화 루프 4회
//
// 실제 게임 로직에서 뽑은 결과 풀을 표본으로 쓴다(빠르게 수천 명을 돌리기 위해):
//   알바 60초 결과   ← core/rssiJob.js  (scripts/lib/rssi.mjs)
//   훈련장 1분 결과  ← core/battle.js   (scripts/lib/combat.mjs trainingSession)
//   던전 1층 결과    ← core/battle.js + core/arena.js (dungeonFloor) — 스탯 조합별로 캐시
// 던전은 Stage 7 구현 전 가정치(balance.js DUNGEON, MONSTERS.wifiInterferer)다.

import {
  PLAYER_BASE, QUIZ_BONUS, LIBRARY_COURSES, GEAR, UPGRADE, DUNGEON, ECONOMY, TIMEOUT_PENALTY, upgradeCost
} from "../../src/core/balance.js";
import { emptyGear, tryUpgrade, expectedCostTo } from "../../src/core/gear.js";
import { effectiveStats } from "../../src/core/progress.js";
import { levelFromXp } from "../../src/core/combat.js";
import { STAT_POINTS_PER_LEVEL, STAT_CAPS, STAT_POINT_GAIN } from "../../src/core/balance.js";
import { rssiSession } from "./rssi.mjs";
import { fullCharges, useCharge } from "../../src/core/jobCharges.js";
import { trainingSession, dungeonFloor } from "./combat.mjs";

/** 각 활동의 실제 소요 시간(초) — 화면 이동·메뉴·읽기 포함 */
export const TIME = Object.freeze({
  JOB_SESSION: 60 + 20,    // 알바 60초 + 등대 왕복·정산
  COURSE: 4 * 60,          // 레슨 읽기 + 퀴즈 (오답 재도전 포함 평균)
  DUNGEON_OVERHEAD: 40,    // 입장·이동·정산
  LINK_PUZZLE: 60,         // 전투 클리어 뒤 링크 정비 콘솔(관찰 + 채널맵 수정 + 테스트) — Stage 7
  UPGRADE: 10              // 강화 1회 시도
});

/**
 * 플레이어 전략 (PRD §8.1 공격적/방어적/수집형). 루프(15분)마다 시간 배분.
 *   jobs: 루프 시작 알바 횟수(측정기 배터리 한도 안) · trainMin: 훈련장 분 · 나머지 시간 = 던전
 *   dungeonMode: 던전 전투 방식 · rssiN: 알바에서 평균 내는 패킷 수
 *   retryAfterFail: 실패한 층에 장비를 올리지 않고 곧바로 재도전하는가 (공격형만 그렇다)
 *   alloc: 레벨업 스탯 포인트를 이 순서로 돌아가며 분배 (Stage 7.5 RF 랩)
 */
export const PLAYER_STRATEGIES = [
  { id: "aggressive", name: "공격형", jobs: 1, trainMin: 0, dungeonMode: "rush",  rssiN: 6,  retryAfterFail: true,  alloc: ["tx"] },
  { id: "balanced",   name: "균형형 (중간 전략)", jobs: 3, trainMin: 1, dungeonMode: "kite",  rssiN: 10, retryAfterFail: false, alloc: ["hp", "sec", "tx"] },
  { id: "collector",  name: "수집형", jobs: 6, trainMin: 2, dungeonMode: "stand", rssiN: 10, retryAfterFail: false, alloc: ["hp", "sec"] }
];

// ---------- 결과 풀 ----------
function pool(n, make) { return Array.from({ length: n }, make); }
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

export function buildPools(rng, size = 300) {
  const rssi = {};
  for (const n of new Set(PLAYER_STRATEGIES.map((s) => s.rssiN))) rssi[n] = pool(size, () => rssiSession(n, rng));
  const training = pool(Math.ceil(size / 2), () => trainingSession("stand", PLAYER_BASE, rng, 60));
  return { rssi, training, dungeon: new Map(), rng };
}

/** 스탯 조합별 던전 결과 풀 (지연 생성·캐시) */
function dungeonOutcome(pools, mode, stats, floor) {
  const key = `${mode}|${floor}|${stats.hp}|${stats.tx}|${stats.rx}|${stats.sec}`;
  let p = pools.dungeon.get(key);
  if (!p) {
    p = pool(60, () => dungeonFloor(mode, stats, pools.rng, floor));
    pools.dungeon.set(key, p);
  }
  return pick(p, pools.rng);
}

/** 퀴즈 보너스를 받은 스탯 */
export function statsWithQuiz(base, coursesDone) {
  const s = { ...base };
  for (const c of LIBRARY_COURSES.slice(0, coursesDone)) s[c.reward] = +(s[c.reward] + QUIZ_BONUS[c.reward]).toFixed(2);
  return s;
}

/** 게임과 같은 effectiveStats로 계산 (퀴즈 보너스 + 스탯 분배 + 장비) */
function botStats(st) {
  const bonus = { hp: 0, tx: 0, rx: 0, hop: 0, sec: 0, pwr: 0 };
  for (const c of LIBRARY_COURSES.slice(0, st.courses)) bonus[c.reward] += QUIZ_BONUS[c.reward];
  return effectiveStats({ bonus, alloc: st.alloc, gear: st.gear });
}

/** 다음에 강화할 장비: 가장 낮은 레벨(동률이면 정의 순서) — 고르게 키우는 일반적 플레이 */
function nextGear(gear) {
  return Object.keys(GEAR).reduce((a, b) => (gear[b] < gear[a] ? b : a));
}

/**
 * 한 명의 1시간 플레이
 * @param {{ quiz?: boolean }} opts quiz=false면 도서관을 건너뛰고 그 시간에 알바를 더 한다
 */
export function playHour(strategy, pools, { quiz = true } = {}) {
  const rng = pools.rng;
  const st = {
    cr: 0, gear: emptyGear(), courses: 0, xp: 0, level: 1, alloc: { hp: 0, tx: 0, rx: 0, hop: 0, sec: 0, pwr: 0 }, allocTurn: 0,
    income: { job: 0, training: 0, dungeon: 0 }, spend: { fee: 0, upgrade: 0, penalty: 0 },
    upgrades: { tries: 0, success: 0 }, dungeon: { floor: 1, attempts: 0, clears: 0, kos: 0, kosBeforeFirstClear: 0, firstClearAt: null, clearTimes: [] },
    timeline: []
  };
  const loopLen = ECONOMY.HOUR / ECONOMY.LOOPS;
  let charges = fullCharges(0);
  let lastFailPower = null;
  /** 측정기 배터리가 있으면 알바 1판 (now: 1시간 안의 초) */
  function doJob(now) {
    const next = useCharge(charges, now * 1000);
    if (!next) return false;
    charges = next;
    const r = pick(pools.rssi[strategy.rssiN], rng);
    st.cr += r.reward; st.income.job += r.reward;
    return true;
  }
  function doTraining() {
    const r = pick(pools.training, rng);
    st.cr += r.cr2032; st.income.training += r.cr2032; st.xp += r.xp;
  }

  /** XP가 쌓이면 레벨업 → 스탯 포인트를 전략 순서대로 분배 */
  function levelUp() {
    const lv = levelFromXp(st.xp).level;
    let points = (lv - st.level) * STAT_POINTS_PER_LEVEL;
    st.level = lv;
    while (points > 0) {
      const stat = strategy.alloc[st.allocTurn++ % strategy.alloc.length];
      const capped = STAT_CAPS[stat] !== undefined && botStats(st)[stat] + STAT_POINT_GAIN[stat] > STAT_CAPS[stat];
      if (!capped) st.alloc[stat] += 1;
      points--;
    }
  }

  function shop() {
    levelUp();
    // 던전 입장료는 남겨 두고 살 수 있는 만큼 강화
    for (;;) {
      const g = nextGear(st.gear);
      if (st.gear[g] >= UPGRADE.MAX_LEVEL) return;
      const cost = upgradeCost(st.gear[g]);
      if (st.cr - cost < DUNGEON.ENTRY_FEE) return;
      const r = tryUpgrade(st.gear[g], rng);
      st.cr -= r.cost;
      st.spend.upgrade += r.cost;
      st.upgrades.tries++;
      if (r.success) { st.gear[g]++; st.upgrades.success++; }
    }
  }

  for (let loop = 0; loop < ECONOMY.LOOPS; loop++) {
    let t = 0;
    // ① 교육: 루프마다 강좌 1개 (4루프 = 4강좌). quiz=false면 그 시간에 알바
    if (quiz && st.courses < LIBRARY_COURSES.length) { st.courses++; t += TIME.COURSE; }
    const extraJobs = !quiz ? Math.floor(TIME.COURSE / TIME.JOB_SESSION) : 0;
    // ② 알바 (측정기 배터리가 남아 있는 만큼)
    for (let j = 0; j < strategy.jobs + extraJobs; j++) {
      if (!doJob(loop * loopLen + t)) break;
      t += TIME.JOB_SESSION;
    }
    // 훈련장
    for (let m = 0; m < strategy.trainMin; m++) { doTraining(); t += 60; }
    // ④ 강화 (던전 전에 한 번)
    shop();
    // ③ 남은 시간: 던전 ↔ (실패해서 장비를 올려야 하면) 알바·훈련
    while (t < loopLen) {
      const power = Object.values(st.gear).reduce((a, b) => a + b, 0) * 10 + st.courses;
      const canDungeon = st.cr >= DUNGEON.ENTRY_FEE && (strategy.retryAfterFail || power !== lastFailPower);
      if (canDungeon) {
        const stats = botStats(st);
        st.cr -= DUNGEON.ENTRY_FEE; st.spend.fee += DUNGEON.ENTRY_FEE;
        const r = dungeonOutcome(pools, strategy.dungeonMode, stats, st.dungeon.floor); // 아직 못 깬 가장 깊은 층
        st.dungeon.attempts++;
        t += r.time + TIME.DUNGEON_OVERHEAD;
        st.cr += r.cr2032; st.income.dungeon += r.cr2032; st.xp += r.xp;
        if (r.cleared) {
          st.dungeon.clears++;
          st.dungeon.clearTimes.push(r.time);
          st.dungeon.floor++;
          t += TIME.LINK_PUZZLE;
          lastFailPower = null;
          if (st.dungeon.firstClearAt === null) st.dungeon.firstClearAt = loop * loopLen + t;
        } else {
          lastFailPower = power; // 장비·퀴즈 보너스가 오르기 전까지 같은 층 재도전 안 함
          if (r.ko) {
            st.dungeon.kos++;
            if (st.dungeon.firstClearAt === null) st.dungeon.kosBeforeFirstClear++;
            const lost = Math.floor(st.cr * TIMEOUT_PENALTY); // Connection Timeout 페널티
            st.cr -= lost; st.spend.penalty += lost;
          }
        }
      } else if (t + TIME.JOB_SESSION <= loopLen && doJob(loop * loopLen + t)) {
        t += TIME.JOB_SESSION;
      } else {
        doTraining(); t += 60;
      }
      shop();
    }
    st.timeline.push({ loop: loop + 1, cr: st.cr, gear: { ...st.gear }, clears: st.dungeon.clears });
  }
  return st;
}

/**
 * 목표 강화 비용 = 강화 TARGET_UPGRADES회 성공(장비 4종에 고르게)의 기대 CR2032 (실패 재시도 포함)
 * 수지 = (수급 − 던전 입장료 − 타임아웃 페널티) / 목표 강화 비용 − 1  (PRD §8.3·§8.7)
 */
export function targetSpend() {
  const pieces = Object.keys(GEAR).length;
  const per = Math.floor(ECONOMY.TARGET_UPGRADES / pieces);
  const extra = ECONOMY.TARGET_UPGRADES % pieces;
  const upgrade = pieces * expectedCostTo(per) + extra * (expectedCostTo(per + 1) - expectedCostTo(per));
  return { upgrade, total: upgrade };
}
