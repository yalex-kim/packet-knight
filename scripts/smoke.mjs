#!/usr/bin/env node
// Packet Knight — 스테이지 DoD 스모크 테스트 (headless Chromium)
//
//   npm install && npm run smoke      (또는 node scripts/smoke.mjs)
//
// - PRD §7의 각 스테이지 DoD 문장을 assert로 옮긴다. 스테이지를 끝낼 때 이 스크립트가 통과해야 커밋한다.
// - node_modules/three 가 있으면 CDN 대신 그 사본을 쓴다(오프라인·CDN 차단 환경 대응). 없으면 CDN에서 받는다.
// - 게임은 window.__PK 훅으로 상태를 노출한다. `?test` 모드에서는 실시간 루프가 시뮬레이션을 멈추고
//   테스트가 __PK.tick(초)로 고정 1/60초 스텝을 진행시킨다 → 헤드리스 FPS와 무관하게 결정적.

import { createRequire } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_THREE = path.join(ROOT, "node_modules/three/build/three.module.js");
const ORIGIN = "http://packet-knight.test";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `  — ${detail}` : ""}`);
}
const fmt = (s) => `(${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)})`;

// ---------- Stage 3.5: 순수 로직 계층은 Node에서 THREE·DOM 없이 import 된다 ----------
{
  const coreDir = path.join(ROOT, "src/core");
  const files = readdirSync(coreDir).filter((f) => f.endsWith(".js"));
  const leaks = files.filter((f) => /from\s+["']three["']|\b(window|document)\./.test(readFileSync(path.join(coreDir, f), "utf8")));
  check("src/core/ 는 THREE·DOM에 의존하지 않는다", leaks.length === 0, leaks.join(", ") || `${files.length}개 모듈`);
  try {
    const { createMotor, stepMotor } = await import(pathToFileURL(path.join(coreDir, "motor.js")).href);
    const { SPAWN_POS } = await import(pathToFileURL(path.join(coreDir, "layout.js")).href);
    const m = createMotor(SPAWN_POS);
    for (let i = 0; i < 60; i++) stepMotor(m, { dirX: 0, dirZ: 1, speedScale: 1 }, 1 / 60);
    check("Node에서 이동 물리(core/motor)를 단독 실행할 수 있다", m.z - SPAWN_POS.z > 5 && m.grounded, `1초 후 z ${m.z.toFixed(2)}`);
  } catch (e) {
    check("Node에서 이동 물리(core/motor)를 단독 실행할 수 있다", false, e.message);
  }
}

// ---------- Stage 4: 교과서 퀴즈 데이터 & 진행도 로직 (Node) ----------
{
  const imp = (f) => import(pathToFileURL(path.join(ROOT, "src/core", f)).href);
  const { CHAPTERS } = await imp("chapters.data.js");
  const { LIBRARY_COURSES } = await imp("balance.js");
  const bad = CHAPTERS.flatMap((c) => c.questions
    .filter((q) => !(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length && q.options.length >= 2 && q.explain))
    .map((q) => `${c.id}: ${q.q}`));
  const thin = CHAPTERS.filter((c) => c.questions.length < 3 || c.keypoints.length === 0).map((c) => c.id);
  const missing = LIBRARY_COURSES.filter((l) => !CHAPTERS.some((c) => c.id === l.chapter)).map((l) => l.chapter);
  check("교과서 퀴즈 데이터가 유효하다 (정답 1개·해설·3문항 이상)", bad.length + thin.length + missing.length === 0,
    [...bad, ...thin, ...missing].join(", ") || `${CHAPTERS.length}챕터 ${CHAPTERS.reduce((n, c) => n + c.questions.length, 0)}문항`);

  const P = await imp("progress.js");
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const { progress } = P.loadProgress(st);
  const miss = P.applyQuizResult(progress, "radio", false);
  const first = P.applyQuizResult(progress, "radio", true);
  const again = P.applyQuizResult(progress, "radio", true);
  P.saveProgress(st, progress);
  const reloaded = P.loadProgress(st);
  const { QUIZ_BONUS, PLAYER_BASE } = await imp("balance.js");
  check("만점 첫 이수에만 보상하고 저장·복원된다 (Node)",
    !miss.reward && first.reward?.stat === "tx" && !again.reward && reloaded.status === "loaded" && P.effectiveStats(reloaded.progress).tx === PLAYER_BASE.tx + QUIZ_BONUS.tx,
    `TX ${P.effectiveStats(reloaded.progress).tx}, 도전 ${reloaded.progress.metrics.quizAttempts.radio}회`);
  mem.set(P.SAVE_KEY, "{broken");
  check("손상된 저장 데이터는 새 진행도로 시작한다 (Node)", P.loadProgress(st).status === "corrupt");
}

// ---------- Stage 5: RSSI 알바 모델 & 밸런스 (Node) ----------
{
  const R = await import(pathToFileURL(path.join(ROOT, "src/core/rssiJob.js")).href);
  const { RSSI_JOB } = await import(pathToFileURL(path.join(ROOT, "src/core/balance.js")).href);
  // 교과서 location.html 예제: P1m = −59 dBm, n = 2, RSSI = −71 dBm → d ≈ 4 m
  const ex = R.distanceFromRssi(-71, { ...RSSI_JOB, PATH_LOSS_N: 2 });
  const roundTrip = [1, 3.7, 12].every((d) => Math.abs(R.distanceFromRssi(R.meanRssiAt(d)) - d) < 1e-9);
  check("RSSI 거리 모델이 교과서 예제와 일치한다", Math.abs(ex - 3.98) < 0.01 && roundTrip, `−71 dBm, n=2 → ${ex.toFixed(2)} m`);

  const { execFileSync } = await import("node:child_process");
  const sim = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "scripts/simulate.mjs"), "--game=rssi", "--bots=300", "--json"], { encoding: "utf8" }));
  const by = Object.fromEntries(sim.strategies.map((x) => [x.name.split(" ")[0], x]));
  const best = sim.strategies.reduce((a, b) => (b.meanScore > a.meanScore ? b : a));
  check("봇 시뮬: 적당히 평균 내는 전략이 성급·과신중보다 낫다 (학습 목표)",
    by["평균"].meanScore > by["성급"].meanScore && by["평균"].meanScore > by["과신중"].meanScore && /N=(6|10|15)/.test(best.name),
    `최적 ${best.name} ${best.meanScore}점 · 성급 ${by["성급"].meanScore} · 과신중 ${by["과신중"].meanScore}`);
  check("봇 시뮬: 합리적 전략의 보수가 PRD 범위(분당 4~8개)에 든다", by["평균"].meanCR2032 >= 4 && by["평균"].meanCR2032 <= 8, `${by["평균"].meanCR2032}개/60초`);

  const P = await import(pathToFileURL(path.join(ROOT, "src/core/progress.js")).href);
  const v1 = { v: 1, bonus: { hp: 5, tx: 0, rx: 0, hop: 0, sec: 0, pwr: 0 }, skillSlots: 2, cleared: { intro: "2026-11-01" }, metrics: { quizAttempts: { intro: 1 }, quizPerfect: { intro: 1 }, chapterOpens: {} } };
  const mem = new Map([[P.SAVE_KEY, JSON.stringify(v1)]]);
  const loadedV1 = P.loadProgress({ getItem: (k) => mem.get(k) ?? null, setItem: () => {} });
  check("Stage 4 세이브(v1)가 진행도 손실 없이 v2로 마이그레이션된다", loadedV1.status === "loaded" && loadedV1.progress.bonus.hp === 5 && loadedV1.progress.skillSlots === 2 && loadedV1.progress.cr2032 === 0);
}

// ---------- Stage 6: 전투 공식 & 훈련장 밸런스 (Node) ----------
{
  const imp = (f) => import(pathToFileURL(path.join(ROOT, "src/core", f)).href);
  const C = await imp("combat.js");
  const fixed = (v) => () => v;
  const normal = C.computeDamage(10, 1.0, 0, fixed(0.5));
  const crit = C.computeDamage(10, 1.0, 0, fixed(0.0));
  const floor = C.computeDamage(1, 1.0, 5, fixed(0.5));
  check("데미지 공식이 PRD §8.4와 일치한다 (TX×계수−SEC, 최소 1, 치명 ×1.5)",
    normal.amount === 10 && !normal.crit && crit.amount === 15 && crit.crit && floor.amount === 1 && C.levelFromXp(50).level === 2 && C.levelFromXp(49).level === 1,
    `기본 ${normal.amount} · 치명 ${crit.amount} · 최소 ${floor.amount}`);

  const { execFileSync } = await import("node:child_process");
  const run = (game) => JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "scripts/simulate.mjs"), `--game=${game}`, "--bots=150", "--json"], { encoding: "utf8" }));
  const combat = run("combat");
  const by = Object.fromEntries(combat.strategies.map((x) => [x.name.split(" ")[0], x]));
  check("봇 시뮬: 제자리 전투에서 피격 후 회복이 일어나고 KO는 없다 (튜토리얼 안전)",
    by["제자리"].hurtPct >= 90 && by["제자리"].regenPct >= 90 && combat.strategies.every((x) => x.koPct === 0),
    `피격 ${by["제자리"].hurtPct}% · 회복 ${by["제자리"].regenPct}% · 최저 HP ${by["제자리"].lowestHp}`);
  check("봇 시뮬: 예고 동작을 보고 피하면 받는 피해가 준다 (실력 보상)", by["회피"].damagePerKill < by["제자리"].damagePerKill * 0.5,
    `피해/처치 회피 ${by["회피"].damagePerKill} vs 제자리 ${by["제자리"].damagePerKill}`);
  const job = run("rssi").strategies.find((x) => x.name.startsWith("평균"));
  const farm = Math.max(...combat.strategies.map((x) => x.cr2032PerMin));
  check("봇 시뮬: 훈련장 사냥 수입이 알바보다 적다 (알바가 주 수입원)", farm < job.meanCR2032, `사냥 ${farm}/분 < 알바 ${job.meanCR2032}/판(60초)`);

  const P = await imp("progress.js");
  const v2 = { v: 2, bonus: { hp: 5, tx: 0, rx: 0, hop: 0, sec: 0, pwr: 0 }, skillSlots: 2, cleared: {}, cr2032: 8, job: { runs: 1, bestScore: 900, totalEarned: 8 }, metrics: { quizAttempts: {}, quizPerfect: {}, chapterOpens: {} } };
  const mem = new Map([[P.SAVE_KEY, JSON.stringify(v2)]]);
  const l = P.loadProgress({ getItem: (k) => mem.get(k) ?? null });
  check("Stage 5 세이브(v2)가 손실 없이 v3로 마이그레이션된다", l.status === "loaded" && l.progress.cr2032 === 8 && l.progress.bonus.hp === 5 && l.progress.xp === 0);
}

// ---------- Stage 6.5: 측정기 배터리 · 장비 · 시뮬레이션 보고서 (Node) ----------
{
  const imp = (f) => import(pathToFileURL(path.join(ROOT, "src/core", f)).href);
  const J = await imp("jobCharges.js");
  const { RSSI_JOB, upgradeCost, upgradeSuccess } = await imp("balance.js");
  const MIN = RSSI_JOB.RECHARGE_SEC * 1000;
  let c = J.fullCharges(0);
  for (let i = 0; i < RSSI_JOB.CHARGES_MAX; i++) c = J.useCharge(c, 1000 * i);
  const empty = J.useCharge(c, 5000) === null && J.chargesAt(c, 5000).count === 0;
  const one = J.chargesAt(c, 2000 + MIN).count === 1;
  const full = J.chargesAt(c, 2000 + MIN * 5).count === RSSI_JOB.CHARGES_MAX && J.chargesAt(c, 2000 + MIN * 5).nextInSec === null;
  check("측정기 배터리: 칸을 다 쓰면 막히고 시간이 지나면 충전된다", empty && one && full);

  const G = await imp("gear.js");
  const geared = G.applyGear({ hp: 100, tx: 10, rx: 5, hop: 6.4, sec: 0, pwr: 100 }, { antenna: 2, crystal: 1, battery: 1, shield: 3 });
  const exp2 = G.expectedCostTo(2);
  check("장비 강화가 스탯에 반영되고 기대 비용이 공식과 맞다",
    geared.tx === 14 && geared.rx === 7 && geared.hp === 110 && geared.sec === 3 &&
    Math.abs(exp2 - (upgradeCost(0) / upgradeSuccess(0) + upgradeCost(1) / upgradeSuccess(1))) < 1e-9, `+2 기대 비용 ${exp2.toFixed(1)}`);

  const { createHash } = await import("node:crypto");
  const REPORT = path.join(ROOT, "scripts/report/balance-report.json");
  const hash = createHash("sha256").update(readFileSync(path.join(ROOT, "src/core/balance.js"))).digest("hex").slice(0, 16);
  let rep = null;
  try { rep = JSON.parse(readFileSync(REPORT, "utf8")); } catch { /* 없음 */ }
  check("밸런스 보고서가 현재 balance.js로 생성되어 있다 (수치를 바꾸면 시뮬레이션 재실행)",
    rep?.balanceHash === hash, rep ? `보고서 ${rep.balanceHash} vs 현재 ${hash}` : "scripts/report/balance-report.json 없음 — node scripts/simulate.mjs 실행");
  check("Stage 6.5 DoD: 봇 1000명 전략 전체 시뮬레이션이 1분 안에 끝났다", rep?.bots >= 1000 && rep?.strategy === "all" && rep?.elapsedSec < 60, `${rep?.bots}명, ${rep?.elapsedSec}초`);
  const failed = (rep?.criteria ?? []).filter((x) => !x.pass && x.gating !== false).map((x) => x.id);
  check("PRD §8.3 기준선을 통과한다 (보고서 기준)", rep?.criteria?.length >= 6 && failed.length === 0, failed.join(", ") || `${rep?.criteria?.length}개 항목`);
}

// ---------- Stage 7: 채널 호핑 규칙 & 층 생성 (Node) ----------
{
  const imp = (f) => import(pathToFileURL(path.join(ROOT, "src/core", f)).href);
  const H = await imp("hopping.js");
  const seq = H.csa1Sequence(7, H.allChannelsMap(), 6).map((e) => e.channel).join(",");
  const map = H.allChannelsMap(); map[7] = false;
  const remap = H.csa1Sequence(7, map, 1)[0];
  check("채널 선택 알고리즘 #1이 교과서와 일치한다 (hop 7 → 7,14,21,28,35,5 · 재매핑)",
    seq === "7,14,21,28,35,5" && remap.remapped && remap.channel === 8 && H.wifiBlockedChannels([1, 6, 11]).size === 31,
    `열 ${seq} · ch7 제외 시 → ${remap.channel} · Wi-Fi 1·6·11 → ${H.wifiBlockedChannels([1, 6, 11]).size}/37`);

  const D = await imp("dungeon.js");
  const sig = (l) => `${l.hopIncrement}|${l.wifi.join("-")}|${l.spawns.map(([x, z]) => x.toFixed(1) + z.toFixed(1)).join()}`;
  const layouts = Array.from({ length: 20 }, (_, i) => D.generateFloor(1, 1000 + i * 7919));
  const distinct = new Set(layouts.map(sig)).size;
  const same = sig(D.generateFloor(3, 42)) === sig(D.generateFloor(3, 42));
  const deep = Array.from({ length: 300 }, (_, i) => D.generateFloor(6 + (i % 5), i * 104729 + 1));
  const okDeep = deep.every((l) => l.wifi.length === 3 && l.wifi.every((w, j) => j === 0 || w - l.wifi[j - 1] >= 4));
  check("깊은 층(Wi-Fi 3대)도 항상 생성된다 (배치 무한 루프 회귀 방지)", okDeep, `6~10층 300개`);
  check("층이 매번 다른 채널 배치로 생성되고, 같은 시드면 같다", distinct >= 18 && same && D.wifiCountFor(1) === 1 && D.wifiCountFor(6) === 3, `20번 중 서로 다른 배치 ${distinct}개`);

  const lay = D.generateFloor(2, 777);
  const pz = D.createLinkPuzzle(lay);
  const before = D.runLinkTest(pz).ok;
  for (const c of lay.blocked) D.toggleChannel(pz, c);
  const after = D.runLinkTest(pz);
  const guard = D.createLinkPuzzle(lay);
  for (let c = 0; c < 37; c++) D.toggleChannel(guard, c);
  check("채널맵 퍼즐: 막힌 채널을 빼면(AFH) 링크가 안정되고, 최소 2채널은 남는다",
    !before && after.ok && after.stars === 3 && guard.map.filter(Boolean).length === 2, `★${after.stars} · 사용 ${after.used}채널`);

  const P = await imp("progress.js");
  const v4 = P.createProgress(); delete v4.dungeon; v4.v = 4; v4.cr2032 = 9;
  const mem = new Map([[P.SAVE_KEY, JSON.stringify(v4)]]);
  const l = P.loadProgress({ getItem: (k) => mem.get(k) ?? null });
  check("Stage 6.5 세이브(v4)가 손실 없이 v5로 마이그레이션된다", l.status === "loaded" && l.progress.cr2032 === 9 && l.progress.dungeon.maxFloor === 0);
}

// ---------- Stage 7.5: RF 랩 — 장비 강화 · 스탯 분배 (Node) ----------
{
  const imp = (f) => import(pathToFileURL(path.join(ROOT, "src/core", f)).href);
  const P = await imp("progress.js");
  const B = await imp("balance.js");
  const fixed = (v) => () => v;

  const p = P.createProgress();
  const broke = P.upgradeGear(p, "antenna", fixed(0));
  p.cr2032 = 100;
  const win = P.upgradeGear(p, "antenna", fixed(0));       // 성공 (난수 0 < 성공률)
  const lose = P.upgradeGear(p, "antenna", fixed(0.999));  // 실패 (난수 0.999 ≥ 성공률)
  check("강화: 재료가 모자라면 막히고, 성공하면 단계가 오르고, 실패해도 장비는 그대로 재료만 소모",
    !broke.ok && broke.reason === "funds" && win.success && p.gear.antenna === 1 && !lose.success && lose.level === 1 &&
    p.cr2032 === 100 - B.upgradeCost(0) - B.upgradeCost(1) && P.effectiveStats(p).tx === B.PLAYER_BASE.tx + B.GEAR.antenna.per,
    `TX ${P.effectiveStats(p).tx} · CR2032 100 → ${p.cr2032}`);
  p.gear.antenna = B.UPGRADE.MAX_LEVEL;
  check("최대 강화 단계에서는 더 강화할 수 없다", P.upgradeGear(p, "antenna", fixed(0)).reason === "max");

  const q = P.createProgress();
  const none = P.allocatePoint(q, "hp");
  q.statPoints = 30;
  const hop = P.allocatePoint(q, "hop");
  const pwr = P.allocatePoint(q, "pwr");
  q.bonus.rx = B.STAT_CAPS.rx; // RX 상한
  const rxCapped = P.allocatePoint(q, "rx");
  check("스탯 분배: 포인트가 있어야 하고, PWR(효과 없음)·상한 도달 스탯은 막힌다",
    !none && hop && !pwr && !rxCapped && P.effectiveStats(q).hop === +(B.PLAYER_BASE.hop + B.STAT_POINT_GAIN.hop).toFixed(2) && q.statPoints === 29,
    `HOP ${P.effectiveStats(q).hop}`);
  check("유효 스탯 = 기본 + 퀴즈 보너스 + 분배 + 장비, 상한 적용", P.effectiveStats(q).rx === B.STAT_CAPS.rx);

  const v5 = P.createProgress(); delete v5.gear; delete v5.alloc; delete v5.lab; v5.v = 5; v5.cr2032 = 11; v5.dungeon.maxFloor = 2;
  const mem = new Map([[P.SAVE_KEY, JSON.stringify(v5)]]);
  const l = P.loadProgress({ getItem: (k) => mem.get(k) ?? null });
  check("Stage 7 세이브(v5)가 손실 없이 v6로 마이그레이션된다", l.status === "loaded" && l.progress.cr2032 === 11 && l.progress.dungeon.maxFloor === 2 && l.progress.gear.antenna === 0);
}

// ---------- Stage 8: 링크 · 간섭 판정 · ACS (Node) ----------
{
  const imp = (f) => import(pathToFileURL(path.join(ROOT, "src/core", f)).href);
  const K = await imp("link.js");
  const H = await imp("hopping.js");
  const link = K.createLink(7);
  const ch0 = link.channel;
  K.stepLink(link, K.LINK_COMBAT.INTERVAL * 3);
  const map = H.allChannelsMap(); for (const c of H.wifiBlockedChannels([6])) map[c] = false;
  K.requestMap(link, map);
  const pendingAt = link.pending.instant;
  K.stepLink(link, K.LINK_COMBAT.INTERVAL * (K.LINK_COMBAT.INSTANT_DELAY - 1));
  const notYet = link.pending !== null && link.map.every(Boolean);
  K.stepLink(link, K.LINK_COMBAT.INTERVAL);
  check("채널맵 갱신은 instant(지금 + 6 이벤트)에 정확히 적용된다 (LL_CHANNEL_MAP_IND)",
    ch0 === 7 && pendingAt === 3 + K.LINK_COMBAT.INSTANT_DELAY && notYet && link.pending === null && link.map[15] === false && link.event === pendingAt, `instant #${pendingAt}`);

  const m = { wifi: 6, state: "chase" };
  const battle = { monsters: [m] };
  const inBand = { channel: 15 }, outBand = { channel: 30 };
  const I1 = K.interferenceFor(inBand), I2 = K.interferenceFor(outBand);
  check("간섭 판정: 대역 안 채널이면 내 패킷 손실·피격, 밖이면 패킷 성공·피해 0",
    I1.packetLost(battle) && I1.playerHit(m) && !I2.packetLost(battle) && !I2.playerHit(m));

  const B = await imp("battle.js");
  const D = await imp("dungeon.js");
  const lay = D.generateFloor(4, 99);
  const bb = D.createFloorBattle(lay);
  B.syncPlayerHp(bb, 100);
  const before = bb.monsters.map((x) => x.wifi).join();
  const { createRng } = await imp("quiz.js");
  const rng = createRng(1);
  let acs = [];
  for (let t = 0; t < 20; t += 0.1) acs = acs.concat(D.stepAcs(bb, 4, 0.1, rng));
  const none = D.stepAcs(D.createFloorBattle(D.generateFloor(2, 99)), 2, 30, rng);
  check("3층부터 Wi-Fi 몬스터가 자동 채널 선택(ACS)으로 채널을 옮긴다 (1~2층은 고정)",
    acs.length >= 3 && bb.monsters.map((x) => x.wifi).join() !== before && acs.every((e) => Math.abs(e.to - e.from) >= 4) && none.length === 0 && D.acsPeriodFor(3) !== null,
    `4층 20초 동안 ${acs.length}회 · 주기 ${D.acsPeriodFor(4)}초`);

  const P = await imp("progress.js");
  const { LIBRARY_COURSES } = await imp("balance.js");
  const p = P.createProgress();
  const no = P.hasAfhSkill(p);
  const r = P.applyQuizResult(p, "hopping", true);
  const afterCourse = P.hasAfhSkill(p);
  p.quests.perks.afh = true;
  // v7 세이브: 호핑 강좌로 이미 AFH를 받은 플레이어는 v8 이전 후에도 유지
  const v7 = P.createProgress(); v7.v = 7; v7.cleared.hopping = "x"; delete v7.quests.claimed;
  const v7b = P.createProgress(); v7b.v = 7;
  const ld = (o) => P.loadProgress({ getItem: () => JSON.stringify(o) }).progress;
  check("AFH = 퀘스트 Q4 보상 (Stage 10): 호핑 강좌는 HOP 스탯, v7에서 강좌로 받은 AFH는 유지",
    LIBRARY_COURSES.some((c) => c.chapter === "hopping" && c.reward === "hop") && !no && !afterCourse && r.reward?.stat === "hop" && P.hasAfhSkill(p)
      && P.hasAfhSkill(ld(v7)) && !P.hasAfhSkill(ld(v7b)) && ld(v7).v === 8);
}

// ---------- Stage 9: 퀘스트 ↔ 교과서 (Node) ----------
const Q9 = await import(pathToFileURL(path.join(ROOT, "src/core/quests.js")).href);
{
  const imp = (f) => import(pathToFileURL(path.join(ROOT, "src/core", f)).href);
  const P = await imp("progress.js");
  const { CHAPTERS } = await imp("chapters.data.js");
  const { chapterUrl } = await imp("book.js");
  const B = await imp("battle.js");
  const { COMBAT } = await imp("balance.js");

  const wbad = Q9.QUESTS.filter((q) => { const w = Q9.whatifFor(q); return !w || !w.section || w.options.length < 2 || !(w.answer in w.options) || !w.explain; });
  const total = CHAPTERS.reduce((n, c) => n + c.whatifs.length, 0);
  check("퀘스트 Q0~Q3의 '예측해 보기'가 교과서에서 정답·해설·절 위치와 함께 임포트됐다", wbad.length === 0 && total >= 4, `예측해 보기 ${total}개`);
  check("교과서 링크가 새 주소(connbook.yalex-k.com)를 쓰고 절 앵커를 붙인다",
    chapterUrl("phy.html", "coded") === "https://connbook.yalex-k.com/bluetooth/chapters/phy.html#coded" && chapterUrl("intro.html") === "https://connbook.yalex-k.com/bluetooth/chapters/intro.html");

  // Q0 → Q3를 순서대로 깬다
  const p = P.createProgress();
  const qs = p.quests;
  const early = Q9.questEvent(qs, { type: "kill", monsterType: "trainingBot" }); // Q3 사건은 Q0 진행 중에는 세지 않는다
  Q9.questEvent(qs, { type: "walk", amount: 10 }); Q9.questEvent(qs, { type: "jump" }); Q9.questEvent(qs, { type: "hit", monsterType: "trainingBot" });
  const lockedWhatif = Q9.answerWhatif(qs, p, "Q0", Q9.whatifFor(Q9.QUESTS[0]).answer).completed === null; // 강좌 전에는 예측 불가
  p.cleared.intro = "t";
  const wrong = Q9.answerWhatif(qs, p, "Q0", (Q9.whatifFor(Q9.QUESTS[0]).answer + 1) % 2);
  const q0 = Q9.answerWhatif(qs, p, "Q0", Q9.whatifFor(Q9.QUESTS[0]).answer);
  check("Q0: 단계를 다 해야 예측해 보기가 열리고, 틀리면 완료되지 않으며, 맞히면 칭호·CR2032 보상 후 Q1이 열린다",
    !early && lockedWhatif && !wrong.correct && q0.completed?.id === "Q0" && qs.title === "패킷 나이트" && p.cr2032 === 5 && qs.active === "Q1");

  const tx0 = P.effectiveStats(p).tx;
  Q9.questEvent(qs, { type: "job", grade: "C" });
  const cOnly = !Q9.stepDone(qs, p, Q9.QUESTS[1], Q9.QUESTS[1].steps[0]);
  Q9.questEvent(qs, { type: "job", grade: "S" });
  p.cleared.radio = "t"; p.gear.antenna = 1;
  Q9.answerWhatif(qs, p, "Q1", Q9.whatifFor(Q9.QUESTS[1]).answer);
  p.cleared.phy = "t"; p.dungeon.maxFloor = 1;
  Q9.answerWhatif(qs, p, "Q2", Q9.whatifFor(Q9.QUESTS[2]).answer);
  p.cleared.advertising = "t";
  for (let i = 0; i < 5; i++) Q9.questEvent(qs, { type: "kill", monsterType: "trainingBot" });
  Q9.questEvent(qs, { type: "job", grade: "A" });
  Q9.answerWhatif(qs, p, "Q3", Q9.whatifFor(Q9.QUESTS[3]).answer);
  check("Q1~Q3: 알바 등급 조건(C는 불인정)·이미 해 둔 상태 단계 인정, 보상 TX+1·DLE·ADV 강화, 배지 4개",
    cOnly && p.bonus.tx === 1 && P.effectiveStats(p).tx > tx0 && qs.perks.dle && qs.perks.advBoost && qs.active === "Q4" && Q9.badges(qs).join() === "intro,radio,phy,advertising",
    `배지 ${Q9.badges(qs).join(",")}`);

  // 보상 효과: DLE 사거리 ×1.5 · 데미지 계수 1.15
  const bt = B.createBattle([]);
  B.syncPlayerHp(bt, 100);
  const shooter = { x: 0, y: 0, z: 0, rotY: 0 };
  const s1 = B.fireAdvPacket(bt, shooter, null, { rangeMul: Q9.PERKS.dle.rangeMul, coef: Q9.PERKS.advBoost.coef });
  const pr = bt.projectiles.at(-1);
  check("퀘스트 보상이 전투에 적용된다 (DLE 사거리 ×1.5, 데미지 계수 1.15)",
    Boolean(s1) && pr.range === COMBAT.ADV_PACKET.range * 1.5 && pr.coef === 1.15, `사거리 ${pr?.range} m`);

  const v6 = P.createProgress(); delete v6.quests; v6.v = 6; v6.cr2032 = 13; v6.dungeon.maxFloor = 3;
  const mem = new Map([[P.SAVE_KEY, JSON.stringify(v6)]]);
  const l = P.loadProgress({ getItem: (k) => mem.get(k) ?? null });
  check("Stage 8 세이브(v6)가 손실 없이 최신(v8)으로 마이그레이션된다 (퀘스트는 Q0부터)",
    l.status === "loaded" && l.progress.v === 8 && l.progress.cr2032 === 13 && l.progress.dungeon.maxFloor === 3 && l.progress.quests.active === "Q0");
}

// ---------- Stage 10: 페어링 판정 · 배터리 모델 · Q4~Q8 · 실드/돌진 (Node) ----------
{
  const imp = (f) => import(pathToFileURL(path.join(ROOT, "src/core", f)).href);
  const S = await imp("pairing.js");
  const W = await imp("powerBudget.js");
  const P = await imp("progress.js");
  const B = await imp("battle.js");
  const { createRng } = await imp("quiz.js");
  const m = (a, b, sc) => S.pairingMethod(a, b, sc);
  // 교과서 security.html "해볼 것" ①~③ + 사양 Table 2.8 대표 칸
  const tableOk = m("DisplayYesNo", "NoInputNoOutput", true).method === "Just Works"
    && m("DisplayYesNo", "DisplayYesNo", true).method === "숫자 비교" && m("DisplayYesNo", "DisplayYesNo", false).method === "Just Works"
    && m("KeyboardDisplay", "KeyboardOnly", true).who === "개시자가 보여 주고 응답자가 입력"
    && m("KeyboardDisplay", "KeyboardOnly", false).auth.startsWith("미인증")
    && m("KeyboardOnly", "KeyboardOnly", true).method === "패스키 입력" && m("DisplayOnly", "DisplayYesNo", true).method === "Just Works";
  const t1 = S.createTrial(createRng(9)); let last1; for (const r of t1.rounds) last1 = S.answerTrial(t1, r.answer);
  const t2 = S.createTrial(createRng(9)); let last2; t2.rounds.forEach((r, i) => { last2 = S.answerTrial(t2, i < 2 ? "틀린 답" : r.answer); });
  const compares = t1.rounds.filter((r) => r.kind === "compare");
  check("페어링 방식 판정이 교과서·사양 Table 2.8과 일치하고, 시험은 숫자 비교(중간자 잡기)를 섞어 5/6 이상이면 통과",
    tableOk && last1.passed && !last2.passed && compares.length === S.PAIRING_TRIAL.COMPARE_ROUNDS && compares.every((r) => (r.a !== r.b) === r.mitm));

  const ex = W.powerBudget({ intervalMs: 2000, latency: 0, clock: "rc" });
  const book = W.POWER_MODEL.I_SLEEP_UA + W.POWER_MODEL.Q_BASE_UC / 1; // 책의 예: 15 µC/1 s + 2 µA = 17 µA
  const sols = W.CONTRACTS.map((c) => W.solutions(c));
  check("배터리 모델이 교과서와 일치하고(창 넓히기 2 s·500 ppm = 1 ms + 16 µs, 15 µC/1 s → 17 µA), 계약 3건 모두 풀 수 있다",
    Math.abs(ex.widenUs - 1016) < 1e-6 && book === 17 && sols.every((x) => x.length > 0)
      && sols[2].length === 1 && sols[2][0].latency === 3 && sols[2][0].clock === "crystal" && sols[1].every((x) => x.clock === "crystal"),
    `계약별 해 ${sols.map((x) => x.length).join("/")}개 · 환경 센서 = 지연 3 + 수정 발진기`);

  // Q4~Q8 진행
  const p = P.createProgress();
  const qs = p.quests;
  Object.assign(qs, { active: "Q4", done: { Q0: "x", Q1: "x", Q2: "x", Q3: "x" } });
  const ans = (id) => Q9.answerWhatif(qs, p, id, Q9.whatifFor(Q9.questById(id)).answer).completed?.id;
  p.cleared.hopping = "x"; p.dungeon.maxFloor = 2;
  const afhBefore = P.hasAfhSkill(p);
  const r4 = ans("Q4");
  p.cleared.connection = "x"; p.dungeon.maxFloor = 3;
  const r5 = ans("Q5");
  p.cleared.gatt = "x";
  const r6early = ans("Q6");
  Q9.questEvent(qs, { type: "visit", place: "prison" });
  Q9.questEvent(qs, { type: "visit", place: "hall" });
  Q9.questEvent(qs, { type: "job", grade: "A" });
  Q9.questEvent(qs, { type: "job", grade: "S" });
  const r6 = ans("Q6");
  p.cleared.security = "x"; Q9.questEvent(qs, { type: "pairing" });
  const r7 = ans("Q7");
  const rc0 = P.chargeCfg(p).RECHARGE_SEC;
  p.cleared.power = "x"; Q9.questEvent(qs, { type: "power" });
  const r8 = ans("Q8");
  check("Q4~Q8: AFH·돌진·서비스 상자 권한·AES 실드·PWR +20 보상, 다른 장소 방문·A등급은 불인정",
    !afhBefore && r4 === "Q4" && P.hasAfhSkill(p) && r5 === "Q5" && qs.perks.dash && !r6early && r6 === "Q6" && qs.perks.gattAccess
      && r7 === "Q7" && qs.perks.aesShield && r8 === "Q8" && qs.active === null && Q9.badges(qs).length === 9,
    `완독 배지 ${Q9.badges(qs).length}개`);
  check("PWR가 측정기 충전 시간을 줄인다 (RECHARGE_SEC × 100 / PWR)", rc0 === 300 && P.chargeCfg(p).RECHARGE_SEC === 250, `${rc0}초 → ${P.chargeCfg(p).RECHARGE_SEC}초`);

  const strike = (ctx) => {
    const b = B.createBattle([[0, 0]]);
    B.syncPlayerHp(b, 100);
    const mon = b.monsters[0];
    mon.state = "windup"; mon.t = 0.0001;
    const player = { x: mon.x, y: mon.y, z: mon.z + 0.6 };
    const ev = B.stepBattle(b, 1 / 60, { player, stats: { hp: 100, tx: 10, rx: 0, sec: 0, hop: 6.4 }, ...ctx });
    return { types: ev.map((e) => e.type), hp: b.player.hp, dash: ev.some((e) => e.dash) };
  };
  const plain = strike({ rng: () => 0.99 });
  const dashed = strike({ rng: () => 0.99, invulnerable: true });
  const shielded = strike({ rng: () => 0, shieldBlock: 0.2 });
  check("돌진 중에는 공격이 스치고(무적), AES 실드는 일부 공격을 위조 패킷으로 버린다",
    plain.types.includes("playerHit") && dashed.dash && dashed.hp === 100 && shielded.types.includes("shieldBlock") && shielded.hp === 100,
    `${plain.types.join()} / ${dashed.types.join()} / ${shielded.types.join()}`);
}

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// 저장소 루트를 정적 서버처럼 제공 (index.html + src/*.js 모듈)
const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json" };
await page.route((url) => url.origin === ORIGIN, (r) => {
  const rel = decodeURIComponent(new URL(r.request().url()).pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !existsSync(file)) return r.fulfill({ status: 404, body: "not found" });
  return r.fulfill({ body: readFileSync(file), contentType: MIME[path.extname(file)] ?? "application/octet-stream" });
});
if (existsSync(LOCAL_THREE)) {
  await page.route("**/three.module.js", (r) => r.fulfill({ body: readFileSync(LOCAL_THREE), contentType: "application/javascript" }));
}

await page.goto(`${ORIGIN}/?test`);
try {
  await page.waitForFunction(() => window.__PK, null, { timeout: 15000 });
} catch {
  console.error("❌ 게임이 로드되지 않았습니다. three.js CDN에 접근할 수 없다면 `npm install` 로 node_modules/three 사본을 받으세요.");
  console.error(errors.join("\n"));
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(300);

const state = () => page.evaluate(() => window.__PK.state());
const teleport = (x, z, y) => page.evaluate(([x, z, y]) => window.__PK.teleport(x, z, y ?? undefined), [x, z, y ?? null]);
const tick = (ms) => page.evaluate((s) => window.__PK.tick(s), ms / 1000);
const reset = async () => { await page.click("#btn-reset"); await tick(50); };
async function hold(code, ms) {
  await page.keyboard.down(code);
  await tick(ms);
  await page.keyboard.up(code);
}
async function sampleWhileHolding(code, ms, every = 1000 / 60) {
  const out = [];
  await page.keyboard.down(code);
  for (let t = 0; t < ms; t += every) { await tick(every); out.push(await state()); }
  await page.keyboard.up(code);
  return out;
}

// ---------- Stage 1: 이동 ----------
const spawnBlocked = await page.evaluate(() => {
  const { SPAWN_POS: p, isBlocked } = window.__PK;
  return isBlocked(p.x, p.z, p.y);
});
check("스폰 지점이 충돌 영역 밖이다", !spawnBlocked);

for (const code of ["KeyW", "KeyA", "KeyS", "KeyD"]) {
  await reset();
  const a = await state();
  await hold(code, 400);
  const b = await state();
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  // W는 정면의 분수대(충돌 반경 2.27)까지 0.73만 갈 수 있다
  check(`스폰에서 ${code} 로 이동한다`, d > (code === "KeyW" ? 0.6 : 0.8), `이동 ${d.toFixed(2)}`);
}

await reset();
{
  const a = await state();
  // 한글 IME 상태: key='ㅁ', code='KeyA'
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ㅁ", code: "KeyA" })));
  await tick(400);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "ㅁ", code: "KeyA" })));
  const b = await state();
  check("한글 IME 상태에서도 WASD가 동작한다", Math.abs(b.x - a.x) > 0.8, `Δx ${(b.x - a.x).toFixed(2)}`);
}

await reset();
{
  await page.keyboard.down("KeyW");
  await tick(150);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const a = await state();
  await tick(300);
  const b = await state();
  await page.keyboard.up("KeyW");
  check("창 포커스를 잃으면 키 입력이 해제된다", Math.hypot(b.x - a.x, b.z - a.z) < 0.05);
}

// ---------- Stage 3: 점프 ----------
await reset();
{
  const ground = (await state()).y;
  await page.keyboard.press("Space");
  let peak = ground;
  for (let i = 0; i < 60; i++) { await tick(1000 / 60); peak = Math.max(peak, (await state()).y); }
  await tick(500);
  const s = await state();
  check("점프하면 떠올랐다가 지면에 착지한다", peak - ground > 1.0 && s.grounded && Math.abs(s.y - ground) < 0.01,
    `최고 +${(peak - ground).toFixed(2)}, 착지 y ${s.y.toFixed(2)}`);
}

// ---------- Stage 3: 건물 충돌 ----------
await reset();
{
  await teleport(0, -4.5);
  await hold("KeyW", 900); // 카메라 yaw 0 → W = -z (회관 방향)
  const s = await state();
  check("GATT 회관 정면에 부딪혀 멈춘다", s.z > -7.0 - 0.42 - 0.05 && s.z < -6.0, `z ${s.z.toFixed(2)}`);
}

await reset();
{
  // 회관 모서리에 비스듬히 부딪히면 벽을 따라 미끄러진다
  await teleport(-1.5, -6.4);
  const a = await state();
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  await tick(400);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("KeyD");
  const b = await state();
  check("벽에 비스듬히 부딪히면 미끄러진다", b.x - a.x > 1.5 && b.z > -7.0 - 0.42 - 0.05, `${fmt(a)} → ${fmt(b)}`);
}

// ---------- Stage 3: 지형 단차 ----------
await reset();
{
  // 마을 → 던전 계단 하강 → 다시 상승
  await teleport(-9.0, -7.5);
  const down = await sampleWhileHolding("KeyW", 1300);
  const bottom = down[down.length - 1];
  const steps = new Set(down.map((s) => Math.round(s.y * 2) / 2));
  check("던전 계단을 걸어 내려간다", bottom.y < 0.6 && steps.size >= 3, `y 2.00 → ${bottom.y.toFixed(2)}, 거친 단 ${steps.size}개`);
  const maxJump = Math.max(...down.slice(1).map((s, i) => Math.abs(s.y - down[i].y)));
  check("계단 하강 중 순간이동이 없다", maxJump <= 0.55, `최대 프레임 간 Δy ${maxJump.toFixed(2)}`);
  await hold("KeyS", 1400);
  const top = await state();
  check("던전 계단을 걸어 올라온다", Math.abs(top.y - 2.0) < 0.01, `y ${top.y.toFixed(2)}`);
}

await reset();
{
  // 렌더링된 블록 윗면과 물리 높이가 일치하는지 (반 블록 양자화)
  const quantized = await page.evaluate(() => {
    const g = window.__PK.groundHeightAt;
    const pts = [[-9, -10], [-9, -11.3], [-9.5, -12], [20, 0], [18.2, 0], [0, 0], [-5.3, 21.7]];
    return pts.every(([x, z]) => Number.isInteger(g(x, z) * 2));
  });
  check("지표 높이가 블록 윗면(0.5 단위)과 일치한다", quantized);
}

await reset();
{
  // 고원에서 옆으로 걸어 던전 구덩이로 떨어진다
  await teleport(-11.6, -11.5);
  const samples = await sampleWhileHolding("KeyD", 500);
  const fell = samples.some((s) => !s.grounded);
  const end = samples[samples.length - 1];
  check("고원 가장자리에서 걸어 나가면 낙하한다", fell && end.y < 1.0, `y ${end.y.toFixed(2)}`);
  // 구덩이에서 반대로 걸으면 1.5 블록 벽에 막힌다
  await tick(300);
  const a = await state();
  await hold("KeyA", 600);
  const b = await state();
  check("높은 단차(>STEP_MAX)는 걸어서 오르지 못한다", b.y < 1.0 && b.x > -11.05, `x ${a.x.toFixed(2)} → ${b.x.toFixed(2)}, y ${b.y.toFixed(2)}`);
}

await reset();
{
  // 분수대 턱(0.7)은 걸어서는 막히고 점프로는 올라선다
  await teleport(0, 3.2);
  await hold("KeyW", 500);
  const walk = await state();
  check("분수대 턱은 걸어서 오를 수 없다", walk.y < 2.01 && walk.z > 1.85 + 0.42 - 0.05, `z ${walk.z.toFixed(2)}`);
  await page.keyboard.down("KeyW");
  await page.keyboard.press("Space");
  await tick(260);
  await page.keyboard.up("KeyW");
  await tick(700);
  const onRim = await state();
  check("점프로 분수대 턱 위에 올라선다", Math.abs(onRim.y - 2.7) < 0.01 && onRim.grounded, `y ${onRim.y.toFixed(2)}`);
}

// ---------- Stage 3: 회전 ----------
await reset();
{
  await page.evaluate(() => { window.__PK.motor.rotY = 3.0; });
  // W(-z) 방향 = atan2(-0, -1) = -π. 3.0 → -π 는 최단 0.14 rad인데, 단순 lerp는 0을 지나 한 바퀴 돈다
  await teleport(0, 6);
  await page.keyboard.down("KeyW");
  let worst = 1;
  for (let i = 0; i < 6; i++) { await tick(1000 / 60); worst = Math.min(worst, -Math.cos((await state()).rotY)); }
  await page.keyboard.up("KeyW");
  check("회전이 최단 각도로 보간된다", worst > 0.95, `min(-cos rotY) ${worst.toFixed(2)}`);
}

// ---------- Stage 2: 상호작용 ----------
await reset();
{
  // 분수대(앞) 뒤에 회관이 겹쳐 보이는 시점에서 분수대 룬을 클릭하면 분수대가 선택돼야 한다
  const p = await page.evaluate(() => window.__PK.projectToScreen(0, 2.35, 0));
  await page.mouse.click(p.x, p.y);
  await tick(20);
  const s = await state();
  check("클릭 시 화면상 가장 앞의 오브젝트가 선택된다", s.modal?.includes("분수대"), `선택: ${s.modal}`);
}

// ---------- Stage 4: 교육 루프 (도서관 퀴즈 → 스탯 → localStorage) ----------
const lib = (sel) => page.locator(`#library-panel ${sel}`);
const statsNow = () => page.evaluate(() => window.__PK.stats());
const { QUIZ_BONUS: QB, PLAYER_BASE: PB } = await import(pathToFileURL(path.join(ROOT, "src/core/balance.js")).href);
const HP_AFTER_INTRO = PB.hp + QB.hp;
/** 진행 중 퀴즈를 푼다. wrongAt 번째 문제만 일부러 틀린다 */
async function answerQuiz(wrongAt = -1) {
  const key = await page.evaluate(() => window.__PK.library.answerKey());
  for (let i = 0; i < key.length; i++) {
    const pick = i === wrongAt ? (key[i] + 1) % 4 : key[i];
    await lib(".opt").nth(pick).click();
    await lib(".lib-btn.primary").click(); // 다음 문제 / 결과 보기
  }
}

await reset();
{
  const p = await page.evaluate(() => window.__PK.projectToScreen(-9.0, 4.6, -1.0)); // 도서관 지붕
  await page.mouse.click(p.x, p.y);
  await tick(20);
  const actionVisible = await page.locator("#modal-action").isVisible();
  check("도서관 모달에 '강의실 입장' 버튼이 있다", actionVisible && (await state()).modal?.includes("도서관"));
  await page.click("#modal-action");
  check("강의실이 열린다", await page.evaluate(() => window.__PK.library.isOpen()));

  const a = await state();
  await hold("KeyW", 300);
  const b = await state();
  check("강의실이 열려 있는 동안 기사가 움직이지 않는다", Math.hypot(b.x - a.x, b.z - a.z) < 0.01);

  await lib(".course").first().click();
  const keypoints = await lib("ol li").count();
  check("레슨 화면에 교과서 핵심 정리가 보인다", keypoints >= 3, `${keypoints}개`);

  const before = await statsNow();
  await lib(".lib-btn.primary").click(); // 퀴즈 시작
  await answerQuiz(0);
  const missStats = await statsNow();
  const explains = await lib(".explain").count();
  const retry = await lib(".lib-btn.primary").textContent();
  check("한 문제라도 틀리면 보상 없이 해설과 재도전을 준다",
    missStats.hp === before.hp && explains >= 1 && retry.includes("다시 도전"), `해설 ${explains}개, 버튼 '${retry}'`);

  await lib(".lib-btn.primary").click(); // 새 문제로 다시 도전
  await answerQuiz();
  const after = await statsNow();
  const prog = await page.evaluate(() => window.__PK.progress());
  const hudText = await page.locator("#stats").textContent();
  check("3문제 모두 맞히면 스탯이 오르고 스킬 슬롯이 열린다",
    after.hp === before.hp + QB.hp && prog.skillSlots === 2 && hudText.includes(`${after.hp}`), `HP ${before.hp} → ${after.hp}, 슬롯 ${prog.skillSlots}`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("packetKnight.save")));
  check("진행도가 localStorage에 저장된다", Boolean(saved?.cleared?.intro) && saved.bonus.hp === QB.hp && saved.metrics.quizAttempts.intro === 2);
}

await page.reload();
await page.waitForFunction(() => window.__PK);
{
  const s1 = await statsNow();
  const st = await page.evaluate(() => window.__PK.saveStatus());
  const hudText = await page.locator("#stats").textContent();
  check("새로고침 후에도 스탯이 유지된다", s1.hp === HP_AFTER_INTRO && st.load === "loaded" && hudText.includes(`${HP_AFTER_INTRO}`), `HP ${s1.hp}, ${st.load}`);

  await page.evaluate(() => window.__PK.library.open());
  const doneTag = await lib(".course").first().textContent();
  check("이수한 챕터는 목록에 이수 표시된다", doneTag.includes("이수"));
  await lib(".course").first().click();
  await lib(".lib-btn.primary").click();
  await answerQuiz();
  const s2 = await statsNow();
  check("이미 이수한 챕터를 다시 만점 받아도 보상이 중복되지 않는다", s2.hp === HP_AFTER_INTRO, `HP ${s2.hp}`);

  await page.keyboard.press("Escape");
  const closed = !(await page.evaluate(() => window.__PK.library.isOpen()));
  await reset();
  const a = await state();
  await hold("KeyS", 300);
  const b = await state();
  check("Esc로 강의실을 닫으면 다시 조작할 수 있다", closed && Math.hypot(b.x - a.x, b.z - a.z) > 0.5);
}

await page.evaluate(() => localStorage.setItem("packetKnight.save", "{not json"));
await page.reload();
await page.waitForFunction(() => window.__PK);
{
  const st = await page.evaluate(() => window.__PK.saveStatus());
  const s3 = await statsNow();
  const backup = await page.evaluate(() => localStorage.getItem("packetKnight.save.corrupt"));
  check("손상된 세이브로도 게임이 시작되고 원본은 백업된다", st.load === "corrupt" && s3.hp === 100 && backup === "{not json");
}

// ---------- Stage 5 → 11.2: 알바 (60초 비콘 찾기 → CR2032 지급·저장) ----------
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__PK);
const jobState = () => page.evaluate(() => window.__PK.job.state());
await reset();
{
  await teleport(5.0, 13.0); // 등대가 카메라 정면에 오도록
  await tick(500);
  const p = await page.evaluate(() => window.__PK.projectToScreen(8.0, 5.0, 8.0)); // 등대 탑신
  await page.mouse.click(p.x, p.y);
  await tick(20);
  const label = await page.locator("#modal-action").textContent();
  check("등대 모달에 '비콘 찾기 알바' 버튼이 있다", (await state()).modal?.includes("등대") && label.includes("알바"), label);
  await page.click("#modal-action");
  await page.locator("#job-panel .lib-btn.primary").click(); // 60초 비콘 찾기 시작
  const huntUi = await page.evaluate(() => ({ modal: !document.getElementById("job").hidden, hunt: !document.getElementById("hunt").hidden }));
  check("시작하면 모달이 닫히고 걸어 다니며 보는 측정기 창이 뜬다", !huntUi.modal && huntUi.hunt, JSON.stringify(huntUi));

  await tick(1200);
  const s1 = await jobState();
  check("멈춰 서 있으면 광고 패킷(약 100 ms 간격)이 그 자리의 RSSI 샘플로 쌓인다", s1.phase === "search" && s1.samples >= 9 && s1.samples <= 13, `1.2초 → ${s1.samples}개`);
  const spawnD = Math.hypot(s1.beacon.x - 5.0, s1.beacon.z - 13.0);

  const a = await state();
  await hold("KeyS", 400);
  const b = await state();
  const s2 = await jobState();
  check("알바 중에도 걸을 수 있고, 움직이면 그 자리의 평균은 새로 시작된다",
    Math.hypot(b.x - a.x, b.z - a.z) > 0.5 && s2.samples <= 4, `${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)} m 이동 · 샘플 ${s1.samples} → ${s2.samples}`);

  // 비콘 바로 옆(0.4 m)으로 가서 B 키로 신고
  await page.evaluate(({ x, z }) => window.__PK.teleport(x + 0.4, z), s2.beacon);
  await tick(100);
  await page.keyboard.press("KeyB");
  await tick(20);
  const s3 = await jobState();
  const shown = await page.locator("#hunt .job-estimate").textContent();
  check("B 키로 '여기다!'를 누르면 실제 비콘까지 거리로 판정하고, 비콘 위치를 3D로 공개한다",
    s3.phase === "reveal" && s3.rounds === 1 && Math.abs(s3.err - 0.4) < 0.05 && shown.includes("정밀") && s3.revealShown, shown);
  await tick(2100);
  const s4 = await jobState();
  check("공개 후 새 비콘은 기사에게서 5~13 m 떨어진 마을 안에 숨겨진다 (첫 비콘도)",
    s4.phase === "search" && !(await jobState()).revealShown && spawnD >= 5 - 1e-6 && spawnD <= 13 + 1e-6 && Math.hypot(s4.beacon.x, s4.beacon.z) <= 15.0,
    `첫 비콘 ${spawnD.toFixed(1)} m · 다음 (${s4.beacon.x.toFixed(1)}, ${s4.beacon.z.toFixed(1)})`);

  // 남은 시간: 비콘마다 그 자리로 가서 1초 평균을 본 뒤 신고 (흐름 검증 — 실력·밸런스는 봇 시뮬레이션이 맡는다)
  const result = await page.evaluate(() => {
    const pk = window.__PK;
    const spots = [];
    let waited = 0;
    while (pk.job.state().phase !== "done") {
      const st = pk.job.state();
      if (st.phase === "search") {
        if (waited === 0) { pk.teleport(st.beacon.x, st.beacon.z); spots.push(st.beacon); }
        waited += 1 / 60;
        if (waited > 1) { pk.job.mark(); waited = 0; }
      }
      pk.tick(1 / 60);
    }
    const r = pk.job.state().result;
    return { ...r, spotsOk: spots.every((b) => Math.hypot(b.x, b.z) <= 15.0 && Math.hypot(b.x + 9, b.z - 10) >= 5) };
  });
  await tick(20);
  const prog = await page.evaluate(() => window.__PK.progress());
  const hudCoins = await page.locator('#stats [data-stat="cr2032"]').textContent();
  const resultShown = await page.evaluate(() => !document.getElementById("job").hidden && document.getElementById("hunt").hidden);
  check("60초가 끝나면 결과 창이 뜨고 등급에 따라 CR2032가 지급된다 (비콘 자리는 모두 마을 안·훈련장 밖)",
    result.rounds >= 8 && result.grade === "S" && result.reward === 8 && prog.cr2032 === result.reward && hudCoins.includes(`${result.reward}`) && resultShown && result.spotsOk,
    `비콘 ${result.rounds}개 · ${result.score}점 · 등급 ${result.grade} · +${result.reward}`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("packetKnight.save")));
  check("CR2032 잔액이 localStorage에 저장된다", saved.v >= 2 && saved.cr2032 === result.reward && saved.job.runs === 1);

  // 두 번째 판은 도중에 그만두면 보수 없음
  await page.locator("#job-panel .lib-btn.primary").click(); // 한 번 더
  await tick(3000);
  await page.keyboard.press("Escape");
  await tick(100);
  const after = await page.evaluate(() => window.__PK.progress());
  check("찾는 도중 Esc로 그만두면 보수 없이 끝나고 측정기 창이 닫힌다",
    after.cr2032 === result.reward && after.job.runs === 1 && !(await page.evaluate(() => window.__PK.job.isOpen())) && (await jobState()) === null);

  await page.reload();
  await page.waitForFunction(() => window.__PK);
  const reloaded = await page.evaluate(() => window.__PK.progress());
  const hud2 = await page.locator('#stats [data-stat="cr2032"]').textContent();
  check("새로고침 후에도 CR2032 잔액이 유지된다", reloaded.cr2032 === result.reward && hud2.includes(`${result.reward}`), hud2);
}

// ---------- Stage 6: 첫 전투 (훈련장) ----------
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__PK);
const bState = () => page.evaluate(() => window.__PK.battle.state());
await reset();
{
  await teleport(-9.0, 5.6); // 훈련장 북쪽 입구, 봇들은 남쪽(+z)에 있다 → 기본 방향(+z)으로 조준
  await tick(100);
  const before = await bState();
  await page.keyboard.press("KeyF");
  await tick(1200);
  const after = await bState();
  const damaged = after.monsters.some((m, i) => m.hp < before.monsters[i].hp);
  check("F 키로 ADV 패킷을 쏘면 조준 보조로 봇에 명중한다", damaged, after.monsters.map((m) => `${m.hp}/40`).join(", "));
  const toast = await page.locator("#toast").textContent();
  const prog0 = await page.evaluate(() => window.__PK.progress());
  check("첫 명중 시 도감에 등록되고 스캔 결과(수동 스캔)를 보여 준다",
    Boolean(prog0.bestiary.trainingBot) && toast.includes("ADV_NONCONN_IND") && toast.includes("수동 스캔"), toast.slice(0, 40) + "…");

  // 봇처럼 사냥: 가까운 봇 쪽을 보고 쏘고, 떨어진 CR2032는 주우러 간다
  const hunt = await page.evaluate(() => {
    const pk = window.__PK;
    const start = pk.progress();
    let minHp = Infinity, t = 0;
    while (t < 300) { // 훈련용 봇 CR2032 드롭 10% — 몇 마리는 잡아야 한다
      pk.battle.fire();
      pk.tick(0.1);
      t += 0.1;
      const s = pk.battle.state();
      minHp = Math.min(minHp, s.hp);
      const p = pk.progress();
      if (p.cr2032 > start.cr2032 && p.bestiary.trainingBot?.kills >= 1) break;
      // 드롭이 남아 있으면 그 근처로 이동(자석 반경 안)
      if (s.drops > 0 && t % 2 < 0.1) pk.teleport(-9.0, 9.0);
    }
    const end = pk.progress();
    return { kills: end.bestiary.trainingBot?.kills ?? 0, xp: end.xp, cr: end.cr2032, minHp, t: +t.toFixed(1) };
  });
  check("봇을 처치하면 경험치를 얻는다", hunt.kills >= 1 && hunt.xp === hunt.kills * 10, `${hunt.kills}마리 · XP ${hunt.xp}`);
  check("처치한 봇이 떨어뜨린 CR2032를 주워 잔액이 오른다", hunt.cr >= 1, `CR2032 ${hunt.cr} (${hunt.t}초)`);
  const hudLv = await page.locator('#stats [data-stat="level"]').textContent();
  check("HUD에 레벨·경험치가 표시된다", hudLv.includes("Lv") && hudLv.includes(`XP`), hudLv);

  // 가만히 맞아 HP가 줄었다가, 물러나 쉬면 회복된다
  const hpTest = await page.evaluate(() => {
    const pk = window.__PK;
    pk.teleport(-9.0, 3.0); // 리스폰 대기 (훈련장 밖)
    for (let i = 0; i < 200 && !pk.battle.state().monsters.some((x) => x.state === "idle"); i++) pk.tick(0.1);
    const m = pk.battle.state().monsters.find((x) => x.state === "idle");
    pk.teleport(m.x, m.z + 1.0);
    let lowest = Infinity;
    for (let i = 0; i < 40; i++) { pk.tick(0.1); lowest = Math.min(lowest, pk.battle.state().hp); }
    pk.teleport(0, 3); // 마을 광장으로 후퇴
    pk.tick(8);
    const s = pk.battle.state();
    return { lowest, after: s.hp, max: s.maxHp };
  });
  check("봇에게 맞으면 HP가 줄었다가, 전투에서 벗어나면 회복된다",
    hpTest.lowest < hpTest.max && hpTest.after === hpTest.max, `최저 ${Math.round(hpTest.lowest)} → ${Math.round(hpTest.after)}/${hpTest.max}`);
  const hpText = await page.locator("#hp-text").textContent();
  check("HP 바가 화면에 표시된다", hpText.includes(`${hpTest.max} / ${hpTest.max}`), hpText);

  // 몬스터를 클릭(탭)하면 그 몬스터를 조준해 쏜다
  await teleport(-9.0, 5.6);
  await tick(600);
  const target = (await bState()).monsters.find((m) => m.state !== "dead");
  const scr = await page.evaluate(([x, z]) => window.__PK.projectToScreen(x, 2.4, z), [target.x, target.z]);
  await tick(900); // 쿨다운 해제 대기
  const hpBefore = (await bState()).monsters.find((m) => m.id === target.id).hp;
  const scr2 = await page.evaluate((id) => { const m = window.__PK.battle.state().monsters.find((x) => x.id === id); return window.__PK.projectToScreen(m.x, 2.4, m.z); }, target.id);
  await page.mouse.click(scr2.x, scr2.y);
  await tick(1200);
  const hpAfter = (await bState()).monsters.find((m) => m.id === target.id);
  check("몬스터를 클릭하면 그 몬스터를 조준해 발사한다", hpAfter.hp < hpBefore || hpAfter.state === "dead", `${hpBefore} → ${hpAfter.hp}`);

  // 강의실이 열려 있으면 발사되지 않는다
  await page.evaluate(() => window.__PK.library.open());
  await tick(900);
  const lockBefore = await bState();
  await page.evaluate(() => window.__PK.battle.fire());
  await page.keyboard.press("KeyF");
  await tick(1200);
  const lockAfter = await bState();
  await page.keyboard.press("Escape");
  check("오버레이가 열려 있는 동안에는 발사되지 않는다",
    lockAfter.monsters.every((m, i) => m.hp >= lockBefore.monsters[i].hp || m.state === "dead" && lockBefore.monsters[i].state === "dead"));

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("packetKnight.save")));
  await page.reload();
  await page.waitForFunction(() => window.__PK);
  const reloaded = await page.evaluate(() => window.__PK.progress());
  check("XP·도감·CR2032가 저장되고 새로고침 후 유지된다",
    saved.v >= 3 && reloaded.xp === hunt.xp && reloaded.bestiary.trainingBot?.kills === hunt.kills && reloaded.cr2032 >= 1);
}

// ---------- Stage 6.5: 측정기 배터리 (게임) ----------
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__PK);
{
  const startBtn = page.locator("#job-panel .job-start");
  await page.evaluate(() => window.__PK.job.open());
  const before = await page.locator("#job-panel .charge-line").getAttribute("data-charges");
  for (let i = 0; i < 3; i++) {
    await startBtn.click();           // 1칸 사용
    await tick(500);
    await page.keyboard.press("Escape"); // 도중 이탈 (보수 없음, 배터리는 돌려받지 못함)
    await page.evaluate(() => window.__PK.job.open());
  }
  const emptyCount = await page.locator("#job-panel .charge-line").getAttribute("data-charges");
  const disabled = await startBtn.isDisabled();
  const label = await startBtn.textContent();
  check("측정기 배터리 3칸을 다 쓰면 알바를 시작할 수 없다", before === "3" && emptyCount === "0" && disabled && label.includes("충전 중"), `${before} → ${emptyCount}, '${label}'`);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__PK.advanceClock(5 * 60 * 1000 + 1000));
  await page.evaluate(() => window.__PK.job.open());
  const recharged = await page.locator("#job-panel .charge-line").getAttribute("data-charges");
  check("5분이 지나면 배터리 1칸이 충전되어 다시 할 수 있다", recharged === "1" && !(await startBtn.isDisabled()), `${recharged}칸`);
  await page.keyboard.press("Escape");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("packetKnight.save")));
  check("측정기 배터리 상태가 세이브(v4+)에 저장된다", saved.v >= 4 && Number.isInteger(saved.job.charges.stored));
}

// ---------- Stage 7: 37채널 호핑 던전 ----------
const dState = () => page.evaluate(() => window.__PK.dungeon.state());
/** 테스트용 강한 기사 세이브 (흐름 검증용 — 밸런스는 봇 시뮬레이션이 맡는다) */
await page.evaluate(() => {
  const p = window.__PK.progress();
  Object.assign(p, { cr2032: 30 });
  Object.assign(p.bonus, { hp: 900, tx: 60 });
  localStorage.setItem("packetKnight.save", JSON.stringify(p));
});
await page.reload();
await page.waitForFunction(() => window.__PK);
await reset();
{
  await teleport(-9.0, -7.0);
  await tick(500);
  const gp = await page.evaluate(() => window.__PK.projectToScreen(-9.0, 0.8, -13.0)); // 던전 포털
  await page.mouse.click(gp.x, gp.y);
  await tick(20);
  const label = await page.locator("#modal-action").textContent();
  check("던전 관문 모달에 '던전 입장' 버튼이 있다", label.includes("던전"), label);
  await page.click("#modal-action");
  await page.locator("#dungeon-panel .dungeon-enter").click();
  await tick(50);
  const s1 = await dState();
  const cr1 = (await page.evaluate(() => window.__PK.progress())).cr2032;
  const hudText = await page.locator("#dungeon-hud .dh-text").textContent();
  check("입장료를 내고 1층(지하 방)에 들어간다", s1?.floor === 1 && s1.phase === "combat" && cr1 === 27 && hudText.includes("1층"), `${hudText} · CR2032 ${cr1}`);

  // 간섭 몬스터 소탕 (강한 기사로 흐름만 검증)
  await page.evaluate(() => { const pk = window.__PK; for (let i = 0; i < 300 && pk.dungeon.state().phase === "combat"; i++) { pk.battle.fire(); pk.tick(0.1); } });
  const s2 = await dState();
  const mons = await bState();
  check("Wi-Fi 간섭 몬스터(층 체력 배율 적용)를 모두 쓰러뜨리면 링크 단계로 넘어간다",
    s2.phase === "link" && mons.monsters.every((m) => m.state === "dead" && m.type === "wifiInterferer"), `${mons.monsters.length}마리 · 체력 ${mons.monsters[0].maxHp}`);

  // 콘솔에 다가가면 자동으로 열린다
  const room = await page.evaluate(() => window.__PK.dungeon.room);
  await teleport(room.cx, room.cz - 7.0);
  await tick(200);
  check("북쪽 링크 콘솔에 다가가면 채널맵 콘솔이 열린다", (await page.evaluate(() => window.__PK.dungeon.panelMode())) === "console");

  await tick(6000); // 관찰: 연결 이벤트 40개
  const s3 = await dState();
  const lossyBlocked = s3.blocked.filter((c) => s3.observed[c].tx > 0 && s3.observed[c].lost / s3.observed[c].tx > 0.5);
  const seenBlocked = s3.blocked.filter((c) => s3.observed[c].tx > 0);
  const falseAlarm = s3.observed.filter((o, c) => !s3.blocked.includes(c) && o.tx >= 2 && o.lost / o.tx > 0.5).length;
  // 숨은 공유기는 늘 켜져 있어 막힌 채널은 항상 깨지고, 다른 채널은 2% 페이딩 잡음 — 오경보는 드물다
  check("관찰하면 숨은 Wi-Fi가 덮는 채널에서 패킷 손실이 보인다 (채널 분류)",
    seenBlocked.length > 0 && lossyBlocked.length === seenBlocked.length && falseAlarm <= 1,
    `Wi-Fi ${s3.wifi.join(",")}번 → 막힘 ${s3.blocked[0]}~${s3.blocked.at(-1)} · 관찰 ${seenBlocked.length}개 중 손실 판정 ${lossyBlocked.length}개 · 오경보 ${falseAlarm}`);

  await page.locator("#dungeon-panel .link-test").click();
  const fail = await page.locator("#dungeon-panel .ch-status").textContent();
  check("채널맵을 고치지 않고 링크 테스트하면 실패한다", fail.includes("❌") && (await dState()).phase === "link", fail.slice(0, 30));

  for (const c of s3.blocked) await page.locator(`#dungeon-panel .ch[data-ch="${c}"]`).click();
  await page.locator("#dungeon-panel .link-test").click();
  const okText = await page.locator("#dungeon-panel .ch-status").textContent();
  const s4 = await dState();
  const prog = await page.evaluate(() => window.__PK.progress());
  check("막힌 채널을 채널맵에서 빼면 링크가 안정되고 다음 층 포털이 열린다",
    okText.includes("✅") && okText.includes("★★★") && s4.phase === "open" && prog.dungeon.maxFloor === 1 && prog.dungeon.stars["1"] === 3, okText.slice(0, 40));

  // 포털 → 2층 (다른 채널 배치)
  await page.keyboard.press("Escape");
  await teleport(room.cx, room.cz + 7.6);
  await tick(200);
  check("남쪽 포털에 다가가면 다음 층 도전 창이 열린다", (await page.evaluate(() => window.__PK.dungeon.panelMode())) === "portal");
  await page.locator("#dungeon-panel .dungeon-enter").click();
  await tick(50);
  const s5 = await dState();
  const sameLayout = s5.hopIncrement === s3.hopIncrement && s5.wifi.join() === s3.wifi.join();
  check("클리어하면 다음 층(2층)이 열리고 새 채널 배치로 생성된다", s5.floor === 2 && s5.phase === "combat" && !sameLayout,
    `1층 hop ${s3.hopIncrement}·Wi-Fi ${s3.wifi} → 2층 hop ${s5.hopIncrement}·Wi-Fi ${s5.wifi}`);

  // ---------- Stage 8: 전투 중 채널맵 · 간섭 판정 · 체크포인트 롤백 ----------
  const L0 = await page.evaluate(() => window.__PK.dungeon.link());
  await tick(1000); // 연결 간격 0.5초 → 이벤트 2개
  const L1 = await page.evaluate(() => window.__PK.dungeon.link());
  const { csa1Sequence } = await import(pathToFileURL(path.join(ROOT, "src/core/hopping.js")).href);
  const expectCh = csa1Sequence(s5.hopIncrement, L1.map, 1, L1.event)[0].channel;
  const hudCells = await page.locator("#chmap .cm").count();
  const nowCell = await page.locator("#chmap .cm.now").getAttribute("data-ch");
  check("던전 전투 중 실시간 채널맵 HUD(37칸)가 뜨고, 링크가 연결 이벤트마다 CSA #1로 도약한다",
    hudCells === 37 && L1.event === L0.event + 2 && L1.channel === expectCh && nowCell === String(L1.channel), `이벤트 #${L0.event}→#${L1.event}, 채널 ${L1.channel}`);

  // 쏘면 몬스터가 스캔되어 Wi-Fi 대역이 HUD에 드러난다
  await page.evaluate(() => { const pk = window.__PK; for (let i = 0; i < 60 && !pk.dungeon.monsters().some((m) => m.revealed); i++) { pk.battle.fire(); pk.tick(0.1); } });
  const scanned = await page.evaluate(() => window.__PK.dungeon.monsters());
  const bandCells = await page.locator("#chmap .cm.band").count();
  check("몬스터를 맞히면(스캔) 그 Wi-Fi 대역이 채널맵에 표시된다", scanned.some((m) => m.revealed) && bandCells >= 9, `대역 칸 ${bandCells}개`);

  // AFH 버튼 (퀘스트 Q4 보상) → 6 이벤트 뒤에 적용, 이후 드러난 대역으로 도약하지 않는다
  const afhLocked = await page.locator("#chmap .cm-afh").isDisabled();
  const afhLabel = await page.locator("#chmap .cm-afh").textContent();
  await page.evaluate(() => { const p = window.__PK.progress(); p.quests.perks.afh = true; localStorage.setItem("packetKnight.save", JSON.stringify(p)); });
  check("AFH 버튼은 퀘스트 Q4를 완료해야 열린다", afhLocked && afhLabel.includes("Q4"), afhLabel);
}
// AFH 스킬을 가진 세이브로 다시 시작해 2층을 이어서 검증
await page.reload();
await page.waitForFunction(() => window.__PK);
{
  await page.evaluate(() => window.__PK.dungeon.enter());
  await tick(50);
  const sA = await dState();
  await page.evaluate(() => { const pk = window.__PK; for (let i = 0; i < 80 && !pk.dungeon.monsters().some((m) => m.revealed); i++) { pk.battle.fire(); pk.tick(0.1); } });
  await page.locator("#chmap .cm-afh").click();
  const L2 = await page.evaluate(() => window.__PK.dungeon.link());
  check("AFH 버튼을 누르면 채널맵 갱신이 instant(6 이벤트 뒤)로 예약된다", L2.pending && L2.pending.instant === L2.event + 6, `#${L2.event} → instant #${L2.pending?.instant}`);
  await tick(3500); // 7 이벤트
  const after = await page.evaluate(() => {
    const pk = window.__PK;
    const bands = new Set();
    const L = pk.dungeon.link();
    const seen = [];
    for (let i = 0; i < 8; i++) { pk.tick(0.5); seen.push(pk.dungeon.link().channel); }
    return { map: L.map, pending: L.pending, seen };
  });
  const { wifiBlockedChannels } = await import(pathToFileURL(path.join(ROOT, "src/core/hopping.js")).href);
  const revealed = (await page.evaluate(() => window.__PK.dungeon.monsters())).filter((m) => m.revealed && m.state !== "dead");
  const band = new Set(revealed.flatMap((m) => [...wifiBlockedChannels([m.wifi])]));
  const excluded = [...band].every((c) => after.map[c] === false);
  const avoided = after.seen.every((c) => !band.has(c));
  check("instant이 지나면 새 채널맵이 적용되어 드러난 간섭 대역으로 도약하지 않는다 (AFH)", !after.pending && excluded && avoided,
    `대역 ${[...band].sort((a, b) => a - b)[0]}~… · 이후 채널 ${after.seen.join(",")}`);

  // HP 0 → Connection Timeout 창 → 체크포인트 롤백
  const crBefore = (await page.evaluate(() => window.__PK.progress())).cr2032;
  await page.evaluate(() => {
    const pk = window.__PK;
    pk.dungeon.link(); // 간섭 판정을 위해 채널맵을 초기화해 대역 안에 걸리게 한다
    document.querySelector("#chmap .cm-reset").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    for (let i = 0; i < 400 && pk.dungeon.state()?.phase !== "timeout"; i++) {
      const m = pk.dungeon.monsters().find((x) => x.state !== "dead");
      pk.teleport(m.x + 0.5, m.z);
      pk.battle.setHp(1);
      pk.tick(0.1);
    }
  });
  const tState = await dState();
  const afterKo = await page.evaluate(() => window.__PK.progress());
  check("던전에서 HP 0이 되면 Connection Timeout 창이 뜨고 CR2032 10%를 잃는다",
    tState?.phase === "timeout" && (await page.evaluate(() => window.__PK.dungeon.panelMode())) === "timeout" && afterKo.cr2032 === crBefore - Math.floor(crBefore * 0.1),
    `CR2032 ${crBefore} → ${afterKo.cr2032}`);
  await page.locator("#dungeon-panel .timeout-rollback").click();
  const rb = await dState(); // 진행시키지 않고 롤백 직후 상태를 그대로 본다 (몬스터는 곧바로 추격을 시작한다)
  const rbMons = await page.evaluate(() => window.__PK.dungeon.monsters());
  const me = await state();
  const sameSpawns = rbMons.every((m, i) => Math.hypot(m.x - rb.spawns[i][0], m.z - rb.spawns[i][1]) < 0.05 && m.hp === m.maxHp && !m.revealed);
  check("체크포인트 롤백: 같은 층 시작 순간(몬스터 배치·체력, 기사 위치, 채널맵)으로 기록대로 돌아간다",
    rb.floor === sA.floor && rb.phase === "combat" && rb.rollbacks === 1 && sameSpawns &&
    Math.hypot(me.x - 0, me.z - 400) < 0.1 && (await page.evaluate(() => window.__PK.dungeon.link().map.every(Boolean))) &&
    (await page.evaluate(() => window.__PK.battle.state().hp)) === (await page.evaluate(() => window.__PK.battle.state().maxHp)),
    `${rb.floor}층 · 롤백 ${rb.rollbacks}회`);

  // 다시 쓰러지고 이번엔 마을로
  await page.evaluate(() => {
    const pk = window.__PK;
    for (let i = 0; i < 400 && pk.dungeon.state()?.phase !== "timeout"; i++) {
      const m = pk.dungeon.monsters().find((x) => x.state !== "dead");
      pk.teleport(m.x + 0.5, m.z);
      pk.battle.setHp(1);
      pk.tick(0.1);
    }
  });
  await page.locator("#dungeon-panel button", { hasText: "마을로" }).click();
  await tick(50);
  const ko = await state();
  const p2 = await page.evaluate(() => window.__PK.progress());
  check("Connection Timeout 창에서 '마을로'를 고르면 던전 관문으로 돌아온다", (await dState()) === null && Math.hypot(ko.x + 9, ko.z + 7.6) < 1 && p2.dungeon.kos >= 2 && p2.dungeon.rollbacks === 1);

  await page.reload();
  await page.waitForFunction(() => window.__PK);
  const re = await page.evaluate(() => window.__PK.progress());
  check("던전 기록(최고 층·별점·롤백)이 저장되고 새로고침 후 유지된다", re.v >= 5 && re.dungeon.maxFloor === 1 && re.dungeon.attempts === 3 && re.dungeon.rollbacks === 1);
}

// ---------- Stage 7.5: RF 랩 ----------
await page.evaluate(() => {
  const p = window.__PK.progress();
  Object.assign(p, { cr2032: 40, statPoints: 2 });
  p.bonus = { hp: 0, tx: 0, rx: 0, hop: 0, sec: 0, pwr: 0 };
  localStorage.setItem("packetKnight.save", JSON.stringify(p));
});
await page.reload();
await page.waitForFunction(() => window.__PK);
await reset();
{
  await teleport(6.6, -1.0);
  await tick(300);
  const fp = await page.evaluate(() => window.__PK.projectToScreen(9.0, 3.5, -1.0)); // 대장간 지붕
  await page.mouse.click(fp.x, fp.y);
  await tick(20);
  const label = await page.locator("#modal-action").textContent();
  check("패킷 대장간 모달에 'RF 랩 입장' 버튼이 있다", label.includes("RF 랩"), label);
  await page.click("#modal-action");

  const tx0 = (await statsNow()).tx;
  const cr0 = (await page.evaluate(() => window.__PK.progress())).cr2032;
  await page.locator('#rflab-panel .lab-up[data-piece="antenna"]').click();
  const res = await page.locator("#rflab-panel .lab-result").textContent();
  const p1 = await page.evaluate(() => window.__PK.progress());
  const tx1 = (await statsNow()).tx;
  const hudTx = await page.locator('#stats [data-stat="tx"]').textContent();
  check("RF 랩에서 안테나를 강화하면 CR2032가 들고 TX가 오른다 (HUD 반영)",
    p1.cr2032 === cr0 - 7 && (p1.gear.antenna === 1 ? tx1 === tx0 + 2 && hudTx.includes(`${tx1}`) : tx1 === tx0) && res.length > 0,
    `${res.slice(0, 34)} · CR2032 ${cr0} → ${p1.cr2032}`);

  // 스탯 분배: HOP → 실제 이동 속도
  await page.keyboard.press("Escape");
  await reset();
  const walk = async () => { const a = await state(); await hold("KeyS", 1000); const b = await state(); return Math.hypot(b.x - a.x, b.z - a.z); };
  const d0 = await walk();
  await page.evaluate(() => window.__PK.rflab.open());
  await page.locator("#rflab-panel .lab-tab").nth(1).click();
  await page.locator('#rflab-panel .lab-alloc[data-stat="hop"]').click();
  await page.locator('#rflab-panel .lab-alloc[data-stat="hop"]').click();
  const noMore = await page.locator('#rflab-panel .lab-alloc[data-stat="hp"]').isDisabled();
  await page.keyboard.press("Escape");
  await reset();
  const d1 = await walk();
  const hop = (await statsNow()).hop;
  check("스탯 포인트를 HOP에 분배하면 실제 이동 속도가 빨라지고, 포인트가 떨어지면 버튼이 막힌다",
    hop === 6.8 && Math.abs(d1 / d0 - 6.8 / 6.4) < 0.02 && noMore, `HOP ${hop} · 1초 이동 ${d0.toFixed(2)} → ${d1.toFixed(2)} m`);

  await page.evaluate(() => { const p = window.__PK.progress(); p.cr2032 = 0; localStorage.setItem("packetKnight.save", JSON.stringify(p)); });
  await page.reload();
  await page.waitForFunction(() => window.__PK);
  await page.evaluate(() => window.__PK.rflab.open());
  const allDisabled = await page.locator("#rflab-panel .lab-up").evaluateAll((bs) => bs.every((b) => b.disabled));
  const re = await page.evaluate(() => window.__PK.progress());
  check("CR2032가 없으면 강화 버튼이 막히고, 장비·분배는 새로고침 후에도 유지된다",
    allDisabled && re.v === 8 && re.alloc.hop === 2 && re.gear.antenna === p1.gear.antenna);
  await page.keyboard.press("Escape");
}

// ---------- Stage 11.1: 건물 표지판 · 퀘스트 "📍 길 안내" ----------
await page.evaluate(() => {           // 안테나 강화 단계를 미완료로 — 그래야 그 단계에 길 안내 버튼이 뜬다
  const p = window.__PK.progress();
  p.gear.antenna = 0;
  localStorage.setItem("packetKnight.save", JSON.stringify(p));
});
await page.reload();
await page.waitForFunction(() => window.__PK);
{
  const signs = await page.evaluate(() => window.__PK.signs());
  check("건물 위 이름 표지판이 뜨고, 대장간 표지판이 RF 랩을 함께 알린다",
    signs.includes("🔨 패킷 대장간 · RF 랩") && signs.includes("📚 도서관") && signs.includes("📡 전파의 등대 · 알바") && signs.length >= 7, signs.join(" | "));
  await reset();
  await page.evaluate(() => window.__PK.quests.open("Q1"));
  const goes = await page.locator("#quests-panel .q-go").evaluateAll((bs) => bs.map((b) => b.dataset.place));
  await page.locator('#quests-panel .q-go[data-place="forge"]').click();
  const s0 = await state();
  const closed = await page.evaluate(() => !window.__PK.quests.isOpen());
  for (let i = 0; i < 40 && !(await state()).badge.includes("앞 도착"); i++) await tick(300);
  const s1 = await state();
  const trackerText = await page.locator("#quest-tracker").textContent();
  check("HUD 퀘스트 트래커에는 길 안내 버튼도, 새어 나온 'false' 글자도 없다",
    (await page.locator("#quest-tracker .q-go").count()) === 0 && !trackerText.includes("false"), trackerText.slice(-40));
  check("퀘스트 로그의 '📍 길 안내'가 그 단계의 건물(RF 랩 → 패킷 대장간)로 데려간다",
    goes.includes("forge") && goes.includes("tower") && closed && s0.modal.includes("패킷 대장간") && s1.badge.includes("패킷 대장간") && Math.hypot(s1.x - 6.6, s1.z + 1.0) < 1.2,
    `${goes.join(",")} · ${s0.modal} · ${s1.badge} @ (${s1.x.toFixed(1)}, ${s1.z.toFixed(1)})`);
  await page.keyboard.press("Escape");
}

// ---------- Stage 9: 퀘스트 트래커 · 로그 · 예측해 보기 · 배지 ----------
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__PK);
{
  const qState = () => page.evaluate(() => window.__PK.quests.state());
  const tracker = () => page.locator("#quest-tracker").textContent();
  const t0 = await tracker();
  check("새 게임은 Q0 퀘스트 트래커가 보인다", t0.includes("Q0") && t0.includes("○"), t0.slice(0, 40));
  const tBox = await page.locator("#quest-tracker").boundingBox();
  check("퀘스트 트래커는 한 줄로 접혀 있다 (다음 단계 하나만, 화면을 덜 가린다)",
    tBox.height < 40 && t0.includes("0/4") && (t0.match(/○/g) ?? []).length === 1, `${Math.round(tBox.height)}px · ${t0}`);

  await reset();
  await hold("KeyS", 1000); await reset(); await hold("KeyS", 1000);
  await page.keyboard.press("Space"); await tick(1200);
  await teleport(-9.0, 5.6); await tick(100);
  await page.keyboard.press("KeyF"); await tick(1200);
  const qs1 = await qState();
  check("걷기·점프·훈련용 봇 명중이 Q0 단계로 기록된다", qs1.progress.Q0?.walk === 10 && qs1.progress.Q0?.jump === 1 && qs1.progress.Q0?.hit === 1,
    JSON.stringify(qs1.progress.Q0));

  await page.keyboard.press("KeyQ");
  const lockedText = await page.locator("#quests-panel .q-whatif").textContent();
  check("Q 키로 퀘스트 로그가 열리고, 강좌 전에는 예측해 보기가 잠겨 있다",
    await page.evaluate(() => window.__PK.quests.isOpen()) && lockedText.includes("모두 마치면"));
  // 실제 탭은 열지 않는다 — 우리 click 핸들러(열람 기록)는 돌고, 기본 동작(새 탭)만 막는다
  const read = await page.evaluate(() => {
    const a = document.querySelector("#quests-panel .q-read");
    const before = window.__PK.progress().metrics.chapterOpens.intro ?? 0;
    a.addEventListener("click", (e) => e.preventDefault(), { once: true });
    a.click();
    return { tag: a.tagName, href: a.getAttribute("href"), target: a.target, rel: a.rel, url: window.__PK.library.lastChapterUrl(),
      opened: (window.__PK.progress().metrics.chapterOpens.intro ?? 0) - before, overlay: document.querySelector("#reader") !== null,
      logOpen: window.__PK.quests.isOpen() };
  });
  const w0 = Q9.whatifFor(Q9.QUESTS[0]);
  const want = `https://connbook.yalex-k.com/bluetooth/chapters/intro.html#${w0.section}`;
  check("'원문 읽기'는 교과서 그 절을 새 탭 링크로 열고(게임 안 리더 없음) 열람을 기록한다",
    read.tag === "A" && read.href === want && read.target === "_blank" && read.rel.includes("noopener") && read.url === want && read.opened === 1 && !read.overlay && read.logOpen,
    JSON.stringify(read));
  await page.keyboard.press("Escape");

  await page.evaluate(() => window.__PK.library.open());
  await lib(".course").first().click();
  await lib(".lib-btn.primary").click();
  await answerQuiz();
  await page.keyboard.press("Escape");
  await tick(50);
  const ready = await page.locator("#quest-tracker.ready").count();
  const toastReady = await page.locator("#toast").textContent();
  check("단계를 모두 마치면 트래커가 🔮 예측해 보기를 알린다", ready === 1 && toastReady.includes("예측해 보기"), toastReady);

  await page.click("#quest-tracker");
  const order = await page.evaluate(() => window.__PK.quests.shownOrder());
  const opts = page.locator("#quests-panel .q-whatif .opt");
  const shown = await opts.count();
  const wrongOrig = order.find((o) => o !== w0.answer);
  await page.locator(`#quests-panel .q-whatif .opt[data-orig="${wrongOrig}"]`).click();
  const afterWrong = await qState();
  const fb = await page.locator("#quests-panel .q-feedback").textContent();
  check("예측해 보기: 보기가 섞여 나오고, 틀리면 완료되지 않고 힌트·원문을 권한다",
    shown === w0.options.length && afterWrong.active === "Q0" && !afterWrong.done.Q0 && fb.includes("원문"), `보기 순서 ${order.join(",")}`);

  const cr0 = (await page.evaluate(() => window.__PK.progress())).cr2032;
  await page.locator(`#quests-panel .q-whatif .opt[data-orig="${w0.answer}"]`).click();
  const done = await qState();
  const cr1 = (await page.evaluate(() => window.__PK.progress())).cr2032;
  const badgeOn = await page.locator('#quests-panel .q-badge.on[data-chapter="intro"]').count();
  const toastDone = await page.locator("#toast").textContent();
  check("정답이면 Q0 완료: 칭호·CR2032 +5·📖 완독 배지, 다음 퀘스트 Q1이 열린다",
    Boolean(done.done.Q0) && done.title === "패킷 나이트" && cr1 === cr0 + 5 && badgeOn === 1 && done.active === "Q1" && toastDone.includes("Q0 완료"), toastDone);
  await page.keyboard.press("Escape");
  const closed = !(await page.evaluate(() => window.__PK.quests.isOpen()));

  await page.reload();
  await page.waitForFunction(() => window.__PK);
  const re = await qState();
  const t1 = await tracker();
  check("퀘스트 진행·칭호가 저장되고 새로고침 후 유지된다 (트래커는 Q1)", closed && Boolean(re.done.Q0) && re.active === "Q1" && t1.includes("Q1") && re.title === "패킷 나이트", `${t1.slice(0, 50)} · 칭호 ${re.title}`);

  // 모바일 폭: 트래커·퀘스트 버튼이 조이스틱·점프/발사 버튼과 겹치지 않는다
  await page.setViewportSize({ width: 390, height: 780 });
  await tick(50);
  const boxes = await page.evaluate(() => Object.fromEntries(["quest-tracker", "btn-quests", "joystick-zone", "btn-jump", "btn-fire", "btn-reset", "hp", "stats"]
    .map((id) => [id, document.getElementById(id).getBoundingClientRect().toJSON()])));
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const overlaps = [];
  for (const a of ["quest-tracker", "btn-quests"]) for (const b of ["joystick-zone", "btn-jump", "btn-fire", "btn-reset", "hp", "stats"]) if (hit(boxes[a], boxes[b])) overlaps.push(`${a}×${b}`);
  check("모바일 폭(390px)에서 퀘스트 트래커·버튼이 다른 조작 UI와 겹치지 않는다", overlaps.length === 0 && boxes["quest-tracker"].right <= 390, overlaps.join(", ") || "겹침 없음");
  await page.setViewportSize({ width: 1000, height: 700 });
}

// ---------- Stage 10: 보안의 감옥 · 지하묘지 · 돌진 · 서비스 상자 ----------
await page.evaluate(() => {
  const p = window.__PK.progress();
  p.quests.active = "Q6";
  for (const id of ["Q0", "Q1", "Q2", "Q3", "Q4", "Q5"]) p.quests.done[id] = "2026-11-02";
  Object.assign(p.quests.perks, { dle: true, advBoost: true, afh: true, dash: true });
  for (const c of ["intro", "radio", "phy", "advertising", "hopping", "connection", "gatt", "security", "power"]) p.cleared[c] = "2026-11-02";
  p.dungeon.maxFloor = 3;
  localStorage.setItem("packetKnight.save", JSON.stringify(p));
});
await page.reload();
await page.waitForFunction(() => window.__PK);
{
  const qState = () => page.evaluate(() => window.__PK.quests.state());
  const crNow = async () => (await page.evaluate(() => window.__PK.progress())).cr2032;
  const answerWhatif = async (id) => {
    const w = Q9.whatifFor(Q9.questById(id));
    await page.evaluate((q) => window.__PK.quests.open(q), id);
    await page.locator(`#quests-panel .q-whatif .opt[data-orig="${w.answer}"]`).click();
    await page.keyboard.press("Escape");
  };

  // 돌진 (Q5 보상): E 키 → 짧고 빠른 이동, 쿨다운
  await reset();
  const dashVisible = await page.locator("#btn-dash").isVisible();
  const a = await state();
  await page.keyboard.press("KeyE");
  await tick(250);
  const b = await state();
  const d1 = await page.evaluate(() => window.__PK.dash());
  await page.keyboard.press("KeyE");
  await tick(250);
  const c = await state();
  const dashDist = Math.hypot(b.x - a.x, b.z - a.z), again = Math.hypot(c.x - b.x, c.z - b.z);
  check("Q5 보상 돌진: E 키로 0.18초에 약 3.7 m 파고들고, 쿨다운 중엔 다시 안 된다", dashVisible && dashDist > 3 && again < 0.01 && d1.cooldown > 2,
    `${dashDist.toFixed(2)} m · 재사용 ${again.toFixed(2)} m`);

  // Q6: GATT 회관 방문 (클릭) + S등급 알바 → 서비스 상자
  await reset();
  const hp = await page.evaluate(() => window.__PK.projectToScreen(0, 5.0, -8.5));
  await page.mouse.click(hp.x, hp.y);
  await tick(20);
  const visited = (await qState()).progress.Q6?.visit === 1;
  await page.evaluate(() => { const p = window.__PK.progress(); p.quests.progress.Q6 = { visit: 1, job: 1 }; p.quests.active = "Q6"; localStorage.setItem("packetKnight.save", JSON.stringify(p)); });
  await page.reload();
  await page.waitForFunction(() => window.__PK);
  await answerWhatif("Q6");
  await reset();
  const cr0 = await crNow();
  await page.mouse.click(hp.x, hp.y);
  await tick(20);
  const boxLabel = await page.locator("#modal-action").textContent();
  await page.click("#modal-action");
  const cr1 = await crNow();
  await page.mouse.click(hp.x, hp.y);
  await tick(20);
  const boxGone = await page.locator("#modal-action").isHidden();
  check("Q6: GATT 회관 방문이 기록되고, 완료하면 서비스 상자(CR2032 20)를 한 번 열 수 있다", visited && boxLabel.includes("서비스 상자") && cr1 === cr0 + 20 && boxGone, `${cr0} → ${cr1}`);
  await page.click("#modal-close");

  // Q7: 보안의 감옥 — 랜드마크 클릭 → 페어링 시험 (1문제 틀려도 5/6 통과)
  await reset();
  const pp = await page.evaluate(() => window.__PK.projectToScreen(10, 4.7, -12));
  await page.mouse.click(pp.x, pp.y);
  await tick(20);
  const prisonModal = (await state()).modal;
  await page.click("#modal-action");
  const opened = await page.evaluate(() => window.__PK.prison.isOpen());
  await page.locator("#prison-panel .lib-btn.primary").click();
  let rounds = 0, firstWrongShown = false;
  for (; rounds < 6; rounds++) {
    const right = await page.evaluate(() => window.__PK.prison.answer());
    const opts = await page.locator("#prison-panel .opt").evaluateAll((bs) => bs.map((x) => x.dataset.choice));
    const pick = rounds === 0 ? opts.find((o) => o !== right) : right;
    await page.locator(`#prison-panel .opt[data-choice="${pick}"]`).click();
    if (rounds === 0) firstWrongShown = (await page.locator("#prison-panel .lab-result.bad").count()) === 1;
  }
  const endText = await page.locator("#prison-panel").textContent();
  await page.keyboard.press("Escape");
  const q7 = await qState();
  check("보안의 감옥: 랜드마크에서 페어링 시험을 열고, 틀리면 해설을 보여 주며, 5/6이면 Q7 단계가 채워진다",
    prisonModal?.includes("감옥") && opened && firstWrongShown && endText.includes("5/6") && q7.progress.Q7?.trial === 1, prisonModal);
  await answerWhatif("Q7");
  const q7done = await qState();
  check("Q7 완료 → AES 암호화 실드, Q8 시작", Boolean(q7done.done.Q7) && q7done.perks.aesShield && q7done.active === "Q8");

  // Q8: 지하묘지 — 계약 3건을 손잡이로 맞춘다
  await page.evaluate(() => window.__PK.crypt.open());
  const setKnobs = async (interval, latency, clock) => {
    if (interval !== null) await page.locator('#crypt-panel select[data-field="연결 간격"]').selectOption(String(interval));
    await page.locator('#crypt-panel select[data-field="페리페럴 지연"]').selectOption(String(latency));
    await page.locator('#crypt-panel select[data-field="수면 시계"]').selectOption(clock);
  };
  await setKnobs(4000, 0, "rc");
  const lockedWrong = await page.locator("#crypt-panel .crypt-submit").isDisabled(); // 심박: 4 s는 반응 한도 초과
  await setKnobs(1000, 0, "crystal");
  await page.locator("#crypt-panel .crypt-submit").click();
  await setKnobs(4000, 0, "rc");
  const rcFails = await page.locator("#crypt-panel .crypt-submit").isDisabled(); // 문 센서: RC 발진기면 창 넓히기로 3년 못 감
  await setKnobs(4000, 0, "crystal");
  await page.locator("#crypt-panel .crypt-submit").click();
  const fixedDisabled = await page.locator('#crypt-panel select[data-field="연결 간격"]').isDisabled();
  await setKnobs(null, 3, "crystal");
  await page.locator("#crypt-panel .crypt-submit").click();
  const cs = await page.evaluate(() => window.__PK.crypt.state());
  await page.keyboard.press("Escape");
  const q8 = await qState();
  check("지하묘지: 조건이 안 맞으면 계약 불가(RC 발진기·반응 한도), 3건 완수하면 Q8 단계가 채워진다 (환경 센서는 간격 고정)",
    lockedWrong && rcFails && fixedDisabled && cs.done.length === 3 && q8.progress.Q8?.contracts === 1, cs.done.join(","));
  await answerWhatif("Q8");
  const fin = await page.evaluate(() => ({ q: window.__PK.quests.state(), pwr: window.__PK.stats().pwr, rc: window.__PK.chargeCfg().RECHARGE_SEC }));
  const badgesOn = await (async () => { await page.evaluate(() => window.__PK.quests.open()); const n = await page.locator("#quests-panel .q-badge.on").count(); await page.keyboard.press("Escape"); return n; })();
  check("Q8 완료 → PWR +20(측정기 충전 300 → 250초), Q0~Q8 완독 배지 9개", Boolean(fin.q.done.Q8) && fin.pwr === 120 && fin.rc === 250 && badgesOn === 9,
    `PWR ${fin.pwr} · 충전 ${fin.rc}초 · 배지 ${badgesOn}`);

  // 새로고침 유지 + 모바일 폭에서 돌진 버튼이 다른 조작 UI와 겹치지 않는다
  await page.reload();
  await page.waitForFunction(() => window.__PK);
  const kept = await page.evaluate(() => window.__PK.quests.state());
  await page.setViewportSize({ width: 390, height: 780 });
  await tick(50);
  const boxes = await page.evaluate(() => Object.fromEntries(["btn-dash", "btn-fire", "btn-jump", "btn-reset", "btn-quests", "quest-tracker", "stats", "hp", "joystick-zone"]
    .map((id) => [id, document.getElementById(id).getBoundingClientRect().toJSON()])));
  const hit = (x, y) => x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom;
  const ov = ["btn-fire", "btn-jump", "btn-reset", "btn-quests", "quest-tracker", "stats", "hp", "joystick-zone"].filter((k) => hit(boxes["btn-dash"], boxes[k]));
  check("Stage 10 진행이 저장되고, 모바일 폭에서 돌진 버튼이 겹치지 않는다", kept.active === null && kept.perks.aesShield && boxes["btn-dash"].width > 0 && ov.length === 0, ov.join(", ") || "겹침 없음");
  await page.setViewportSize({ width: 1000, height: 700 });
}

// ---------- Stage 11: 휠 줌 수정 · 사운드 ----------
{
  await reset();
  const zoom = () => page.evaluate(() => window.__PK.zoom());
  // 휠 이벤트는 비동기로 도착하므로 도착 횟수를 세어 기다린다
  await page.evaluate(() => { window.__w = 0; window.addEventListener("wheel", () => { window.__w++; }, { passive: true }); });
  const wheelAt = async (dy, n) => { await page.mouse.wheel(0, dy); await page.waitForFunction((k) => window.__w >= k, n, { timeout: 3000 }); await tick(30); };
  // ① 팝업(강의실) 위 휠 → 팝업만 스크롤, 맵 줌은 그대로
  await page.evaluate(() => window.__PK.library.open());
  const z0 = await zoom();
  const panelBox = await page.locator("#library-panel").boundingBox();
  await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + panelBox.height / 2);
  await wheelAt(400, 1);
  const z1 = await zoom();
  await page.keyboard.press("Escape");
  // ② 정보 모달(입력은 막지 않는 팝업) 위 휠도 줌하지 않는다
  const lp = await page.evaluate(() => window.__PK.projectToScreen(-9.0, 4.6, -1.0));
  await page.mouse.click(lp.x, lp.y);
  await tick(20);
  const mb = await page.locator("#info-modal").boundingBox();
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await wheelAt(400, 2);
  const z2 = await zoom();
  await page.click("#modal-close");
  // ③ 맵 위 휠은 줌한다
  await page.mouse.move(500, 120);
  await wheelAt(-300, 3); // 줌 인 (기본 거리가 최대값일 수 있어 안쪽으로)
  const z3 = await zoom();
  check("팝업(강의실·정보 모달) 위에서 휠을 굴리면 맵이 줌되지 않고, 맵 위에서만 줌된다", z1 === z0 && z2 === z0 && z3 !== z0, `${z0} → 팝업 ${z1} · 모달 ${z2} · 맵 ${z3.toFixed(2)}`);
  await wheelAt(300, 4);

  // ④ 첫 입력 뒤 AudioContext가 깨어나고, 모든 효과음이 에러 없이 합성된다
  const au = await page.evaluate(() => window.__PK.audio.state());
  const synth = await page.evaluate(async () => {
    const A = await import("/src/ui/audio.js");
    const errs = [];
    for (const n of A.SFX_NAMES) { try { A.sfx(n); } catch (e) { errs.push(`${n}: ${e.message}`); } }
    return { n: A.SFX_NAMES.length, errs };
  });
  check("첫 사용자 입력 뒤 AudioContext가 동작하고, 효과음 전부가 에러 없이 합성된다", au.ctx === "running" && synth.errs.length === 0 && synth.n >= 35, `${au.ctx} · 효과음 ${synth.n}종`);

  // ⑤ DoD: 상호작용마다 음향 피드백 (행동 → 기대 효과음)
  const heard = async (fn) => { await page.evaluate(() => window.__PK.audio.clear()); await fn(); await tick(30); return page.evaluate(() => window.__PK.audio.log()); };
  const cases = [];
  const expect = (label, log, names) => cases.push({ label, ok: names.every((n) => log.includes(n)), miss: names.filter((n) => !log.includes(n)) });
  await reset();
  expect("점프·착지", await heard(async () => { await page.keyboard.press("Space"); await tick(1200); }), ["jump", "land"]);
  expect("걷기 발소리", await heard(() => hold("KeyS", 800)), ["step"]);
  expect("돌진", await heard(async () => { await page.keyboard.press("KeyE"); await tick(300); }), ["dash"]);
  await teleport(-9.0, 5.6); await tick(100);
  expect("발사(F 키)", await heard(async () => { await page.keyboard.press("KeyF"); await tick(300); }), ["fire"]);
  expect("명중·처치", await heard(async () => { await page.evaluate(() => { const pk = window.__PK; for (let i = 0; i < 300 && !pk.battle.state().monsters.some((m) => m.state === "dead"); i++) { pk.battle.fire(); pk.tick(0.1); } }); }), ["hit", "kill"]);
  expect("랜드마크 클릭 → 정보 모달", await heard(async () => { await reset(); await page.mouse.click(lp.x, lp.y); }), ["open"]);
  await page.click("#modal-close");
  expect("팝업 열기·버튼·닫기", await heard(async () => { await page.keyboard.press("KeyQ"); await page.locator("#quests-panel .close").click(); }), ["open", "click", "close"]);
  expect("퀴즈 정답/오답", await heard(async () => {
    await page.evaluate(() => window.__PK.library.open());
    await lib(".course").first().click();
    await lib(".lib-btn.primary").click();
    const key = await page.evaluate(() => window.__PK.library.answerKey());
    await lib(".opt").nth(key[0]).click();
    await lib(".lib-btn.primary").click();
    await lib(".opt").nth((key[1] + 1) % (await lib(".opt").count())).click();
    await page.keyboard.press("Escape");
  }), ["correct", "wrong"]);
  expect("RF 랩 강화", await heard(async () => {
    await page.evaluate(() => { window.__PK.rflab.open(); });
    await page.locator("#rflab-panel .lab-up").first().click();
    await page.keyboard.press("Escape");
  }), ["open"]);
  const labLog = await page.evaluate(() => window.__PK.audio.log());
  expect("알바: 비콘 핑·측정 확정", await heard(async () => {
    await page.evaluate(() => { const p = window.__PK.progress(); window.__PK.advanceClock(3600e3); return p; });
    await page.evaluate(() => window.__PK.job.open());
    await page.locator("#job-panel .lib-btn.primary").click();
    await tick(1500);
    await page.keyboard.press("KeyB");
    await tick(100);
    await page.keyboard.press("Escape");
  }), ["beacon", "measure"]);
  expect("던전 입장(포털·BGM 전환)·채널 토글·귀환", await heard(async () => {
    await page.evaluate(() => { const p = window.__PK.progress(); p.cr2032 = 50; localStorage.setItem("packetKnight.save", JSON.stringify(p)); });
    await page.evaluate(() => window.__PK.dungeon.enter());
    await tick(200);
    await page.locator("#chmap .cm").nth(5).dispatchEvent("pointerdown");
    await page.evaluate(() => window.__PK.dungeon.leave());
    await tick(50);
  }), ["portal", "bgm:dungeon", "channelToggle", "bgm:village"]);
  const failed = cases.filter((c) => !c.ok);
  check("DoD: 모든 상호작용에 음향 피드백이 있다 (이동·전투·팝업·퀴즈·알바·던전)", failed.length === 0,
    failed.map((c) => `${c.label}: ${c.miss.join("/")} 없음`).join(", ") || `${cases.length}개 상황 모두 소리남`);
  void labLog;

  // ⑥ 음소거: M 키 · 버튼, 설정은 새로고침 후에도 유지
  await page.keyboard.press("KeyM");
  const muted = await page.evaluate(() => window.__PK.audio.state().muted);
  const icon = await page.locator("#btn-sound").textContent();
  await page.reload();
  await page.waitForFunction(() => window.__PK);
  const keptMute = await page.evaluate(() => window.__PK.audio.state().muted);
  await page.click("#btn-sound");
  const unmuted = !(await page.evaluate(() => window.__PK.audio.state().muted));
  check("M 키·🔊 버튼으로 음소거하고, 설정이 새로고침 후에도 유지된다", muted && icon === "🔇" && keptMute && unmuted);

  // ⑦ 모바일 폭: 사운드 버튼이 배지·스탯과 겹치지 않는다
  await page.setViewportSize({ width: 390, height: 780 });
  await tick(50);
  const bx = await page.evaluate(() => Object.fromEntries(["btn-sound", "badge", "stats", "hud", "hp"].map((id) => [id, document.getElementById(id).getBoundingClientRect().toJSON()])));
  const hit = (x, y) => x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom;
  const ov = ["badge", "stats", "hud", "hp"].filter((k) => hit(bx["btn-sound"], bx[k]));
  check("모바일 폭에서 사운드 버튼이 다른 HUD와 겹치지 않는다", ov.length === 0, ov.join(", ") || "겹침 없음");
  await page.setViewportSize({ width: 1000, height: 700 });
}

check("콘솔/페이지 에러가 없다", errors.length === 0, errors.join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
