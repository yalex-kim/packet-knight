#!/usr/bin/env node
// 터미널 봇 시뮬레이션 (PRD §8) — 게임과 같은 src/core 로직을 Node에서 그대로 돌린다.
//
//   node scripts/simulate.mjs                          전체: 알바 + 훈련장 + 1시간 경제 → §8.3 판정 + 보고서 저장
//   node scripts/simulate.mjs --bots=1000 --strategy=all
//   node scripts/simulate.mjs --game=rssi   --bots=2000 [--json]   알바 전략 비교 (Stage 5)
//   node scripts/simulate.mjs --game=combat --bots=300  [--json]   훈련장 전략 비교 (Stage 6)
//   node scripts/simulate.mjs --game=economy --strategy=balanced   1시간 경제만
//
// 옵션: --seed=1 · --json(표준 출력을 JSON으로) · --no-write(보고서 파일 저장 안 함)
// 보고서: scripts/report/balance-report.json — §8.3 기준선 판정 포함. 기준선을 벗어나면 종료 코드 1.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRng } from "../src/core/quiz.js";
import { RSSI_JOB, PLAYER_BASE, COMBAT, ECONOMY, LIBRARY_COURSES, DUNGEON, UPGRADE, GEAR } from "../src/core/balance.js";
import { applyGear } from "../src/core/gear.js";
import { RSSI_STRATEGIES, rssiSession } from "./lib/rssi.mjs";
import { COMBAT_STRATEGIES, trainingSession, dungeonFloor } from "./lib/combat.mjs";
import { PLAYER_STRATEGIES, buildPools, playHour, targetSpend, statsWithQuiz } from "./lib/economy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(ROOT, "scripts/report/balance-report.json");

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const GAME = args.game ?? "all";
const SEED = Number(args.seed ?? 1);
const BOTS = Number(args.bots ?? (GAME === "rssi" ? 2000 : GAME === "combat" ? 300 : 1000));
const STRATEGY = args.strategy ?? "all";

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const pct = (x) => Math.round(x * 1000) / 10;
const r1 = (x) => Math.round(x * 10) / 10;

// ---------- 알바 (Stage 5) ----------
function simulateRssi(bots) {
  const report = { bots, grades: RSSI_JOB.GRADES.map((g) => (Number.isFinite(g.minScore) ? `${g.grade}≥${g.minScore}` : `${g.grade}(참가)`)), strategies: [] };
  for (const s of RSSI_STRATEGIES) {
    const rng = createRng(SEED);
    const scores = [], rewards = [], rounds = [];
    const dist = { S: 0, A: 0, B: 0, C: 0, "-": 0 };
    for (let i = 0; i < bots; i++) {
      const r = rssiSession(s.targetN, rng);
      scores.push(r.score); rewards.push(r.reward); rounds.push(r.rounds); dist[r.grade]++;
    }
    scores.sort((a, b) => a - b);
    report.strategies.push({
      name: s.name, meanScore: Math.round(mean(scores)),
      p10: scores[Math.floor(bots * 0.1)], p90: scores[Math.floor(bots * 0.9)],
      meanRounds: r1(mean(rounds)), meanCR2032: +mean(rewards).toFixed(2),
      gradePct: Object.fromEntries(["S", "A", "B", "C"].map((k) => [k, Math.round((dist[k] / bots) * 100)]))
    });
  }
  return report;
}

// ---------- 훈련장 (Stage 6) ----------
function simulateCombat(bots) {
  const report = { bots, fireCooldown: COMBAT.ADV_PACKET.cooldown, strategies: [] };
  for (const s of COMBAT_STRATEGIES) {
    const rng = createRng(SEED);
    const runs = Array.from({ length: bots }, () => trainingSession(s.mode, PLAYER_BASE, rng));
    report.strategies.push({
      name: s.name,
      killsPerMin: r1(mean(runs.map((r) => r.kills))),
      cr2032PerMin: r1(mean(runs.map((r) => r.cr2032))),
      damagePerKill: r1(mean(runs.map((r) => r.damage / Math.max(1, r.kills)))),
      hurtPct: Math.round(100 * mean(runs.map((r) => (r.hits > 0 ? 1 : 0)))),
      regenPct: Math.round(100 * mean(runs.map((r) => (r.regenObserved ? 1 : 0)))),
      lowestHp: Math.round(mean(runs.map((r) => r.lowest))),
      koPct: Math.round(100 * mean(runs.map((r) => (r.ko > 0 ? 1 : 0))))
    });
  }
  return report;
}

// ---------- 던전 층 난이도 곡선 (Stage 7 가정치) ----------
function dungeonCurve(samples = 200) {
  const rows = [];
  for (const mode of ["stand", "kite", "rush"]) {
    for (let lv = 0; lv <= 4; lv++) {
      const rng = createRng(SEED + lv);
      const stats = applyGear(statsWithQuiz(PLAYER_BASE, LIBRARY_COURSES.length), Object.fromEntries(Object.keys(GEAR).map((k) => [k, lv])));
      const rr = Array.from({ length: samples }, () => dungeonFloor(mode, stats, rng));
      const cl = rr.filter((r) => r.cleared);
      rows.push({ mode, gear: lv, clearPct: pct(cl.length / samples), koPct: pct(rr.filter((r) => r.ko).length / samples), clearTime: r1(mean(cl.map((r) => r.time))) });
    }
  }
  return rows;
}

/** 같은 장비에서 퀴즈 보너스 유무에 따른 "기대 클리어 소요 시간"(실패 재시도 포함) 비교 */
function quizContribution(samples = 300) {
  const out = [];
  for (const lv of [1, 2]) {
    const gear = Object.fromEntries(Object.keys(GEAR).map((k) => [k, lv]));
    const row = { gear: lv };
    for (const [label, courses] of [["without", 0], ["with", LIBRARY_COURSES.length]]) {
      const rng = createRng(SEED + 100 + lv);
      const stats = applyGear(statsWithQuiz(PLAYER_BASE, courses), gear);
      const rr = Array.from({ length: samples }, () => dungeonFloor("kite", stats, rng));
      const clears = rr.filter((r) => r.cleared).length;
      const totalTime = rr.reduce((a, r) => a + r.time + 40, 0); // 입장 오버헤드 포함
      row[label] = { clearPct: pct(clears / samples), expectedTimePerClear: clears ? Math.round(totalTime / clears) : Infinity };
    }
    row.speedup = Number.isFinite(row.without.expectedTimePerClear)
      ? r1((1 - row.with.expectedTimePerClear / row.without.expectedTimePerClear) * 100) : null;
    out.push(row);
  }
  return out;
}

// ---------- 1시간 경제 (Stage 6.5) ----------
function simulateEconomy(bots, strategies) {
  const pools = buildPools(createRng(SEED));
  const target = targetSpend();
  const rows = [];
  for (const s of strategies) {
    for (const quiz of [true, false]) {
      const runs = Array.from({ length: bots }, () => playHour(s, pools, { quiz }));
      const income = runs.map((r) => r.income.job + r.income.training + r.income.dungeon);
      const firstClear = runs.map((r) => r.dungeon.firstClearAt).filter((x) => x !== null);
      rows.push({
        strategy: s.id, name: s.name, quiz,
        income: r1(mean(income)),
        incomeBySource: { job: r1(mean(runs.map((r) => r.income.job))), training: r1(mean(runs.map((r) => r.income.training))), dungeon: r1(mean(runs.map((r) => r.income.dungeon))) },
        spend: { upgrade: r1(mean(runs.map((r) => r.spend.upgrade))), fee: r1(mean(runs.map((r) => r.spend.fee))), penalty: r1(mean(runs.map((r) => r.spend.penalty))) },
        available: r1(mean(runs.map((r) => r.income.job + r.income.training + r.income.dungeon - r.spend.fee - r.spend.penalty))),
        surplusVsTarget: pct(mean(runs.map((r) => r.income.job + r.income.training + r.income.dungeon - r.spend.fee - r.spend.penalty)) / target.total - 1),
        upgradesSucceeded: r1(mean(runs.map((r) => r.upgrades.success))),
        level: r1(mean(runs.map((r) => r.level))),
        dungeonAttempts: r1(mean(runs.map((r) => r.dungeon.attempts))),
        dungeonClearPct: pct(mean(runs.map((r) => r.dungeon.clears)) / Math.max(1e-9, mean(runs.map((r) => r.dungeon.attempts)))),
        reachedClearPct: pct(firstClear.length / bots),
        floorsCleared: r1(mean(runs.map((r) => r.dungeon.floor - 1))),
        firstClearMin: r1(mean(firstClear) / 60),
        kosBeforeFirstClear: r1(mean(runs.filter((r) => r.dungeon.firstClearAt !== null).map((r) => r.dungeon.kosBeforeFirstClear))),
        endBalance: r1(mean(runs.map((r) => r.cr)))
      });
    }
  }
  return { bots, target: { upgrade: r1(target.upgrade), total: r1(target.total) }, rows, cacheSize: pools.dungeon.size };
}

// ---------- §8.3 기준선 판정 ----------
function judge(econ, quiz) {
  const bal = econ.rows.find((r) => r.strategy === "balanced" && r.quiz);
  const balNoQuiz = econ.rows.find((r) => r.strategy === "balanced" && !r.quiz);
  const speedups = quiz.map((q) => q.speedup).filter((x) => x !== null);
  const within = (x, lo, hi) => x >= lo && x <= hi;
  return [
    { id: "clearRate", label: "던전 층 클리어율 (중간 전략, 도전 중인 가장 깊은 층 기준 1시간 전체 시도)", target: "40~70%", value: `${bal.dungeonClearPct}%`, pass: within(bal.dungeonClearPct, 40, 70) },
    { id: "questTime", label: "첫 던전 클리어까지 시간 (퀘스트 완료 시간의 대리 지표, 중간 전략)", target: "10~20분", value: `${bal.firstClearMin}분`, pass: within(bal.firstClearMin, 10, 20),
      note: "Stage 9 퀘스트 구현 후 실제 퀘스트 완료 시간으로 교체" },
    { id: "surplus", label: "CR2032 수지 ((수급 − 입장료 − 페널티) / 목표 강화 비용 − 1, 중간 전략)", target: `+${ECONOMY.SURPLUS_MIN * 100}~+${ECONOMY.SURPLUS_MAX * 100}%`, value: `${bal.surplusVsTarget >= 0 ? "+" : ""}${bal.surplusVsTarget}%`,
      pass: within(bal.surplusVsTarget, ECONOMY.SURPLUS_MIN * 100, ECONOMY.SURPLUS_MAX * 100) },
    { id: "timeouts", label: "첫 클리어 전 타임아웃(KO) 횟수 평균 (중간 전략)", target: "≤ 3회", value: `${bal.kosBeforeFirstClear}회`, pass: bal.kosBeforeFirstClear <= 3 },
    { id: "quizOptional", label: "퀴즈 보너스 없이도 클리어 가능 (중간 전략, 퀴즈 생략 시 1시간 내 첫 클리어 도달률)", target: "≥ 80%", value: `${balNoQuiz.reachedClearPct}%`, pass: balNoQuiz.reachedClearPct >= 80 },
    { id: "quizSpeedup", label: "퀴즈 보너스로 던전 클리어가 빨라지는 정도 (같은 장비, 기대 소요 시간, 첫 클리어가 일어나는 장비 +1·+2 평균)", target: "≥ 20%",
      value: `평균 ${r1(mean(speedups))}% (+1: ${speedups[0]}%, +2: ${speedups[1]}%)`, pass: speedups.length > 0 && mean(speedups) >= 20 },
    { id: "quizWorthIt", label: "공부한 시간까지 따져도 퀴즈가 이득 (중간 전략 1시간: 첫 클리어 시간 퀴즈 O / 퀴즈 X)", target: "≤ 0.8배",
      value: `첫 클리어 ${bal.firstClearMin}분 / ${balNoQuiz.firstClearMin}분 = ${(bal.firstClearMin / balNoQuiz.firstClearMin).toFixed(2)}배 · 도달 층 ${bal.floorsCleared} / ${balNoQuiz.floorsCleared} = ${(bal.floorsCleared / balNoQuiz.floorsCleared).toFixed(2)}배`,
      pass: bal.firstClearMin <= 0.8 * balNoQuiz.firstClearMin, gating: false,
      note: "관찰 지표(Stage 6.5 추가, 합격 판정 제외) — 공부 시간의 기회비용까지 따진 학습 인센티브. 목표치는 PRD §8.7 결정 대기" }
  ];
}

// ---------- 실행 ----------
const t0 = performance.now();
const strategies = STRATEGY === "all" ? PLAYER_STRATEGIES : PLAYER_STRATEGIES.filter((s) => s.id === STRATEGY);
if (strategies.length === 0) { console.error(`알 수 없는 전략: ${STRATEGY} (${PLAYER_STRATEGIES.map((s) => s.id).join(", ")})`); process.exit(2); }

if (GAME === "rssi") {
  const report = simulateRssi(BOTS);
  if (args.json) console.log(JSON.stringify({ game: "rssi", seed: SEED, ...report }, null, 2));
  else {
    console.log(`🤖 RSSI 알바 — 봇 ${BOTS}명 × 전략 ${report.strategies.length}개 (seed ${SEED}, 등급 ${report.grades.join(" ")})\n`);
    console.log("전략            평균점수   p10~p90      비콘수  CR2032   S%  A%  B%  C%");
    for (const r of report.strategies) {
      const g = r.gradePct;
      console.log(`${r.name.padEnd(14)} ${String(r.meanScore).padStart(7)}  ${`${r.p10}~${r.p90}`.padStart(11)}  ${String(r.meanRounds).padStart(6)}  ${String(r.meanCR2032).padStart(6)}  ${[g.S, g.A, g.B, g.C].map((v) => String(v).padStart(3)).join(" ")}`);
    }
  }
  process.exit(0);
}

if (GAME === "combat") {
  const report = simulateCombat(BOTS);
  if (args.json) console.log(JSON.stringify({ game: "combat", seed: SEED, ...report }, null, 2));
  else {
    console.log(`🤖 훈련장 전투 — 봇 ${BOTS}명 × 전략 ${report.strategies.length}개 × 60초 (seed ${SEED}, 발사 간격 ${report.fireCooldown}s)\n`);
    console.log("전략              처치/분  CR2032/분  피해/처치  피격%  회복%  최저HP  KO%");
    for (const r of report.strategies) {
      console.log(`${r.name.padEnd(15)} ${String(r.killsPerMin).padStart(7)}  ${String(r.cr2032PerMin).padStart(9)}  ${String(r.damagePerKill).padStart(8)}  ${String(r.hurtPct).padStart(5)}  ${String(r.regenPct).padStart(5)}  ${String(r.lowestHp).padStart(6)}  ${String(r.koPct).padStart(4)}`);
    }
  }
  process.exit(0);
}

// 전체 / 경제
const report = {
  generatedBy: "node scripts/simulate.mjs",
  // 스모크 테스트가 이 값으로 "balance.js를 고친 뒤 시뮬레이션을 다시 돌렸는지" 확인한다
  balanceHash: createHash("sha256").update(readFileSync(path.join(ROOT, "src/core/balance.js"))).digest("hex").slice(0, 16),
  seed: SEED, bots: BOTS, strategy: STRATEGY,
  assumptions: {
    hour: `${ECONOMY.LOOPS}루프 × ${ECONOMY.HOUR / ECONOMY.LOOPS / 60}분`,
    targetSpend: `강화 ${ECONOMY.TARGET_UPGRADES}회 성공(장비 ${Object.keys(GEAR).length}종 고르게) 기대 비용. 수지 = (수급 − 입장료 − 페널티) / 목표 − 1`,
    upgrade: `비용 round(${UPGRADE.BASE}×${UPGRADE.GROWTH}^n), 성공률 max(30%, 95%−10%p×n)`,
    dungeon: `Stage 7 구현(core/dungeon.js) — 한 층 = Wi-Fi 간섭 몬스터 ${DUNGEON.FLOOR_MONSTERS}마리(층마다 체력 +${DUNGEON.FLOOR_HP_SCALE * 100}%), 반경 10 m 방, 입장료 ${DUNGEON.ENTRY_FEE}, 클리어 후 링크 퍼즐 60초`,
    playerStrategies: PLAYER_STRATEGIES
  }
};
if (GAME === "all") {
  report.rssi = simulateRssi(Math.min(BOTS, 1000));
  report.training = simulateCombat(Math.min(BOTS, 300));
  report.dungeonCurve = dungeonCurve();
  report.quizContribution = quizContribution();
}
report.economy = simulateEconomy(BOTS, strategies);
if (GAME === "all" && STRATEGY === "all") report.criteria = judge(report.economy, report.quizContribution);
report.elapsedSec = r1((performance.now() - t0) / 1000);

if (!args["no-write"] && GAME === "all") {
  mkdirSync(path.dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
}

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`🤖 Packet Knight 봇 시뮬레이션 — 봇 ${BOTS}명/전략, seed ${SEED}, ${report.elapsedSec}초\n`);
  if (report.dungeonCurve) {
    console.log("■ 던전 1층 난이도 (퀴즈 보너스 포함, 장비 4종 같은 레벨)");
    console.log("  전투      +0      +1      +2      +3      +4   (클리어%)");
    for (const mode of ["stand", "kite", "rush"]) {
      const row = report.dungeonCurve.filter((r) => r.mode === mode).map((r) => `${r.clearPct}%`.padStart(6)).join("  ");
      console.log(`  ${mode.padEnd(6)} ${row}`);
    }
    console.log("");
  }
  const e = report.economy;
  console.log(`■ 1시간 경제 (목표 강화 비용 ${e.target.total} = 강화 ${ECONOMY.TARGET_UPGRADES}회 성공 기대 비용)`);
  console.log("  전략                 퀴즈  수급   (알바/사냥/던전)      입장료·페널티 뺀 몫  수지    강화성공  던전시도  클리어%  첫클리어  KO(첫클리어 전)  도달 층");
  for (const r of e.rows) {
    const src = `${r.incomeBySource.job}/${r.incomeBySource.training}/${r.incomeBySource.dungeon}`;
    console.log(`  ${r.name.padEnd(17)} ${r.quiz ? " O " : " X "}  ${String(r.income).padStart(5)}  ${src.padEnd(18)}  ${String(r.available).padStart(8)}  ${(r.surplusVsTarget >= 0 ? "+" : "") + r.surplusVsTarget + "%"}`.padEnd(88)
      + `${String(r.upgradesSucceeded).padStart(6)}  ${String(r.dungeonAttempts).padStart(7)}  ${(r.dungeonClearPct + "%").padStart(7)}  ${(Number.isNaN(r.firstClearMin) ? "-" : r.firstClearMin + "분").padStart(7)}  ${String(r.kosBeforeFirstClear).padStart(6)}  ${String(r.floorsCleared).padStart(10)}`);
  }
  if (report.quizContribution) {
    console.log("\n■ 퀴즈 보너스 기여도 (회피 전투, 같은 장비, 기대 클리어 소요 시간)");
    for (const q of report.quizContribution) {
      console.log(`  장비 +${q.gear}: 보너스 없음 ${q.without.expectedTimePerClear}s (클리어 ${q.without.clearPct}%) → 있음 ${q.with.expectedTimePerClear}s (클리어 ${q.with.clearPct}%) · ${q.speedup ?? "-"}% 단축`);
    }
  }
  if (report.criteria) {
    console.log("\n■ PRD §8.3 기준선");
    for (const c of report.criteria) console.log(`  ${c.pass ? "✅" : c.gating === false ? "⚠️" : "❌"} ${c.label}: ${c.value} (목표 ${c.target})${c.note ? ` — ${c.note}` : ""}`);
    if (!args["no-write"]) console.log(`\n보고서 → ${path.relative(ROOT, REPORT)}`);
  }
}
if (report.criteria && report.criteria.some((c) => !c.pass && c.gating !== false)) process.exit(1);
