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
  check("도서관 '주파수 도약과 공존' 만점 = AFH 스킬 (스탯 보너스 없음)",
    LIBRARY_COURSES.some((c) => c.chapter === "hopping" && c.reward === "afh") && !no && P.hasAfhSkill(p) && r.reward?.stat === "afh" && Object.values(p.bonus).every((v) => v === 0));
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
    cOnly && p.bonus.tx === 1 && P.effectiveStats(p).tx > tx0 && qs.perks.dle && qs.perks.advBoost && qs.active === null && Q9.badges(qs).join() === "intro,radio,phy,advertising",
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
  check("Stage 8 세이브(v6)가 손실 없이 v7로 마이그레이션된다 (퀘스트는 Q0부터)",
    l.status === "loaded" && l.progress.v === 7 && l.progress.cr2032 === 13 && l.progress.dungeon.maxFloor === 3 && l.progress.quests.active === "Q0");
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

// ---------- Stage 5: 알바 (60초 RSSI 측정 → CR2032 지급·저장) ----------
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
  check("등대 모달에 '알바 시작' 버튼이 있다", (await state()).modal?.includes("등대") && label.includes("알바"), label);
  await page.click("#modal-action");
  await page.locator("#job-panel .lib-btn.primary").click(); // 60초 측정 시작

  await tick(1200);
  const s1 = await jobState();
  check("측정 중 광고 패킷(약 100 ms 간격)이 RSSI 샘플로 쌓인다", s1.phase === "measure" && s1.samples >= 9 && s1.samples <= 13, `1.2초 → ${s1.samples}개`);

  const a = await state();
  await hold("KeyW", 300);
  const b = await state();
  check("알바 중에는 기사가 움직이지 않는다", Math.hypot(b.x - a.x, b.z - a.z) < 0.01);

  await page.keyboard.press("Space");
  const s2 = await jobState();
  const shown = await page.locator(".job-estimate").textContent();
  check("스페이스바로 측정을 확정하면 실제 거리와 판정이 공개된다", s2.phase === "reveal" && s2.rounds === 1 && /실제 .* m · 추정/.test(shown), shown);

  // 남은 시간은 봇처럼 플레이: 패킷 10개가 모이면 확정
  const result = await page.evaluate(() => {
    const pk = window.__PK;
    while (pk.job.state().phase !== "done") {
      pk.tick(1 / 60);
      const st = pk.job.state();
      if (st.phase === "measure" && st.samples >= 10) window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    }
    return pk.job.state().result;
  });
  const prog = await page.evaluate(() => window.__PK.progress());
  const hudCoins = await page.locator('#stats [data-stat="cr2032"]').textContent();
  check("60초가 끝나면 등급에 따라 CR2032가 지급된다",
    result.rounds >= 10 && result.reward >= 2 && prog.cr2032 === result.reward && hudCoins.includes(`${result.reward}`),
    `비콘 ${result.rounds}개 · ${result.score}점 · 등급 ${result.grade} · +${result.reward}`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("packetKnight.save")));
  check("CR2032 잔액이 localStorage에 저장된다", saved.v >= 2 && saved.cr2032 === result.reward && saved.job.runs === 1);

  // 두 번째 판은 도중에 나가면 보수 없음
  await page.locator("#job-panel .lib-btn.primary").click(); // 한 번 더
  await tick(3000);
  await page.keyboard.press("Escape");
  await tick(100);
  const after = await page.evaluate(() => window.__PK.progress());
  check("측정 도중 나가면 보수 없이 중단되고 다시 조작할 수 있다",
    after.cr2032 === result.reward && after.job.runs === 1 && !(await page.evaluate(() => window.__PK.job.isOpen())));

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

  // AFH 버튼 (호핑 강좌 이수자만) → 6 이벤트 뒤에 적용, 이후 드러난 대역으로 도약하지 않는다
  const afhLocked = await page.locator("#chmap .cm-afh").isDisabled();
  await page.evaluate(() => { const p = window.__PK.progress(); p.cleared.hopping = "2026-11-01"; localStorage.setItem("packetKnight.save", JSON.stringify(p)); });
  check("AFH 버튼은 도서관 '주파수 도약' 강좌를 이수해야 열린다", afhLocked);
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
    allDisabled && re.v === 7 && re.alloc.hop === 2 && re.gear.antenna === p1.gear.antenna);
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
  await page.locator("#quests-panel .q-read").click();
  const url = await page.evaluate(() => window.__PK.library.readerUrl());
  const w0 = Q9.whatifFor(Q9.QUESTS[0]);
  check("'원문 읽기'가 게임 안 리더로 교과서 새 주소의 그 절을 연다", url === `https://connbook.yalex-k.com/bluetooth/chapters/intro.html#${w0.section}`, url);
  await page.keyboard.press("Escape");
  const stillOpen = await page.evaluate(() => window.__PK.quests.isOpen() && !window.__PK.library.isReaderOpen());
  check("Esc는 리더만 먼저 닫고 퀘스트 로그는 남는다", stillOpen);
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
  check("퀘스트 진행·칭호가 저장되고 새로고침 후 유지된다 (트래커는 Q1)", closed && Boolean(re.done.Q0) && re.active === "Q1" && t1.includes("Q1") && t1.includes("패킷 나이트"), t1.slice(0, 50));

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

check("콘솔/페이지 에러가 없다", errors.length === 0, errors.join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
