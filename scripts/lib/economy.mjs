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
import { createQuestState, questById, questEvent, answerWhatif, readyForWhatif, whatifFor, PERKS, QUESTS } from "../../src/core/quests.js";

/** 각 활동의 실제 소요 시간(초) — 화면 이동·메뉴·읽기 포함 */
export const TIME = Object.freeze({
  JOB_SESSION: 60 + 20,    // 알바 60초 + 등대 왕복·정산
  COURSE: 4 * 60,          // 레슨 읽기 + 퀴즈 (오답 재도전 포함 평균)
  DUNGEON_OVERHEAD: 40,    // 입장·이동·정산
  ROLLBACK: 8,             // Connection Timeout 연출(감독 타임아웃) + 체크포인트 재연결
  LINK_PUZZLE: 60,         // 전투 클리어 뒤 링크 정비 콘솔(관찰 + 채널맵 수정 + 테스트) — Stage 7
  UPGRADE: 10,             // 강화 1회 시도
  TUTORIAL: 60,            // Q0 튜토리얼: 걷기·점프·훈련용 봇 한 대 맞히기 (Stage 9)
  WHATIF: 60,              // 🔮 예측해 보기: 질문·힌트 읽고 답하기
  WHATIF_REREAD: 90        // 틀렸을 때 원문 그 절을 다시 읽고 재도전
});
/** 예측해 보기 첫 시도 오답 확률 (보기 2~3개, 강좌는 이미 들은 상태) */
export const WHATIF_MISS = 0.3;

/**
 * 플레이어 전략 (PRD §8.1 공격적/방어적/수집형). 루프(15분)마다 시간 배분.
 *   jobs: 루프 시작 알바 횟수(측정기 배터리 한도 안) · trainMin: 훈련장 분 · 나머지 시간 = 던전
 *   dungeonMode: 던전 전투 방식 · rssiN: 알바에서 평균 내는 패킷 수
 *   retryAfterFail: 실패한 층에 장비를 올리지 않고 곧바로 재도전하는가 (공격형만 그렇다)
 *   alloc: 레벨업 스탯 포인트를 이 순서로 돌아가며 분배 (Stage 7.5 RF 랩)
 *   rollbacks: 던전에서 쓰러졌을 때 체크포인트(층 시작)에서 입장료 없이 다시 하는 최대 횟수 (Stage 8)
 *   던전 전투 방식이 rush가 아니면 스캔한 몬스터 대역을 채널맵에서 뺀다(AFH) — scripts/lib/combat.mjs
 */
export const PLAYER_STRATEGIES = [
  { id: "aggressive", name: "공격형", jobs: 1, trainMin: 0, dungeonMode: "rush",  rssiN: 6,  retryAfterFail: true,  alloc: ["tx"],             rollbacks: 3 },
  { id: "balanced",   name: "균형형 (중간 전략)", jobs: 3, trainMin: 1, dungeonMode: "kite",  rssiN: 10, retryAfterFail: false, alloc: ["hp", "sec", "tx"], rollbacks: 1 },
  { id: "collector",  name: "수집형", jobs: 6, trainMin: 2, dungeonMode: "stand", rssiN: 10, retryAfterFail: false, alloc: ["hp", "sec"],       rollbacks: 0 }
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
function dungeonOutcome(pools, mode, stats, floor, afh, perks = {}) {
  // 키에 결과를 바꾸는 스탯만: 광역 공격이라 RX(회피)는 무관, HOP는 봇이 투자하지 않아 늘 기본값 (Stage 8: 키가 많아 1분 초과)
  const key = `${mode}|${floor}|${afh}|${stats.hp}|${stats.tx}|${stats.sec}|${stats.hop}|${perks.dle ? 1 : 0}${perks.advBoost ? 1 : 0}`;
  let p = pools.dungeon.get(key);
  if (!p) {
    const fire = { rangeMul: perks.dle ? PERKS.dle.rangeMul : 1, ...(perks.advBoost ? { coef: PERKS.advBoost.coef } : {}) };
    p = pool(24, () => dungeonFloor(mode, stats, pools.rng, floor, { afh, fire })); // 조합당 24판 — 1000명이 표본을 공유하므로 충분 (1분 제한; Stage 9에서 퀘스트 보상으로 조합이 늘어 32→24)
    pools.dungeon.set(key, p);
  }
  return pick(p, pools.rng);
}

/** 퀴즈 보너스를 받은 스탯 */
export function statsWithQuiz(base, coursesDone) {
  const s = { ...base };
  for (const c of LIBRARY_COURSES.slice(0, coursesDone)) if (QUIZ_BONUS[c.reward]) s[c.reward] = +(s[c.reward] + QUIZ_BONUS[c.reward]).toFixed(2);
  return s;
}

/** 게임과 같은 effectiveStats로 계산 (퀴즈 보너스 + 스탯 분배 + 장비) */
function botStats(st) {
  const bonus = { hp: 0, tx: 0, rx: 0, hop: 0, sec: 0, pwr: 0 };
  for (const [k, v] of Object.entries(st.quest.p.bonus)) bonus[k] += v; // 퀘스트 보상 (Q1 TX+1)
  for (const c of LIBRARY_COURSES.slice(0, st.courses)) if (QUIZ_BONUS[c.reward]) bonus[c.reward] += QUIZ_BONUS[c.reward];
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
    upgrades: { tries: 0, success: 0 }, dungeon: { floor: 1, attempts: 0, clears: 0, kos: 0, kosBeforeFirstClear: 0, firstClearAt: null, clearTimes: [], rollbacks: 0, rollbacksPerClear: [] , floorRollbacks: 0 },
    timeline: [],
    // 퀘스트 (Stage 9): 게임과 같은 core/quests.js로 판정 — p는 퀘스트 판정에 필요한 진행도 그림자
    quest: { qs: createQuestState(), p: { cleared: {}, gear: null, dungeon: { maxFloor: 0 }, cr2032: 0, bonus: {} }, doneAt: {} }
  };
  st.quest.p.gear = st.gear;
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
    questEvent(st.quest.qs, { type: "job", grade: r.grade });
    return true;
  }
  function doTraining() {
    const r = pick(pools.training, rng);
    st.cr += r.cr2032; st.income.training += r.cr2032; st.xp += r.xp;
    if (r.kills) questEvent(st.quest.qs, { type: "kill", monsterType: "trainingBot", amount: r.kills });
  }
  /** 진행 중 퀘스트의 단계가 다 끝났으면 🔮 예측해 보기에 답한다 → 걸린 시간(초) */
  function tryQuest(now) {
    const { qs, p } = st.quest;
    let spent = 0;
    for (let q = questById(qs.active); q && readyForWhatif(qs, p, q); q = questById(qs.active)) {
      spent += TIME.WHATIF + (rng() < WHATIF_MISS ? TIME.WHATIF_REREAD : 0);
      answerWhatif(qs, p, q.id, whatifFor(q).answer);
      st.cr += p.cr2032; p.cr2032 = 0; // 보상 CR2032 (Q0)
      st.quest.doneAt[q.id] = now + spent;
    }
    return spent;
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

  // Q0 튜토리얼 (모든 봇): 걷기 10 m · 점프 · 훈련용 봇 명중
  for (const ev of [{ type: "walk", amount: 10 }, { type: "jump" }, { type: "hit", monsterType: "trainingBot" }]) questEvent(st.quest.qs, ev);
  for (let loop = 0; loop < ECONOMY.LOOPS; loop++) {
    let t = loop === 0 ? TIME.TUTORIAL : 0;
    const quest = () => { t += tryQuest(loop * loopLen + t); };
    // ① 교육: 루프마다 강좌 1개 (4루프 = 4강좌). quiz=false면 그 시간에 알바 (교과서를 안 읽으면 퀘스트도 Q0에서 멈춘다)
    if (quiz && st.courses < LIBRARY_COURSES.length) { st.quest.p.cleared[LIBRARY_COURSES[st.courses].chapter] = true; st.courses++; t += TIME.COURSE; quest(); }
    const extraJobs = !quiz ? Math.floor(TIME.COURSE / TIME.JOB_SESSION) : 0;
    // ② 알바 (측정기 배터리가 남아 있는 만큼)
    for (let j = 0; j < strategy.jobs + extraJobs; j++) {
      if (!doJob(loop * loopLen + t)) break;
      t += TIME.JOB_SESSION;
      quest();
    }
    // 훈련장
    for (let m = 0; m < strategy.trainMin; m++) { doTraining(); t += 60; }
    // ④ 강화 (던전 전에 한 번)
    shop();
    quest();
    // ③ 남은 시간: 던전 ↔ (실패해서 장비를 올려야 하면) 알바·훈련
    while (t < loopLen) {
      const power = Object.values(st.gear).reduce((a, b) => a + b, 0) * 10 + st.courses + 100 * Object.keys(st.quest.qs.done).length; // 퀘스트 보상도 전투력
      const canDungeon = st.cr >= DUNGEON.ENTRY_FEE && (strategy.retryAfterFail || power !== lastFailPower);
      if (canDungeon) {
        const stats = botStats(st);
        st.cr -= DUNGEON.ENTRY_FEE; st.spend.fee += DUNGEON.ENTRY_FEE;
        st.dungeon.attempts++;
        // 한 번 입장 = 층 도전. 쓰러지면 Connection Timeout → 체크포인트(층 시작)에서 입장료 없이 롤백 재도전 (Stage 8)
        for (let retry = 0; ; retry++) {
          // AFH: 돌격형은 안 쓰고, 나머지는 호핑 강좌를 이수했으면 버튼, 아니면 HUD에서 손으로
          const afh = strategy.dungeonMode === "rush" ? false : LIBRARY_COURSES.slice(0, st.courses).some((c) => c.reward === "afh") ? "button" : "manual";
          const r = dungeonOutcome(pools, strategy.dungeonMode, stats, st.dungeon.floor, afh, st.quest.qs.perks); // 아직 못 깬 가장 깊은 층
          t += r.time + (retry === 0 ? TIME.DUNGEON_OVERHEAD : TIME.ROLLBACK);
          st.cr += r.cr2032; st.income.dungeon += r.cr2032; st.xp += r.xp;
          if (r.cleared) {
            st.dungeon.clears++;
            st.dungeon.clearTimes.push(r.time);
            st.dungeon.rollbacksPerClear.push(st.dungeon.floorRollbacks);
            st.dungeon.floorRollbacks = 0;
            st.dungeon.floor++;
            st.quest.p.dungeon.maxFloor = st.dungeon.floor - 1;
            t += TIME.LINK_PUZZLE;
            lastFailPower = null;
            if (st.dungeon.firstClearAt === null) st.dungeon.firstClearAt = loop * loopLen + t;
            break;
          }
          if (r.ko) {
            st.dungeon.kos++;
            if (st.dungeon.firstClearAt === null) st.dungeon.kosBeforeFirstClear++;
            const lost = Math.floor(st.cr * TIMEOUT_PENALTY); // Connection Timeout 페널티
            st.cr -= lost; st.spend.penalty += lost;
            if (retry < strategy.rollbacks && t < loopLen) { st.dungeon.rollbacks++; st.dungeon.floorRollbacks++; continue; }
          }
          lastFailPower = power; // 장비·보너스가 오르기 전까지 같은 층 재입장 안 함
          break;
        }
      } else if (t + TIME.JOB_SESSION <= loopLen && doJob(loop * loopLen + t)) {
        t += TIME.JOB_SESSION;
      } else {
        doTraining(); t += 60;
      }
      shop();
      quest();
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
