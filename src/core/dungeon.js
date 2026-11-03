// 37채널 호핑 던전 — 층 생성(절차적)과 층 진행 상태 (PRD §2.1, §7 Stage 7). 순수 로직
//
// 한 층의 흐름:  combat(Wi-Fi 간섭 몬스터 처치) → link(채널맵 퍼즐: AFH) → open(다음 층 포털)
// 층마다 시드로 hopIncrement·숨은 Wi-Fi 간섭원·몬스터 배치가 달라진다 ("매번 다른 채널 배치").
// 전투 수치는 Stage 6.5 시뮬레이션의 던전 가정치 그대로 (balance.js DUNGEON, PRD §8.7).

import { DUNGEON, floorHpScale, floorAtkScale, floorPlan, MONSTERS } from "./balance.js";
import { createRng } from "./quiz.js";
import { createArena } from "./arena.js";
import { createBattle } from "./battle.js";
import {
  DATA_CHANNELS, HOP_MIN, HOP_MAX, MIN_USED_CHANNELS, allChannelsMap, usedChannels,
  wifiBlockedChannels, csa1Sequence, linkTest, dataChannelFreq
} from "./hopping.js";

/** 던전 방은 마을에서 멀리 떨어진 지하에 있다 (안개 너머라 마을이 보이지 않는다) */
export const DUNGEON_ROOM = Object.freeze({ cx: 0, cz: 400, radius: 10, floorY: -20 });
export const DUNGEON_WORLD = createArena(DUNGEON_ROOM);

/** 링크 퍼즐 규칙 */
export const LINK = Object.freeze({
  TEST_EVENTS: 20,          // 연속 성공해야 하는 연결 이벤트 수
  OBSERVE_INTERVAL: 0.15,   // 관찰 모드에서 연결 이벤트 간격 (게임 시간, 초)
  NOISE_LOSS: 0.02          // 막히지 않은 채널에서도 가끔 깨지는 확률 (관찰용 — 페이딩)
});

/** 층이 깊어질수록 숨은 Wi-Fi 공유기가 늘어난다: 1~2층 1대, 3~5층 2대, 6층~ 3대 */
export const wifiCountFor = (floor) => (floor <= 2 ? 1 : floor <= 5 ? 2 : 3);

/**
 * 숨은 공유기의 Wi-Fi 채널(1~13)을 고른다. 서로 4채널 이상 떨어뜨려(덮는 범위가 거의 겹치지 않게)
 * 남은 후보 중에서만 뽑는다 — 무작정 다시 뽑기는 (4, 10)처럼 세 번째 자리가 없는 경우 무한 루프였다.
 */
export function pickWifiChannels(count, rng) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const picked = [];
    while (picked.length < count) {
      const options = [];
      for (let w = 1; w <= 13; w++) if (picked.every((x) => Math.abs(x - w) >= 4)) options.push(w);
      if (options.length === 0) break;
      picked.push(options[Math.floor(rng() * options.length)]);
    }
    if (picked.length === count) return picked.sort((a, b) => a - b);
  }
  return [1, 6, 11].slice(0, count); // 이론상 도달하지 않지만 안전장치 (대표적인 비중첩 조합)
}

/**
 * 층 생성
 * @returns {{ floor: number, seed: number, hopIncrement: number, wifi: number[], blocked: Set<number>,
 *   spawns: Array<[number, number]>, monsterWifi: number[], hpScale: number, atkScale: number }}
 */
export function generateFloor(floor, seed) {
  const rng = createRng((seed ^ Math.imul(floor, 0x9e3779b1)) >>> 0);
  const hopIncrement = HOP_MIN + Math.floor(rng() * (HOP_MAX - HOP_MIN + 1));
  const wifi = pickWifiChannels(wifiCountFor(floor), rng);
  const n = floorPlan(floor).roster.length;   // Stage 12.1: 층마다 마릿수가 다르다
  const base = rng() * Math.PI * 2;
  const spawns = Array.from({ length: n }, (_, i) => {
    const a = base + (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    return [DUNGEON_ROOM.cx + Math.cos(a) * 7, DUNGEON_ROOM.cz + Math.sin(a) * 7];
  });
  // 몬스터마다 자기 Wi-Fi 채널 (전투 중 간섭 대역 — Stage 8). 벽 속 숨은 공유기(wifi)와는 별개
  const monsterWifi = spawns.map(() => 1 + Math.floor(rng() * 13));
  const plan = floorPlan(floor);
  return { floor, seed, hopIncrement, wifi, monsterWifi, blocked: wifiBlockedChannels(wifi), spawns, hpScale: floorHpScale(floor), atkScale: floorAtkScale(floor),
    roster: plan.roster, theme: plan.theme, name: plan.name };
}

/**
 * 자동 채널 선택(ACS) 주기 — 3층부터 Wi-Fi 몬스터가 주기적으로 채널을 옮긴다 (초, 없으면 null).
 * 대역이 고정이면 AFH 한 번으로 영구히 안 맞게 되어(Stage 8 시뮬레이션) 깊은 층이 무의미했다.
 */
export const acsPeriodFor = (floor) => (floor < 3 ? null : Math.max(6, 12 - floor));

/** ACS 진행: 주기가 되면 몬스터가 다른 Wi-Fi 채널로 옮긴다 (드러난 대역은 새 채널로 바로 보인다 — 바뀐 걸 알아채고 다시 AFH해야 한다) */
export function stepAcs(battle, floor, dt, rng) {
  const period = acsPeriodFor(floor);
  const events = [];
  if (!period) return events;
  for (const m of battle.monsters) {
    if (m.state === "dead" || !m.wifi) continue;   // ACS는 Wi-Fi 몬스터만
    m.acsT = (m.acsT ?? period * (0.5 + rng() * 0.5)) - dt;
    if (m.acsT > 0) continue;
    m.acsT = period;
    let w = m.wifi;
    while (Math.abs(w - m.wifi) < 4) w = 1 + Math.floor(rng() * 13); // 겹치지 않는 먼 채널로
    events.push({ type: "acs", monster: m, from: m.wifi, to: w });
    m.wifi = w;
  }
  return events;
}

/** 층의 전투 생성 — 몬스터마다 Wi-Fi 채널(m.wifi)을 붙인다. 체크포인트 롤백은 같은 layout으로 다시 만든다 */
export function createFloorBattle(layout) {
  const roster = layout.roster ?? layout.spawns.map(() => "wifiInterferer");
  const battle = createBattle(layout.spawns, roster, DUNGEON_WORLD, { hpScale: layout.hpScale, atkScale: layout.atkScale });
  battle.monsters.forEach((m, i) => {
    m.revealed = false;
    if (m.type === "wifiInterferer") m.wifi = layout.monsterWifi[i];
    if (m.type === "microwave") { m.band = MICROWAVE_BAND; m.on = true; m.dutyT = MONSTERS.microwave.duty.on * (0.4 + 0.6 * ((i * 0.37) % 1)); }
  });
  return battle;
}

/** 전자레인지가 덮는 LE 채널 (2442~2466 MHz) */
export const MICROWAVE_BAND = (() => {
  const { fromMhz, toMhz } = MONSTERS.microwave.band;
  const s = new Set();
  for (let c = 0; c < 37; c++) { const f = dataChannelFreq(c); if (f >= fromMhz && f <= toMhz) s.add(c); }
  return s;
})();

/** 전자레인지 켜짐/꺼짐 박자 (Stage 12.1) — 바뀔 때 이벤트 */
export function stepMicrowaves(battle, dt) {
  const events = [];
  const { on, off } = MONSTERS.microwave.duty;
  for (const m of battle.monsters) {
    if (m.type !== "microwave" || m.state === "dead") continue;
    m.dutyT -= dt;
    if (m.dutyT > 0) continue;
    m.on = !m.on;
    m.dutyT = m.on ? on : off;
    events.push({ type: "microwave", monster: m, on: m.on });
  }
  return events;
}

/** 링크 퍼즐 상태 */
export function createLinkPuzzle(layout) {
  return {
    hopIncrement: layout.hopIncrement,
    blocked: layout.blocked,
    map: allChannelsMap(),
    event: 0,
    sinceEvent: 0,
    /** 채널별 관찰 통계 (채널 분류의 근거) */
    stats: Array.from({ length: DATA_CHANNELS }, () => ({ tx: 0, lost: 0 })),
    log: [],
    solved: false,
    lastTest: null
  };
}

/** 채널 하나를 채널맵에서 넣고 빼기 (최소 2채널 유지) — 바뀌면 true */
export function toggleChannel(puzzle, ch) {
  if (puzzle.solved) return false;
  if (puzzle.map[ch] && usedChannels(puzzle.map).length <= MIN_USED_CHANNELS) return false;
  puzzle.map[ch] = !puzzle.map[ch];
  return true;
}

export function resetMap(puzzle) {
  if (!puzzle.solved) puzzle.map = allChannelsMap();
}

/** 관찰: 연결 이벤트를 하나씩 흘려보내며 채널별 손실을 센다 */
export function observe(puzzle, dt, rng) {
  const out = [];
  puzzle.sinceEvent += dt;
  while (puzzle.sinceEvent >= LINK.OBSERVE_INTERVAL) {
    puzzle.sinceEvent -= LINK.OBSERVE_INTERVAL;
    const [e] = csa1Sequence(puzzle.hopIncrement, puzzle.map, 1, puzzle.event);
    // 층의 숨은 공유기는 늘 켜져 있다(링크 테스트와 같은 가정) — 막힌 채널은 항상 깨지고, 나머지는 가끔 페이딩
    const lost = puzzle.blocked.has(e.channel) || rng() < LINK.NOISE_LOSS;
    puzzle.stats[e.channel].tx++;
    if (lost) puzzle.stats[e.channel].lost++;
    const rec = { event: puzzle.event, channel: e.channel, remapped: e.remapped, lost };
    puzzle.log.push(rec);
    if (puzzle.log.length > 40) puzzle.log.shift();
    puzzle.event++;
    out.push(rec);
  }
  return out;
}

/**
 * 링크 테스트: 지금 채널맵으로 다음 TEST_EVENTS개 연결 이벤트가 모두 막힌 채널을 피하면 통과
 * @returns {{ ok: boolean, lostChannels: number[], used: number, best: number, stars: number }}
 */
export function runLinkTest(puzzle) {
  const t = linkTest(puzzle.hopIncrement, puzzle.map, puzzle.blocked, LINK.TEST_EVENTS, puzzle.event);
  puzzle.event += LINK.TEST_EVENTS;
  const used = usedChannels(puzzle.map).length;
  const best = DATA_CHANNELS - puzzle.blocked.size; // 막힌 채널만 정확히 뺀 맵
  // ★: 통과 / ★★: 쓸 수 있는 채널의 80% 이상 유지 / ★★★: 막힌 채널만 정확히 뺌
  const exact = used === best && usedChannels(puzzle.map).every((c) => !puzzle.blocked.has(c));
  const stars = !t.ok ? 0 : exact ? 3 : used >= best * 0.8 ? 2 : 1;
  const result = { ok: t.ok, lostChannels: [...new Set(t.events.filter((e) => e.lost).map((e) => e.channel))], used, best, stars };
  puzzle.lastTest = result;
  if (t.ok) puzzle.solved = true;
  return result;
}

/** 층 해설 문구용: 간섭원이 덮는 LE 채널 범위 */
export function interferenceSummary(layout) {
  return layout.wifi.map((w) => {
    const chs = [...wifiBlockedChannels([w])].sort((a, b) => a - b);
    return { wifi: w, mhz: 2407 + 5 * w, from: chs[0], to: chs[chs.length - 1], fromMhz: dataChannelFreq(chs[0]), toMhz: dataChannelFreq(chs[chs.length - 1]) };
  });
}
