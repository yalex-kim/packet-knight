#!/usr/bin/env node
// 터미널 봇 시뮬레이션 (PRD §8) — 게임과 같은 src/core 로직을 Node에서 그대로 돌린다.
//
//   node scripts/simulate.mjs --game=rssi --bots=2000 [--seed=1] [--json]
//
// 현재 지원: rssi (Stage 5 알바 미니게임). 전투·경제 전체 시뮬레이션은 Stage 6.5에서 확장한다.

import { createRng } from "../src/core/quiz.js";
import { createJob, stepJob, confirmMeasurement } from "../src/core/rssiJob.js";
import { RSSI_JOB } from "../src/core/balance.js";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const BOTS = Number(args.bots ?? 2000);
const SEED = Number(args.seed ?? 1);
const DT = 1 / 60;

/**
 * 봇 전략: 패킷 targetN개를 모으면 확정. 사람의 반응 지연(reaction 초)을 더한다.
 * "impatient"는 첫 패킷에 바로 누르는 플레이어, "patient"는 3초를 기다리는 플레이어 등.
 */
const STRATEGIES = [
  { name: "성급 (N=1)",        targetN: 1 },
  { name: "조급 (N=3)",        targetN: 3 },
  { name: "적당 (N=6)",        targetN: 6 },
  { name: "평균 (N=10)",       targetN: 10 },
  { name: "신중 (N=15)",       targetN: 15 },
  { name: "느긋 (N=25)",       targetN: 25 },
  { name: "과신중 (N=40)",     targetN: 40 }
];
const REACTION = 0.35; // 확정을 결심하고 누르기까지 (초)

function runSession(strategy, rng) {
  const job = createJob(rng);
  let readyAt = null;
  while (job.phase !== "done") {
    stepJob(job, DT, rng);
    if (job.phase !== "measure") { readyAt = null; continue; }
    if (readyAt === null && job.beacon.samples.length >= strategy.targetN) readyAt = job.phaseTime + REACTION;
    if (readyAt !== null && job.phaseTime >= readyAt) confirmMeasurement(job);
  }
  return job.result;
}

const report = { game: "rssi", bots: BOTS, seed: SEED, grades: RSSI_JOB.GRADES.map((g) => (Number.isFinite(g.minScore) ? `${g.grade}≥${g.minScore}` : `${g.grade}(참가)`)), strategies: [] };
for (const s of STRATEGIES) {
  const rng = createRng(SEED);
  const scores = [], rewards = [], rounds = [];
  const dist = { S: 0, A: 0, B: 0, C: 0, "-": 0 };
  for (let i = 0; i < BOTS; i++) {
    const r = runSession(s, rng);
    scores.push(r.score); rewards.push(r.reward); rounds.push(r.rounds); dist[r.grade]++;
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  scores.sort((a, b) => a - b);
  report.strategies.push({
    name: s.name,
    meanScore: Math.round(mean(scores)),
    p10: scores[Math.floor(BOTS * 0.1)], p90: scores[Math.floor(BOTS * 0.9)],
    meanRounds: +mean(rounds).toFixed(1),
    meanCR2032: +mean(rewards).toFixed(2),
    gradePct: Object.fromEntries(Object.entries(dist).filter(([k]) => k !== "-").map(([k, v]) => [k, Math.round((v / BOTS) * 100)]))
  });
}

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`🤖 RSSI 알바 시뮬레이션 — 봇 ${BOTS}명 × 전략 ${STRATEGIES.length}개 (seed ${SEED}, 등급 ${report.grades.join(" ")})\n`);
  console.log("전략            평균점수   p10~p90      비콘수  CR2032   S%  A%  B%  C%");
  for (const r of report.strategies) {
    const g = r.gradePct;
    console.log(`${r.name.padEnd(14)} ${String(r.meanScore).padStart(7)}  ${`${r.p10}~${r.p90}`.padStart(11)}  ${String(r.meanRounds).padStart(6)}  ${String(r.meanCR2032).padStart(6)}  ${[g.S, g.A, g.B, g.C].map((v) => String(v).padStart(3)).join(" ")}`);
  }
}
