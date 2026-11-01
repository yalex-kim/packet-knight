#!/usr/bin/env node
// 터미널 봇 시뮬레이션 (PRD §8) — 게임과 같은 src/core 로직을 Node에서 그대로 돌린다.
//
//   node scripts/simulate.mjs --game=rssi   --bots=2000 [--seed=1] [--json]   알바 (Stage 5)
//   node scripts/simulate.mjs --game=combat --bots=500  [--seed=1] [--json]   훈련장 전투 (Stage 6)
//
// 경제 전체(수급·소모) 시뮬레이션은 Stage 6.5에서 확장한다.

import { createRng } from "../src/core/quiz.js";
import { createJob, stepJob, confirmMeasurement } from "../src/core/rssiJob.js";
import { RSSI_JOB, PLAYER_BASE, TRAINING_GROUND, COMBAT, MONSTERS } from "../src/core/balance.js";
import { createBattle, syncPlayerHp, stepBattle, fireAdvPacket } from "../src/core/battle.js";
import { createMotor, stepMotor } from "../src/core/motor.js";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const BOTS = Number(args.bots ?? 2000);
const SEED = Number(args.seed ?? 1);
const DT = 1 / 60;
const REACTION = 0.35; // 사람 반응 지연: 보고 결심해서 누르기·움직이기까지 (초)

const GAME = args.game ?? "rssi";
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

function simulateRssi() {
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
  // (반응 지연 REACTION은 파일 상단 공용 상수)
  
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
  
  
  return report;
}

// ---------- 훈련장 전투 (Stage 6) ----------
/**
 * 전략: stand = 제자리에서 쏘기, kite = 봇이 다가오면 뒤로 물러나며 쏘기, rush = 봇에게 붙어서 쏘기
 * 세션 = 훈련장 입구에서 60초 동안 사냥. 봇 2마리가 리스폰한다.
 */
const COMBAT_STRATEGIES = [
  { name: "제자리 (stand)", mode: "stand" },
  { name: "회피 (kite)",    mode: "kite" },
  { name: "돌격 (rush)",    mode: "rush" }
];

function combatSession(strategy, rng) {
  const battle = createBattle(TRAINING_GROUND.spawns);
  syncPlayerHp(battle, PLAYER_BASE.hp);
  const pl = createMotor({ x: TRAINING_GROUND.x, y: 2, z: TRAINING_GROUND.z + 5 });
  pl.rotY = Math.PI;
  let kills = 0, cr2032 = 0, damage = 0, hits = 0, ko = 0, lowest = PLAYER_BASE.hp, regenObserved = false, wasHurt = false;
  for (let t = 0; t < 60; t += DT) {
    const ctx = { player: pl, stats: PLAYER_BASE, rng };
    const near = battle.monsters.filter((m) => m.state !== "dead").sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z))[0];
    let intent = { dirX: 0, dirZ: 0, speedScale: 0 };
    if (near) {
      const dx = near.x - pl.x, dz = near.z - pl.z, d = Math.hypot(dx, dz);
      // 카이팅: 봇의 예고 동작(windup)을 보면 사람 반응 지연 뒤 사거리 밖으로 물러난다
      const threat = battle.monsters.find((m) => m.state === "windup" && Math.hypot(m.x - pl.x, m.z - pl.z) < 2.2
        && m.t < MONSTERS[m.type].windup - REACTION);
      if (strategy.mode === "kite" && threat) {
        const tx = pl.x - threat.x, tz = pl.z - threat.z, td = Math.hypot(tx, tz) || 1;
        intent = { dirX: tx / td, dirZ: tz / td, speedScale: 1 };
      }
      if (strategy.mode === "rush" && d > 1.2) intent = { dirX: dx / d, dirZ: dz / d, speedScale: 1 };
      if (strategy.mode !== "stand" && d > 9) intent = { dirX: dx / d, dirZ: dz / d, speedScale: 1 };
      pl.rotY = Math.atan2(dx, dz);
    }
    stepMotor(pl, intent, DT);
    if (near) fireAdvPacket(battle, pl, near);
    const before = battle.player.hp;
    for (const e of stepBattle(battle, DT, ctx)) {
      if (e.type === "kill") { kills++; cr2032 += e.drops.filter((d) => d.item === "cr2032").reduce((n, d) => n + d.count, 0); }
      if (e.type === "playerHit") { damage += e.amount; hits++; wasHurt = true; }
      if (e.type === "ko") { ko++; battle.player.hp = battle.player.maxHp; }
    }
    if (wasHurt && battle.player.hp > before) regenObserved = true;
    lowest = Math.min(lowest, battle.player.hp);
  }
  return { kills, cr2032, damage, hits, ko, lowest, regenObserved };
}

function simulateCombat() {
  const report = { game: "combat", bots: BOTS, seed: SEED, fireCooldown: COMBAT.ADV_PACKET.cooldown, strategies: [] };
  for (const s of COMBAT_STRATEGIES) {
    const rng = createRng(SEED);
    const runs = Array.from({ length: BOTS }, () => combatSession(s, rng));
    report.strategies.push({
      name: s.name,
      killsPerMin: +mean(runs.map((r) => r.kills)).toFixed(1),
      damagePerKill: +mean(runs.map((r) => r.damage / Math.max(1, r.kills))).toFixed(1),
      hurtPct: Math.round(100 * mean(runs.map((r) => (r.hits > 0 ? 1 : 0)))),
      regenPct: Math.round(100 * mean(runs.map((r) => (r.regenObserved ? 1 : 0)))),
      lowestHp: Math.round(mean(runs.map((r) => r.lowest))),
      koPct: Math.round(100 * mean(runs.map((r) => (r.ko > 0 ? 1 : 0)))),
      cr2032PerMin: +mean(runs.map((r) => r.cr2032)).toFixed(1)
    });
  }
  return report;
}

const report = GAME === "combat" ? simulateCombat() : simulateRssi();

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else if (GAME === "combat") {
  console.log(`🤖 훈련장 전투 시뮬레이션 — 봇 ${BOTS}명 × 전략 ${COMBAT_STRATEGIES.length}개 × 60초 (seed ${SEED}, 발사 간격 ${report.fireCooldown}s)\n`);
  console.log("전략              처치/분  CR2032/분  피해/처치  피격%  회복%  최저HP  KO%");
  for (const r of report.strategies) {
    console.log(`${r.name.padEnd(15)} ${String(r.killsPerMin).padStart(7)}  ${String(r.cr2032PerMin).padStart(9)}  ${String(r.damagePerKill).padStart(8)}  ${String(r.hurtPct).padStart(5)}  ${String(r.regenPct).padStart(5)}  ${String(r.lowestHp).padStart(6)}  ${String(r.koPct).padStart(4)}`);
  }
} else {
  console.log(`🤖 RSSI 알바 시뮬레이션 — 봇 ${BOTS}명 × 전략 ${report.strategies.length}개 (seed ${SEED}, 등급 ${report.grades.join(" ")})\n`);
  console.log("전략            평균점수   p10~p90      비콘수  CR2032   S%  A%  B%  C%");
  for (const r of report.strategies) {
    const g = r.gradePct;
    console.log(`${r.name.padEnd(14)} ${String(r.meanScore).padStart(7)}  ${`${r.p10}~${r.p90}`.padStart(11)}  ${String(r.meanRounds).padStart(6)}  ${String(r.meanCR2032).padStart(6)}  ${[g.S, g.A, g.B, g.C].map((v) => String(v).padStart(3)).join(" ")}`);
  }
}
