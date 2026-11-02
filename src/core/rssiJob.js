// 알바: 비콘 찾기 — 숨은 비콘을 RSSI로 찾아가는 60초 미니게임 상태 기계 (PRD §4.2, Stage 11.2). 순수 로직 (THREE·DOM 의존 없음)
//
// 모델 (connectivityBook location.html 시뮬레이터와 동일):
//   RSSI = P1m − 10·n·log10(d) + N(0, σ²)     P1m = −59 dBm, n = 2.7 (집 환경)
// d는 기사와 숨은 비콘 사이의 실제 거리다. 기사는 마을을 직접 걸으며 측정기를 본다.
// 패킷 하나의 RSSI는 크게 흔들리므로(σ 8 dB → 거리 배율 약 ×2), **멈춰 서서** 여러 패킷을 평균해야 거리를 믿을 수 있다.
// 움직이면 평균이 새로 시작된다(서 있는 자리마다 따로 잰다). 여러 자리에서 잰 거리로 비콘 위치를 좁히고(삼변측량),
// "📍 여기다!"를 누른 자리와 실제 비콘 사이 거리로 판정한다. 평균을 오래 낼수록 정확하지만 60초 안에 찾는 비콘 수는 준다.

import { RSSI_JOB } from "./balance.js";

/** 표준 정규 난수 (Box–Muller) */
function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** 경로 손실 모델의 평균 RSSI (dBm) */
export const meanRssiAt = (d, c = RSSI_JOB) => c.P1M - 10 * c.PATH_LOSS_N * Math.log10(d);
/** RSSI(dBm) → 추정 거리(m) — 교과서 식 d ≈ 10^((P1m − RSSI) / (10·n)) */
export const distanceFromRssi = (rssi, c = RSSI_JOB) => 10 ** ((c.P1M - rssi) / (10 * c.PATH_LOSS_N));

/** "여기다!" 자리와 실제 비콘 사이 거리(m) → 판정 */
export function judge(err, c = RSSI_JOB) {
  for (const tier of c.TIERS) if (err <= tier.maxErr) return tier;
  return c.MISS;
}

/** 세션 점수 → 등급·보수 (PRD §8.4 알바 보수 S/A/B/C) */
export function gradeSession(score, rounds, c = RSSI_JOB) {
  if (rounds === 0) return { grade: "-", reward: 0 };
  for (const g of c.GRADES) if (score >= g.minScore) return { grade: g.grade, reward: g.reward };
  return { grade: "C", reward: c.GRADES[c.GRADES.length - 1].reward };
}

/**
 * @typedef {{ x: number, z: number }} Pos
 * @typedef {{ t: number, rssi: number }} Sample
 * @typedef {{ x: number, z: number, samples: Sample[], sum: number, err: number|null, tier: object|null, startDist: number }} Beacon
 * @typedef {{
 *   phase: "search"|"reveal"|"done", timeLeft: number, phaseTime: number, clock: number, nextAdIn: number,
 *   score: number, beacon: Beacon, anchor: Pos, live: Sample[], lastPos: Pos,
 *   isSpotOk: (x: number, z: number) => boolean,
 *   history: Array<{ err: number, n: number, points: number, startDist: number }>,
 *   result: null | { score: number, rounds: number, grade: string, reward: number, avgN: number }
 * }} Job
 */

/** 기사 위치에서 SPAWN_MIN~SPAWN_MAX 떨어진, 걸어갈 수 있는 자리에 비콘을 숨긴다 */
function newBeacon(rng, from, isSpotOk, c) {
  let spot = null;
  for (let i = 0; i < c.SPAWN_TRIES && !spot; i++) {
    const r = c.SPAWN_MIN + (c.SPAWN_MAX - c.SPAWN_MIN) * rng();
    const a = rng() * Math.PI * 2;
    const x = from.x + r * Math.cos(a), z = from.z + r * Math.sin(a);
    if (isSpotOk(x, z)) spot = { x, z };
  }
  spot ??= { x: from.x + c.SPAWN_MIN, z: from.z };   // 자리를 못 찾으면(좁은 곳) 가까이에
  return { ...spot, samples: [], sum: 0, err: null, tier: null, startDist: Math.hypot(spot.x - from.x, spot.z - from.z) };
}

const nextAdGap = (rng, c) => c.ADV_INTERVAL + c.ADV_DELAY_MAX * rng(); // advInterval + advDelay(0~10 ms)
export const distanceToBeacon = (job, pos) => Math.max(RSSI_JOB.MIN_D, Math.hypot(pos.x - job.beacon.x, pos.z - job.beacon.z));

/**
 * @param {() => number} rng
 * @param {{ start: Pos, isSpotOk?: (x: number, z: number) => boolean }} opts
 * @returns {Job}
 */
export function createJob(rng, { start, isSpotOk = () => true }, c = RSSI_JOB) {
  return {
    phase: "search", timeLeft: c.DURATION, phaseTime: 0, clock: 0, nextAdIn: nextAdGap(rng, c),
    score: 0, beacon: newBeacon(rng, start, isSpotOk, c), anchor: { ...start }, live: [], lastPos: { ...start },
    isSpotOk, history: [], result: null
  };
}

/** 지금 서 있는 자리에서 모은 RSSI 평균 (없으면 null) */
export const averageRssi = (job) => (job.beacon.samples.length ? job.beacon.sum / job.beacon.samples.length : null);

/** "📍 여기다!" — 지금 자리를 비콘 위치로 신고한다. 판정 결과를 반환 */
export function markBeacon(job, pos, c = RSSI_JOB) {
  if (job.phase !== "search") return null;
  const b = job.beacon;
  b.err = Math.hypot(pos.x - b.x, pos.z - b.z);
  b.tier = judge(b.err, c);
  job.score += b.tier.points;
  job.history.push({ err: b.err, n: b.samples.length, points: b.tier.points, startDist: b.startDist });
  job.phase = "reveal";
  job.phaseTime = 0;
  return b.tier;
}

function finish(job, c) {
  job.phase = "done";
  job.timeLeft = 0;
  const rounds = job.history.length;
  const { grade, reward } = gradeSession(job.score, rounds, c);
  const avgN = rounds ? job.history.reduce((s, h) => s + h.n, 0) / rounds : 0;
  job.result = { score: job.score, rounds, grade, reward, avgN };
}

/**
 * 시간 진행. 찾는 중에는 광고 패킷이 도착할 때마다 지금 위치의 RSSI 샘플이 쌓인다.
 * 기사가 STILL_RADIUS보다 많이 움직이면 그 자리의 평균은 버리고 새 자리에서 다시 모은다.
 * @param {Pos} pos 기사의 현재 위치
 * @returns {Sample[]} 이번 스텝에 새로 받은 샘플
 */
export function stepJob(job, dt, rng, pos, c = RSSI_JOB) {
  if (job.phase === "done") return [];
  const received = [];
  job.timeLeft -= dt;
  job.phaseTime += dt;
  job.clock += dt;
  job.lastPos = { x: pos.x, z: pos.z };

  if (job.phase === "search") {
    if (Math.hypot(pos.x - job.anchor.x, pos.z - job.anchor.z) > c.STILL_RADIUS) {
      job.anchor = { x: pos.x, z: pos.z };     // 움직였다 → 새 자리에서 평균 다시
      job.beacon.samples = [];
      job.beacon.sum = 0;
    }
    job.nextAdIn -= dt;
    while (job.nextAdIn <= 0) {
      const rssi = meanRssiAt(distanceToBeacon(job, pos), c) + c.FADING_SIGMA * gaussian(rng);
      const s = { t: job.clock + job.nextAdIn, rssi };
      job.beacon.samples.push(s);
      job.beacon.sum += rssi;
      job.live.push(s);
      received.push(s);
      job.nextAdIn += nextAdGap(rng, c);
    }
    while (job.live.length && job.live[0].t < job.clock - c.LIVE_WINDOW) job.live.shift();
  } else if (job.phase === "reveal" && job.phaseTime >= c.REVEAL_TIME) {
    // 다음 비콘 — 지금 서 있는 곳에서 떨어진 새 자리에
    job.beacon = newBeacon(rng, pos, job.isSpotOk, c);
    job.anchor = { x: pos.x, z: pos.z };
    job.live = [];
    job.phase = "search";
    job.phaseTime = 0;
    job.nextAdIn = nextAdGap(rng, c);
  }

  if (job.timeLeft <= 0) finish(job, c);
  return received;
}
