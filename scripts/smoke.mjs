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
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.route((url) => url.origin === ORIGIN && url.pathname === "/", (r) => r.fulfill({ body: readFileSync(path.join(ROOT, "index.html")), contentType: "text/html" }));
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
const teleport = (x, z, y) => page.evaluate(([x, z, y]) => {
  const pk = window.__PK;
  pk.knight.position.set(x, y ?? pk.groundHeightAt(x, z), z);
}, [x, z, y]);
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
  await page.evaluate(() => { window.__PK.knight.rotation.y = 3.0; });
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

check("콘솔/페이지 에러가 없다", errors.length === 0, errors.join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
