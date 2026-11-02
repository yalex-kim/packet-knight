// 알바: 비콘 신호 측정소 — RSSI 거리 측정 미니게임 상태 기계 (PRD §4.2). 순수 로직 (THREE·DOM 의존 없음)
//
// 모델 (connectivityBook location.html 시뮬레이터와 동일):
//   RSSI = P1m − 10·n·log10(d) + N(0, σ²)     P1m = −59 dBm, n = 2.7 (집 환경)
// 플레이어는 광고 패킷마다 흔들리는 RSSI의 누적 평균으로 거리를 추정하고, 원하는 순간에 "측정 확정"한다.
// 평균에 쓰는 패킷이 많을수록 오차가 1/√N 로 줄지만, 60초 안에 측정할 수 있는 비콘 수는 줄어든다.

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

/** 배율 오차 (≥ 1): 거리 추정 오차는 dB 오차가 지수로 바뀐 "배율"이다 */
export const ratioError = (est, truth) => Math.max(est / truth, truth / est);

/** 배율 오차 → 판정 */
export function judge(ratio, c = RSSI_JOB) {
  for (const tier of c.TIERS) if (ratio <= tier.maxRatio) return tier;
  return c.MISS;
}

/** 세션 점수 → 등급·보수 (PRD §8.4 알바 보수 S/A/B/C) */
export function gradeSession(score, rounds, c = RSSI_JOB) {
  if (rounds === 0) return { grade: "-", reward: 0 };
  for (const g of c.GRADES) if (score >= g.minScore) return { grade: g.grade, reward: g.reward };
  return { grade: "C", reward: c.GRADES[c.GRADES.length - 1].reward };
}

/**
 * @typedef {{ t: number, rssi: number }} Sample
 * @typedef {{ distance: number, samples: Sample[], sum: number, estimate: number|null, ratio: number|null, tier: object|null }} Beacon
 * @typedef {{
 *   phase: "measure"|"reveal"|"done", timeLeft: number, phaseTime: number, nextAdIn: number,
 *   score: number, beacon: Beacon, history: Array<{ distance: number, estimate: number, n: number, ratio: number, points: number }>,
 *   result: null | { score: number, rounds: number, grade: string, reward: number, avgN: number }
 * }} Job
 */

function newBeacon(rng, c) {
  // 거리는 로그 균등 분포 — 가까운 비콘과 먼 비콘이 고르게 나온다
  const lo = Math.log(c.MIN_DIST), hi = Math.log(c.MAX_DIST);
  return { distance: Math.exp(lo + (hi - lo) * rng()), samples: [], sum: 0, estimate: null, ratio: null, tier: null };
}

const nextAdGap = (rng, c) => c.ADV_INTERVAL + c.ADV_DELAY_MAX * rng(); // advInterval + advDelay(0~10 ms)

/** @returns {Job} */
export function createJob(rng, c = RSSI_JOB) {
  return {
    phase: "measure", timeLeft: c.DURATION, phaseTime: 0, nextAdIn: nextAdGap(rng, c),
    score: 0, beacon: newBeacon(rng, c), history: [], result: null
  };
}

/** 현재 비콘에서 지금까지 받은 RSSI 평균 (없으면 null) */
export const averageRssi = (job) => (job.beacon.samples.length ? job.beacon.sum / job.beacon.samples.length : null);

/** 측정 확정 — 성공하면 판정 결과를 반환 */
export function confirmMeasurement(job, c = RSSI_JOB) {
  if (job.phase !== "measure" || job.beacon.samples.length < c.MIN_SAMPLES) return null;
  const b = job.beacon;
  b.estimate = distanceFromRssi(averageRssi(job), c);
  b.ratio = ratioError(b.estimate, b.distance);
  b.tier = judge(b.ratio, c);
  job.score += b.tier.points;
  job.history.push({ distance: b.distance, estimate: b.estimate, n: b.samples.length, ratio: b.ratio, points: b.tier.points });
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
 * 시간 진행. 측정 중에는 광고 패킷이 도착할 때마다 RSSI 샘플이 쌓인다.
 * @returns {Sample[]} 이번 스텝에 새로 받은 샘플
 */
export function stepJob(job, dt, rng, c = RSSI_JOB) {
  if (job.phase === "done") return [];
  const received = [];
  job.timeLeft -= dt;
  job.phaseTime += dt;

  if (job.phase === "measure") {
    job.nextAdIn -= dt;
    while (job.nextAdIn <= 0) {
      const rssi = meanRssiAt(job.beacon.distance, c) + c.FADING_SIGMA * gaussian(rng);
      const s = { t: job.phaseTime + job.nextAdIn, rssi };
      job.beacon.samples.push(s);
      job.beacon.sum += rssi;
      received.push(s);
      job.nextAdIn += nextAdGap(rng, c);
    }
  } else if (job.phase === "reveal" && job.phaseTime >= c.REVEAL_TIME) {
    // 다음 비콘으로 (비콘 교체 시간 포함)
    job.beacon = newBeacon(rng, c);
    job.phase = "measure";
    job.phaseTime = 0;
    job.nextAdIn = nextAdGap(rng, c);
  }

  if (job.timeLeft <= 0) finish(job, c);
  return received;
}
