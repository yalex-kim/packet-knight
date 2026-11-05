// 기사 렌더링 — 복셀 기사 모델(Stage 11.6), 착지 충격파, 이동 목표 마커, 스쿼시/스트레치/보행 애니메이션 (THREE 의존)

import * as THREE from "three";

const LAND_SQUASH_TIME = 0.22;
const LANDING_RING_TIME = 0.28;

// knight(위치·회전) > rig(스쿼시/바운스, 발밑 피벗) > 몸통·머리·팔·다리
// Stage 12.5 다시 만듦: 툰 셰이딩 + 외곽선, 큰 머리 비율, 옷마다 형태가 다른 의상 세트, 빛 번지는 무기 (PRD §3.1)
// 앞쪽은 +z. 팔·다리는 어깨·엉덩이를 피벗으로 흔든다.
export const knight = new THREE.Group();
const rig = new THREE.Group();
knight.add(rig);

// 툰 셰이딩: 3단 명암 (일러스트처럼 또렷하게)
const TOON = (() => {
  const d = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: TOON });
const glowMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x15202e, side: THREE.BackSide });
const OUTLINE_W = 0.022;

const MAT = {
  under: toon(0x3a4458),        // 속옷(사슬 갑옷)
  steel: toon(0xd3dce6), steelDark: toon(0x8e9aa8),
  tabard: toon(0xd8443c), tabardDark: toon(0xa8322b), trim: toon(0xe8eef5),
  gold: toon(0xf2c14e), goldDark: toon(0xc9962a),
  leather: toon(0x6b4a32), boot: toon(0x3d2c22),
  coin: toon(0xdfe4ea), coinDark: toon(0x9aa3ad),
  plume: toon(0xd8443c),
  glow: glowMat(0x39d0ff), glowTip: glowMat(0x7de3ff),
  blade: glowMat(0x7de3ff), halo: new THREE.MeshBasicMaterial({ color: 0x7de3ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })
};
/** 상자 하나 + 외곽선 (빛나는 재질은 외곽선 없음) — (cx, cy, cz)는 부모 기준 중심 */
function box(parent, w, h, d, mat, cx, cy, cz, outline = true) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(cx, cy, cz);
  m.castShadow = !mat.isMeshBasicMaterial;
  if (outline && !mat.isMeshBasicMaterial) {
    const o = new THREE.Mesh(geo, OUTLINE);
    o.scale.set(1 + OUTLINE_W * 2 / w, 1 + OUTLINE_W * 2 / h, 1 + OUTLINE_W * 2 / d);
    m.add(o);
  }
  parent.add(m);
  return m;
}
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function group(parent, visible = false) { const g = new THREE.Group(); parent.add(g); g.visible = visible; return g; }

// ---------- 몸 (공통) ----------
const HIP_Y = 0.4, SHOULDER_Y = 0.8;
const legL = pivot(rig, -0.11, HIP_Y, 0), legR = pivot(rig, 0.11, HIP_Y, 0);
for (const leg of [legL, legR]) {
  box(leg, 0.17, 0.26, 0.19, MAT.under, 0, -0.13, 0);
  box(leg, 0.19, 0.1, 0.21, MAT.steelDark, 0, -0.06, 0.01);          // 무릎 받이
  box(leg, 0.21, 0.13, 0.27, MAT.boot, 0, -0.33, 0.03);               // 장화
}
const torso = pivot(rig, 0, HIP_Y, 0);
box(torso, 0.44, 0.42, 0.28, MAT.under, 0, 0.2, 0);
box(torso, 0.48, 0.08, 0.3, MAT.leather, 0, 0.02, 0);                 // 허리띠
box(torso, 0.1, 0.08, 0.04, MAT.gold, 0, 0.02, 0.16);                  // 버클
// 머리: 큰 투구 (귀여운 비율) + 바이저 + BLE 안테나 깃
const head = pivot(torso, 0, 0.44, 0);
head.scale.setScalar(0.84);   // Stage 13.26: 머리가 너무 커 보여 16% 줄임 (투구·두건·안테나 모두)
const helm = group(head, true);
box(helm, 0.5, 0.44, 0.48, MAT.steel, 0, 0.22, 0);
box(helm, 0.54, 0.08, 0.52, MAT.steelDark, 0, 0.02, 0);               // 목가리개
box(helm, 0.36, 0.08, 0.03, MAT.glow, 0, 0.24, 0.245);                 // 바이저 슬릿
box(helm, 0.07, 0.16, 0.03, MAT.steelDark, 0, 0.12, 0.25);             // 코 보호대
box(helm, 0.52, 0.06, 0.5, MAT.steelDark, 0, 0.45, 0);                 // 정수리 띠
const plume = group(head, true);
box(plume, 0.08, 0.12, 0.42, MAT.plume, 0, 0.52, -0.04);
box(plume, 0.08, 0.1, 0.2, MAT.plume, 0, 0.6, -0.16);
const antenna = box(head, 0.03, 0.38, 0.03, MAT.steelDark, 0.18, 0.62, -0.1, false);
const antennaTip = box(head, 0.08, 0.08, 0.08, MAT.glowTip, 0.18, 0.83, -0.1);
// 팔
const armL = pivot(rig, -0.29, SHOULDER_Y, 0), armR = pivot(rig, 0.29, SHOULDER_Y, 0);
for (const arm of [armL, armR]) {
  box(arm, 0.13, 0.32, 0.15, MAT.under, 0, -0.16, 0);
  box(arm, 0.15, 0.1, 0.17, MAT.leather, 0, -0.34, 0);                 // 장갑
}

// ---------- 의상 세트 (옷마다 형태가 다르다 — 상점 그림처럼) ----------
const COSTUME = {};
const capes = [];   // 펄럭이는 망토 조각 (걸을 때 흔든다)
/** 어깨 갑옷 한 쌍 */
function pauldrons(g, mat, edge, size = 0.2) {
  for (const sx of [-1, 1]) {
    const p = pivot(g, sx * 0.29, 0.43, 0);
    box(p, size, 0.1, size + 0.02, mat, sx * 0.02, 0.03, 0);
    box(p, size + 0.02, 0.05, size + 0.04, edge, sx * 0.02, -0.03, 0);
  }
}
/** 펄럭이는 망토: 위 조각은 어깨에, 아래 조각은 위 조각 끝에 매달린다 */
function cape(g, mat, trimMat) {
  const top = pivot(g, 0, 0.46, -0.17);
  box(top, 0.5, 0.36, 0.04, mat, 0, -0.18, 0);
  if (trimMat) for (const sx of [-1, 1]) box(top, 0.03, 0.36, 0.05, trimMat, sx * 0.25, -0.18, 0, false);
  const low = pivot(top, 0, -0.36, 0);
  box(low, 0.56, 0.42, 0.04, mat, 0, -0.21, 0);
  if (trimMat) { box(low, 0.58, 0.035, 0.05, trimMat, 0, -0.41, 0, false); for (const sx of [-1, 1]) box(low, 0.03, 0.42, 0.05, trimMat, sx * 0.28, -0.21, 0, false); }
  capes.push({ top, low });
  return { top, low };
}

// 붉은 기사복: 은 흉갑 + 빨간 겉옷(은 테두리) + 하늘색 신호 문양
{
  const g = COSTUME.classic = group(torso);
  box(g, 0.46, 0.3, 0.3, MAT.steel, 0, 0.3, 0);
  box(g, 0.36, 0.5, 0.03, MAT.tabard, 0, 0.12, 0.165);
  box(g, 0.36, 0.5, 0.03, MAT.tabard, 0, 0.12, -0.165);
  for (const sx of [-1, 1]) box(g, 0.03, 0.5, 0.035, MAT.trim, sx * 0.18, 0.12, 0.168, false);
  box(g, 0.36, 0.03, 0.035, MAT.trim, 0, -0.13, 0.168, false);
  box(g, 0.06, 0.06, 0.02, MAT.glow, 0, 0.24, 0.185);
  box(g, 0.16, 0.03, 0.02, MAT.glow, 0, 0.31, 0.185);
  box(g, 0.26, 0.03, 0.02, MAT.glow, 0, 0.37, 0.185);
  pauldrons(g, MAT.steel, MAT.steelDark);
}
// SIG 블루 제복: 무릎까지 오는 파란 튜닉 + 은 테두리 + 가슴의 흰 룬 ᛒ + 깃
{
  const g = COSTUME.sig = group(torso);
  const blue = toon(0x0b62d6), blueDark = toon(0x0a4aa3);
  box(g, 0.47, 0.42, 0.31, blue, 0, 0.21, 0);
  box(g, 0.47, 0.22, 0.31, blueDark, 0, -0.12, 0);                       // 치마
  box(g, 0.49, 0.04, 0.33, MAT.trim, 0, -0.23, 0, false);
  for (const sx of [-1, 1]) box(g, 0.035, 0.6, 0.02, MAT.trim, sx * 0.08, 0.1, 0.162, false);
  box(g, 0.3, 0.07, 0.33, MAT.trim, 0, 0.42, 0);                          // 깃
  const rune = glowMat(0xffffff);
  box(g, 0.035, 0.24, 0.02, rune, 0, 0.24, 0.17);
  for (const [x, y, r] of [[0.045, 0.32, -0.8], [0.045, 0.17, 0.8], [-0.035, 0.29, 0.8], [-0.035, 0.2, -0.8]]) { const k = box(g, 0.03, 0.12, 0.02, rune, x, y, 0.172); k.rotation.z = r; }
  pauldrons(g, blue, MAT.trim, 0.18);
}
// 오라캐스트 보라: 보라 겉옷 + 라벤더 테두리 망토(등에 빛나는 방송 문양) + 금 걸쇠
{
  const g = COSTUME.auracast = group(torso);
  const purple = toon(0x7a5cc9), purpleDark = toon(0x4f3a8f), lav = toon(0xd5c6ff);
  box(g, 0.46, 0.42, 0.3, purple, 0, 0.21, 0);
  box(g, 0.46, 0.18, 0.3, purpleDark, 0, -0.1, 0);
  box(g, 0.5, 0.06, 0.34, lav, 0, 0.42, 0);
  for (const sx of [-1, 1]) box(g, 0.08, 0.08, 0.04, MAT.gold, sx * 0.17, 0.4, 0.17);
  const c = cape(g, purpleDark, lav);
  const emb = pivot(c.low, 0, -0.18, -0.03);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 24), glowMat(0xd5c6ff)); ring.rotation.y = Math.PI; emb.add(ring);
  box(emb, 0.04, 0.04, 0.02, glowMat(0xffffff), 0, 0, 0);
  pauldrons(g, purple, lav, 0.18);
}
// 메시 숲지기: 초록 후드 튜닉(뾰족 두건, 민트 테두리) + 잎 문양 — 투구 대신 두건
{
  const g = COSTUME.mesh = group(torso);
  const green = toon(0x2f8f5a), greenDark = toon(0x22704a), mint = glowMat(0x7dffb5);
  box(g, 0.47, 0.42, 0.31, green, 0, 0.21, 0);
  box(g, 0.47, 0.26, 0.31, greenDark, 0, -0.13, 0);
  box(g, 0.49, 0.03, 0.33, mint, 0, -0.27, 0, false);
  for (const [x, y, r] of [[0, 0.2, 0], [-0.06, 0.28, 0.6], [0.06, 0.28, -0.6], [0, 0.34, 0]]) { const l = box(g, 0.05, 0.12, 0.02, mint, x, y, 0.165); l.rotation.z = r; }
  COSTUME.meshHood = group(head);
  const h = COSTUME.meshHood;
  box(h, 0.56, 0.5, 0.54, green, 0, 0.25, -0.02);
  box(h, 0.4, 0.14, 0.38, green, 0, 0.55, -0.08);
  box(h, 0.22, 0.12, 0.2, greenDark, 0, 0.66, -0.16);                      // 뾰족한 끝
  box(h, 0.4, 0.34, 0.04, toon(0x16202c), 0, 0.22, 0.26);                  // 두건 안 그늘
  box(h, 0.3, 0.06, 0.03, MAT.glow, 0, 0.24, 0.285);                       // 눈빛
  for (const sx of [-1, 1]) box(h, 0.03, 0.4, 0.05, mint, sx * 0.24, 0.24, 0.265, false);
  box(h, 0.5, 0.03, 0.05, mint, 0, 0.44, 0.265, false);
}
// RPA 그림자: 검은 망토와 두건, 하늘색 빛 테두리
{
  const g = COSTUME.stealth = group(torso);
  const black = toon(0x262b36), blackDark = toon(0x16191f), cyan = glowMat(0x39d0ff);
  box(g, 0.47, 0.42, 0.31, black, 0, 0.21, 0);
  box(g, 0.49, 0.3, 0.33, blackDark, 0, -0.14, 0);
  for (const sx of [-1, 1]) box(g, 0.03, 0.62, 0.02, cyan, sx * 0.1, 0.06, 0.168, false);
  box(g, 0.5, 0.03, 0.35, cyan, 0, -0.3, 0, false);
  cape(g, blackDark, cyan);
  COSTUME.stealthHood = group(head);
  const h = COSTUME.stealthHood;
  box(h, 0.56, 0.5, 0.54, black, 0, 0.25, -0.02);
  box(h, 0.36, 0.12, 0.36, black, 0, 0.55, -0.1);
  box(h, 0.4, 0.34, 0.04, toon(0x0b0d12), 0, 0.22, 0.26);
  box(h, 0.3, 0.06, 0.03, cyan, 0, 0.24, 0.285);
  for (const sx of [-1, 1]) box(h, 0.03, 0.42, 0.05, cyan, sx * 0.24, 0.24, 0.265, false);
}
// 황금 CR2032: 층층이 겹친 금판 흉갑 + 가슴·어깨의 코인 전지 + 금 투구
{
  const g = COSTUME.gold = group(torso);
  for (let i = 0; i < 4; i++) box(g, 0.48 - i * 0.02, 0.12, 0.32, i % 2 ? MAT.goldDark : MAT.gold, 0, 0.42 - i * 0.11, 0);
  box(g, 0.44, 0.18, 0.3, MAT.goldDark, 0, -0.08, 0);
  const coin = (parent, x, y, z, r, rotX) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.035, 18), MAT.coin);
    c.rotation.x = rotX; c.position.set(x, y, z); c.castShadow = true; parent.add(c);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.04, 18), MAT.coinDark); ring.rotation.x = rotX; ring.position.set(x, y, z + (rotX ? 0.003 : 0)); parent.add(ring);
  };
  for (const [x, y] of [[-0.11, 0.33], [0.11, 0.33], [0, 0.2]]) coin(g, x, y, 0.17, 0.065, Math.PI / 2);
  for (const sx of [-1, 1]) {
    const p = pivot(g, sx * 0.3, 0.44, 0);
    box(p, 0.22, 0.12, 0.24, MAT.gold, sx * 0.02, 0.03, 0);
    coin(p, sx * 0.02, 0.1, 0, 0.1, 0);
  }
}
// ---------- 기존 옷 틀을 복제해 색만 바꿔 칠한 옷 (Stage 13.24) ----------
// 틀(오라캐스트·SIG·금빛·메시)은 색이 모양에 박혀 있어서, 그대로 빌리면 원래 색으로 나온다(LE 오디오 망토가 보라색이던 버그).
// 틀을 통째로 복제하고 색표(원래 색 → 새 색)대로 재질을 바꿔 칠한다. 펄럭이는 망토도 복제본에 따로 등록한다.
function recolorCostume(src, dst, map) {
  const orig = COSTUME[src], copy = orig.clone(true);
  const a = [], b = [];
  orig.traverse((o) => a.push(o)); copy.traverse((o) => b.push(o));
  const cache = new Map();
  b.forEach((o) => {
    if (!o.isMesh || !o.material?.color) return;
    const to = map[o.material.color.getHex()];
    if (to === undefined) return;
    const key = `${o.material.uuid}:${to}`;
    let m = cache.get(key);
    if (!m) { m = o.material.clone(); m.color.setHex(to); cache.set(key, m); }
    o.material = m;
  });
  for (const c of [...capes]) { const i = a.indexOf(c.top); if (i >= 0) capes.push({ top: b[i], low: b[a.indexOf(c.low)] }); }
  copy.visible = false;
  orig.parent.add(copy);
  COSTUME[dst] = copy;
}
recolorCostume("auracast", "leaudio", { 0x7a5cc9: 0x0f8f8a, 0x4f3a8f: 0x0a4f4c, 0xd5c6ff: 0x2ff0e0 });                         // 🎧 청록·검정 + 빛나는 청록 테
recolorCostume("sig", "pawr", { 0x0b62d6: 0xf2f4f7, 0x0a4aa3: 0xd23a3a, 0xffffff: 0xff4a4a });                                // 🏷️ 흰 제복 + 빨간 치마·룬
recolorCostume("gold", "aoa", { 0xf2c14e: 0xc9d3de, 0xc9962a: 0x7e8a98, 0xdfe4ea: 0x39d0ff, 0x9aa3ad: 0x1d6f8f });             // 📐 은빛 판 + 하늘색 안테나 원판
recolorCostume("gold", "magnetron", { 0xf2c14e: 0xff7a1a, 0xc9962a: 0xb8510a, 0xdfe4ea: 0xe8ecf0, 0x9aa3ad: 0xff9a3c });       // 🟧 주황 판 + 크롬 원판
recolorCostume("mesh", "hunter", { 0x2f8f5a: 0x1f6a3a, 0x22704a: 0x123d24, 0x7dffb5: 0xffd76b });                             // 🎯 짙은 초록 + 금빛 테
recolorCostume("meshHood", "hunterHood", { 0x2f8f5a: 0x1f6a3a, 0x22704a: 0x123d24, 0x7dffb5: 0xffd76b });

// ---------- 새 옷마다 다른 모양 (Stage 13.26) — 색만 바꾼 틀 위에 얹는 장식 ----------
{
  const T = (c) => toon(c), G = (c) => glowMat(c);
  // 🎧 LE 오디오: 투구 위 헤드폰 + 가슴의 이퀄라이저 막대
  const lh = COSTUME.leaudioHead = group(head);
  const band = T(0x1c2430), cupM = T(0x0f8f8a), ringM = G(0x2ff0e0);
  box(lh, 0.06, 0.06, 0.12, band, 0, 0.5, 0);
  for (const sx of [-1, 1]) {
    box(lh, 0.06, 0.2, 0.08, band, sx * 0.24, 0.4, 0);
    box(lh, 0.08, 0.18, 0.18, cupM, sx * 0.29, 0.24, 0);
    box(lh, 0.02, 0.12, 0.12, ringM, sx * 0.335, 0.24, 0, false);
  }
  const lc = COSTUME.leaudioChest = group(torso);
  [0.1, 0.16, 0.22, 0.14, 0.08].forEach((h, i) => box(lc, 0.035, h, 0.02, G(0x2ff0e0), (i - 2) * 0.055, 0.2 + h / 2, 0.168, false));
  // 🏷️ PAwR: 가슴·치마·어깨에 매달린 전자 가격표
  const pt = COSTUME.pawrTags = group(torso);
  const tagW = T(0xffffff), tagR = G(0xff4a4a);
  for (const [x, y, z, r] of [[-0.12, 0.3, 0.17, 0.2], [0.13, 0.25, 0.17, -0.15], [-0.05, -0.05, 0.17, 0.1], [0.1, -0.08, 0.17, -0.2], [-0.33, 0.36, 0.05, 0], [0.33, 0.36, 0.05, 0]]) {
    const t = pivot(pt, x, y, z); t.rotation.z = r;
    box(t, 0.1, 0.07, 0.02, tagW, 0, 0, 0);
    box(t, 0.07, 0.02, 0.022, tagR, 0, 0.012, 0.002, false);
  }
  // 📻 BR/EDR 레트로: 왼쪽 어깨의 굵은 안테나 + 가슴의 라디오
  const rg = COSTUME.retroGear = group(torso);
  box(rg, 0.05, 0.42, 0.05, T(0x2a2a2a), -0.3, 0.68, -0.05);
  box(rg, 0.09, 0.09, 0.09, G(0xff6a3c), -0.3, 0.9, -0.05);
  box(rg, 0.22, 0.15, 0.06, T(0x5a3a20), 0, 0.27, 0.17);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) box(rg, 0.02, 0.02, 0.02, T(0x1a120a), -0.07 + i * 0.03, 0.29 - j * 0.04, 0.205, false);
  box(rg, 0.05, 0.05, 0.02, G(0xffd76b), 0.06, 0.27, 0.205, false);
  // 📐 AoA: 어깨 위 2×2 안테나 배열 판 + 등의 안테나 네 가닥
  const aa = COSTUME.aoaArray = group(torso);
  for (const sx of [-1, 1]) {
    box(aa, 0.2, 0.03, 0.2, T(0x7e8a98), sx * 0.3, 0.52, 0);
    for (const ax of [-0.05, 0.05]) for (const az of [-0.05, 0.05]) box(aa, 0.06, 0.05, 0.06, G(0x39d0ff), sx * 0.3 + ax, 0.56, az, false);
  }
  for (let i = 0; i < 4; i++) { box(aa, 0.025, 0.3, 0.025, T(0xc9d3de), -0.09 + i * 0.06, 0.55, -0.18); box(aa, 0.045, 0.045, 0.045, G(0x39d0ff), -0.09 + i * 0.06, 0.71, -0.18, false); }
  // 🟧 마그네트론: 가슴의 전자레인지 문(주황 창) + 등의 냉각 핀
  const mg = COSTUME.magGear = group(torso);
  box(mg, 0.3, 0.2, 0.03, T(0xe8ecf0), -0.02, 0.26, 0.17);
  box(mg, 0.2, 0.13, 0.02, G(0xff8a2a), -0.05, 0.26, 0.188, false);
  box(mg, 0.05, 0.13, 0.02, T(0x3a3f4f), 0.1, 0.26, 0.188, false);
  for (let i = 0; i < 4; i++) box(mg, 0.4, 0.03, 0.05, T(0xb8510a), 0, 0.12 + i * 0.08, -0.18);
  // 🎯 비콘 사냥꾼: 허리의 랜턴 + 등의 화살통
  const hg = COSTUME.hunterGear = group(torso);
  box(hg, 0.08, 0.12, 0.08, T(0x3a2a14), 0.24, -0.02, 0.1);
  box(hg, 0.06, 0.08, 0.06, G(0xffd76b), 0.24, -0.02, 0.1, false);
  const qv = pivot(hg, 0.1, 0.3, -0.19); qv.rotation.z = -0.35;
  box(qv, 0.1, 0.36, 0.1, T(0x5a3a20), 0, 0, 0);
  for (const dx of [-0.025, 0.025]) box(qv, 0.02, 0.1, 0.02, T(0xd8d0c0), dx, 0.22, 0, false);
}

const OUTFIT_SET = { classic: ["classic"], sig: ["sig"], auracast: ["auracast"], mesh: ["mesh", "meshHood"], stealth: ["stealth", "stealthHood"], gold: ["gold"],
  magnetron: ["magnetron", "magGear"], leaudio: ["leaudio", "leaudioHead", "leaudioChest"], pawr: ["pawr", "pawrTags"], retro: ["classic", "retroGear"],
  aoa: ["aoa", "aoaArray"], hunter: ["hunter", "hunterHood", "hunterGear"] };   // retro는 classic 틀 — 그 틀은 옷 색(MAT.tabard)을 따른다

// ---------- 무기 ----------
const shieldParts = [];
const shield = pivot(armL, -0.1, -0.22, 0.02);
shieldParts.push(shield);
box(shield, 0.06, 0.36, 0.3, MAT.tabard, 0, 0, 0);
box(shield, 0.07, 0.38, 0.04, MAT.trim, 0, 0, 0.15, false);
box(shield, 0.07, 0.38, 0.04, MAT.trim, 0, 0, -0.15, false);
box(shield, 0.075, 0.1, 0.1, MAT.glow, -0.01, 0.02, 0);

/** 빛나는 날: 심 + 덧씌운 빛 번짐 */
function glowBlade(parent, w, h, cy, mat = MAT.blade) {
  box(parent, w, h, 0.03, mat, 0, cy, 0);
  const halo = new THREE.Mesh(new THREE.BoxGeometry(w * 2.6, h * 1.08, 0.08), MAT.halo);
  halo.position.set(0, cy, 0); parent.add(halo);
}
const sword = pivot(armR, 0, -0.38, 0.06);
sword.rotation.x = Math.PI / 2.4;                                  // 앞으로 기울여 든다
const weaponSets = {
  sword: (() => { const g = group(sword, true);
    box(g, 0.05, 0.14, 0.05, MAT.leather, 0, 0, 0); box(g, 0.07, 0.06, 0.07, MAT.gold, 0, -0.09, 0);
    box(g, 0.26, 0.05, 0.07, MAT.gold, 0, 0.09, 0); box(g, 0.06, 0.06, 0.08, MAT.gold, -0.13, 0.11, 0); box(g, 0.06, 0.06, 0.08, MAT.gold, 0.13, 0.11, 0);
    glowBlade(g, 0.085, 0.62, 0.43); return [g]; })(),
  dagger: (() => {
    const mk = (parent) => { const g = pivot(parent, 0, -0.38, 0.06); g.rotation.x = Math.PI / 2.4;
      box(g, 0.05, 0.12, 0.05, MAT.leather, 0, 0, 0); box(g, 0.18, 0.04, 0.06, MAT.gold, 0, 0.08, 0);
      glowBlade(g, 0.075, 0.32, 0.27, glowMat(0xffd76b)); return g; };
    const a = mk(armR), b = mk(armL); a.visible = b.visible = false; return [a, b]; })(),
  bow: (() => {
    const g = pivot(armL, -0.04, -0.38, 0.14); g.visible = false;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.55, -0.14), new THREE.Vector3(0, 0, 0.22), new THREE.Vector3(0, -0.55, -0.14));
    const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.035, 6), MAT.leather); limb.castShadow = true; g.add(limb);
    box(g, 0.07, 0.14, 0.07, MAT.gold, 0, 0, 0.13);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 4), glowMat(0x7dffb5)); str.position.z = -0.14; g.add(str);
    const arrow = pivot(armR, 0, -0.36, 0.1); arrow.rotation.x = Math.PI / 2; arrow.visible = false;
    box(arrow, 0.022, 0.62, 0.022, MAT.leather, 0, 0.2, 0, false);
    glowBlade(arrow, 0.06, 0.1, 0.55, glowMat(0x7dffb5));
    box(arrow, 0.09, 0.08, 0.01, glowMat(0x7dffb5), 0, -0.07, 0);
    return [g, arrow]; })(),
  fan: (() => { const g = group(sword);
    box(g, 0.06, 0.16, 0.05, MAT.leather, 0, 0.02, 0);
    for (const a of [-0.8, -0.4, 0, 0.4, 0.8]) { const r = box(g, 0.025, 0.32, 0.02, MAT.leather, -Math.sin(a) * 0.12, 0.14 + Math.cos(a) * 0.12, 0, false); r.rotation.z = a; }
    const crystal = glowMat(0xb49bff);
    for (const a of [-0.55, 0, 0.55]) {
      const b = pivot(g, -Math.sin(a) * 0.22, 0.12 + Math.cos(a) * 0.3, 0); b.rotation.z = a;
      const geo = new THREE.ConeGeometry(0.07, 0.42, 4); const m = new THREE.Mesh(geo, crystal); m.position.y = 0.06; b.add(m);
      const halo = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.48, 4), MAT.halo); halo.position.y = 0.06; b.add(halo);
    }
    return [g]; })()
};

// ---------- 공격 동작 (Stage 12.6): 무기마다 다르게 ----------
// 검: 위에서 크게 베기 + 세로 호 궤적 / 쌍단검: 좌우 번갈아 빠른 찌르기 / 장궁: 겨누고 당겼다 놓기 / 부채: 옆으로 넓게 휘두르기 + 부채꼴 빛
const ATTACK_DUR = { sword: 0.34, dagger: 0.17, bow: 0.42, fan: 0.38 };
const attack = { kind: null, t: 0, dur: 1, side: 0 };
const trailMat = new THREE.MeshBasicMaterial({ color: 0x7de3ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const slashTrail = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.85, 28, 1, -Math.PI * 0.1, Math.PI * 0.9), trailMat);
slashTrail.position.set(0.12, 0.85, 0.38); slashTrail.rotation.y = Math.PI / 2; slashTrail.visible = false; knight.add(slashTrail);
const fanTrail = new THREE.Mesh(new THREE.RingGeometry(0.35, 1.15, 28, 1, Math.PI * 0.2, Math.PI * 0.6), trailMat);
fanTrail.position.set(0, 0.8, 0.1); fanTrail.rotation.x = -Math.PI / 2; fanTrail.visible = false; knight.add(fanTrail);
let curKind = "sword";
/** 공격 동작 재생 (발사할 때 main.js가 부른다) */
export function playAttack(kind = curKind) {
  attack.kind = kind;
  attack.dur = ATTACK_DUR[kind] ?? 0.3;
  attack.t = attack.dur;
  if (kind === "dagger") attack.side ^= 1;
}
/** 진행 중인 공격 자세를 팔·몸통에 덮어쓴다 */
function applyAttack(dt) {
  slashTrail.visible = fanTrail.visible = false;
  if (attack.t <= 0) { torso.rotation.y = 0; return; }
  attack.t = Math.max(0, attack.t - dt);
  const k = 1 - attack.t / attack.dur;                  // 0 → 1
  const ease = 1 - (1 - k) ** 3;
  switch (attack.kind) {
    case "sword":                                       // 들어 올렸다가(0~0.25) 위에서 아래로 크게
      if (k < 0.25) { armR.rotation.x = -2.6 * (k / 0.25); torso.rotation.y = 0.35 * (k / 0.25); }
      else { const s = (k - 0.25) / 0.75; armR.rotation.x = -2.6 + 3.1 * (1 - (1 - s) ** 3); torso.rotation.y = 0.35 - 0.7 * s; }
      armR.rotation.z = 0;
      if (k > 0.25) { slashTrail.visible = true; trailMat.opacity = 0.7 * (1 - k); slashTrail.rotation.z = -1.2 + (k - 0.25) * 2.4; }
      break;
    case "dagger": {                                    // 번갈아 앞으로 쭉 찌르기
      const arm = attack.side ? armL : armR, other = attack.side ? armR : armL;
      arm.rotation.x = -1.55 * Math.sin(Math.PI * k);
      other.rotation.x = 0.3;
      torso.rotation.y = (attack.side ? -0.25 : 0.25) * Math.sin(Math.PI * k);
      break;
    }
    case "bow":                                         // 왼팔로 겨누고, 오른팔을 당겼다가 마지막에 놓는다
      armL.rotation.x = -1.5; armL.rotation.z = 0.15;
      armR.rotation.x = -1.45; armR.rotation.z = k < 0.75 ? -0.5 * (k / 0.75) : -0.5 + 0.9 * ((k - 0.75) / 0.25);
      torso.rotation.y = -0.2;
      break;
    case "fan":                                         // 왼쪽에서 오른쪽으로 넓게 쓸고, 부채꼴 빛이 번진다
      armR.rotation.x = -1.35; armR.rotation.z = 1.3 - 2.6 * ease;
      torso.rotation.y = 0.5 - 1.0 * ease;
      fanTrail.visible = true; trailMat.opacity = 0.6 * (1 - k); fanTrail.scale.setScalar(0.7 + 0.5 * ease);
      break;
  }
  if (attack.t <= 0) { armR.rotation.z = armL.rotation.z = 0; torso.rotation.y = 0; }
}

/** 무기 외형 — kind: sword · dagger · bow · fan (core/shop.js WEAPONS[].blade) */
export function setWeapon(w) {
  MAT.blade.color.setHex(w.blade.color);
  MAT.halo.color.setHex(w.blade.color);
  const kind = w.blade.kind;
  curKind = kind;
  trailMat.color.setHex(w.blade.color);
  for (const [k, parts] of Object.entries(weaponSets)) for (const g of parts) g.visible = k === kind;
  shield.visible = kind === "sword" || kind === "fan";               // 활·쌍단검은 방패 대신
}
/** 옷 외형 (core/shop.js OUTFITS) — 의상 세트를 통째로 바꾼다 */
export function setOutfit(o) {
  const on = new Set(OUTFIT_SET[o.id] ?? ["classic"]);
  for (const [k, g] of Object.entries(COSTUME)) g.visible = on.has(k);
  const hooded = on.has("meshHood") || on.has("stealthHood") || on.has("hunterHood");
  helm.visible = plume.visible = !hooded;
  antenna.visible = antennaTip.visible = true;
  MAT.plume.color.setHex(o.plume);
  MAT.tabard.color.setHex(o.tabard);                                 // 방패 색도 옷을 따른다
  MAT.steel.color.setHex(o.id === "gold" ? 0xf2c14e : ["magnetron", "leaudio", "pawr", "retro", "aoa", "hunter"].includes(o.id) ? o.steel : 0xd3dce6);    // 황금 갑옷이면 투구도 금빛, 새 옷은 제 쇠 색
}
setOutfit({ id: "classic", plume: 0xd8443c, tabard: 0xd8443c });

// 착지 충격파 링
export const landingRing = new THREE.Mesh(
  new THREE.RingGeometry(0.2, 0.42, 28),
  new THREE.MeshBasicMaterial({ color: 0x7dd8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
);
landingRing.rotation.x = -Math.PI / 2;
landingRing.visible = false;

// 클릭/터치 이동 목표 마커
export const targetMarker = new THREE.Group();
{
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.48, 32),
    new THREE.MeshBasicMaterial({ color: 0x39d0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = -Math.PI / 2;
  targetMarker.add(ring);

  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.1, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
  );
  dot.rotation.x = -Math.PI / 2;
  targetMarker.add(dot);
}
targetMarker.visible = false;

let squashTime = 0;
let walkAnimTime = 0;
let landingRingTimer = 0;

export function addKnightTo(scene) {
  scene.add(knight, landingRing, targetMarker);
}

/** 착지 연출 시작 */
export function onLanded(x, y, z) {
  squashTime = LAND_SQUASH_TIME;
  landingRing.position.set(x, y + 0.04, z);
  landingRing.scale.set(1, 1, 1);
  landingRing.material.opacity = 0.85;
  landingRing.visible = true;
  landingRingTimer = LANDING_RING_TIME;
}

/** 모터 상태를 메시에 반영하고 애니메이션 진행 @param {import("../core/motor.js").MotorState} m */
let idleTime = 0;
export function syncKnight(m, isMoving, dt) {
  knight.position.set(m.x, m.y, m.z);
  knight.rotation.y = m.rotY;
  idleTime += dt;

  // 착지 스쿼시 / 체공 스트레치 / 보행 바운스 — 리그 전체에 적용
  let swing = 0;
  if (squashTime > 0) {
    squashTime -= dt;
    const p = Math.max(0, squashTime / LAND_SQUASH_TIME);
    rig.scale.set(1 + p * 0.22, 1 - p * 0.22, 1 + p * 0.22);
    rig.position.y = 0;
  } else if (!m.grounded) {
    const stretch = Math.min(0.18, Math.abs(m.vy) * 0.015);
    rig.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
    rig.position.y = 0;
    swing = 0.5;                                    // 체공: 팔다리를 벌린 자세
  } else if (isMoving) {
    walkAnimTime += dt * 12;
    rig.scale.set(1, 1, 1);
    rig.position.y = Math.abs(Math.sin(walkAnimTime)) * 0.05;
    swing = Math.sin(walkAnimTime);
  } else {
    const breathe = Math.sin(idleTime * 2.2) * 0.012;
    rig.scale.set(1 + breathe * 0.5, 1 + breathe, 1 + breathe * 0.5);
    rig.position.y = 0;
  }
  // 걷기: 팔다리를 번갈아 (체공 중엔 고정 자세)
  const k = !m.grounded ? 1 : 0.7;
  legL.rotation.x = swing * 0.7 * k;
  legR.rotation.x = !m.grounded ? -swing * 0.5 : -swing * 0.7;
  armL.rotation.x = -swing * 0.6 * k;
  armR.rotation.x = !m.grounded ? -0.9 : swing * 0.45;
  head.rotation.y = isMoving ? 0 : Math.sin(idleTime * 0.7) * 0.12;
  applyAttack(dt);   // 공격 중이면 팔·몸통 자세를 덮어쓴다
  // 망토 펄럭임: 걸으면 뒤로 날리고, 서 있으면 살랑
  const flap = isMoving ? 0.35 + Math.sin(idleTime * 9) * 0.08 : 0.04 + Math.sin(idleTime * 2) * 0.03;
  for (const c of capes) { c.top.rotation.x = -flap; c.low.rotation.x = -flap * 0.8; }
  antennaTip.scale.setScalar(1 + 0.25 * Math.max(0, Math.sin(idleTime * 5)));   // 광고 패킷처럼 깜빡
}

/** 이펙트(충격파·마커) 애니메이션 */
export function animateEffects(t, dt) {
  if (targetMarker.visible) {
    targetMarker.rotation.y = t * 2;
    const s = 1 + 0.15 * Math.sin(t * 6);
    targetMarker.scale.set(s, 1, s);
  }
  if (landingRingTimer > 0) {
    landingRingTimer -= dt;
    const progress = 1 - landingRingTimer / LANDING_RING_TIME;
    const s = 1 + progress * 2.4;
    landingRing.scale.set(s, s, 1);
    landingRing.material.opacity = Math.max(0, 0.85 * (1 - progress));
    if (landingRingTimer <= 0) landingRing.visible = false;
  }
}

export function showTargetMarker(pos) {
  targetMarker.position.set(pos.x, pos.y + 0.04, pos.z);
  targetMarker.visible = true;
}
export function hideTargetMarker() {
  targetMarker.visible = false;
}
