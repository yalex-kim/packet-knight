// 알바(RSSI 측정) 봇 — 게임과 같은 core/rssiJob.js를 돌린다
import { createJob, stepJob, confirmMeasurement } from "../../src/core/rssiJob.js";

export const DT = 1 / 60;
export const REACTION = 0.35; // 사람 반응 지연 (초)

/** 봇 전략: 패킷 targetN개를 모으면 반응 지연 뒤 확정 */
export const RSSI_STRATEGIES = [
  { name: "성급 (N=1)", targetN: 1 },
  { name: "조급 (N=3)", targetN: 3 },
  { name: "적당 (N=6)", targetN: 6 },
  { name: "평균 (N=10)", targetN: 10 },
  { name: "신중 (N=15)", targetN: 15 },
  { name: "느긋 (N=25)", targetN: 25 },
  { name: "과신중 (N=40)", targetN: 40 }
];

export function rssiSession(targetN, rng) {
  const job = createJob(rng);
  let readyAt = null;
  while (job.phase !== "done") {
    stepJob(job, DT, rng);
    if (job.phase !== "measure") { readyAt = null; continue; }
    if (readyAt === null && job.beacon.samples.length >= targetN) readyAt = job.phaseTime + REACTION;
    if (readyAt !== null && job.phaseTime >= readyAt) confirmMeasurement(job);
  }
  return job.result;
}
