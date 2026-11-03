// 기사 렌더링 — 복셀 기사 모델(Stage 11.6), 착지 충격파, 이동 목표 마커, 스쿼시/스트레치/보행 애니메이션 (THREE 의존)

import * as THREE from "three";

const LAND_SQUASH_TIME = 0.22;
const LANDING_RING_TIME = 0.28;

// knight(위치·회전) > rig(스쿼시/바운스, 발밑 피벗) > 몸통·머리·팔·다리 (Stage 11.6 복셀 인체형 — PRD §3.1)
// 앞쪽은 +z. 팔·다리는 어깨·엉덩이를 피벗으로 흔든다.
export const knight = new THREE.Group();
const rig = new THREE.Group();
knight.add(rig);

const MAT = {
  steel: new THREE.MeshLambertMaterial({ color: 0xc9d3de }),
  steelDark: new THREE.MeshLambertMaterial({ color: 0x8e9aa8 }),
  tabard: new THREE.MeshLambertMaterial({ color: 0xd8443c }),
  tabardDark: new THREE.MeshLambertMaterial({ color: 0xa8322b }),
  gold: new THREE.MeshLambertMaterial({ color: 0xf2c14e }),
  boot: new THREE.MeshLambertMaterial({ color: 0x4a3a32 }),
  glow: new THREE.MeshBasicMaterial({ color: 0x39d0ff }),
  glowTip: new THREE.MeshBasicMaterial({ color: 0x7de3ff }),
  blade: new THREE.MeshBasicMaterial({ color: 0x7de3ff, transparent: true, opacity: 0.92 })
};
/** 상자 하나 — (cx, cy, cz)는 부모 기준 중심 */
function box(parent, w, h, d, mat, cx, cy, cz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(cx, cy, cz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
/** 피벗 그룹 (팔·다리) */
function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const HIP_Y = 0.42, SHOULDER_Y = 0.86;
const legL = pivot(rig, -0.12, HIP_Y, 0), legR = pivot(rig, 0.12, HIP_Y, 0);
for (const leg of [legL, legR]) {
  box(leg, 0.2, 0.3, 0.22, MAT.steelDark, 0, -0.15, 0);       // 다리 갑옷
  box(leg, 0.22, 0.12, 0.28, MAT.boot, 0, -0.36, 0.02);        // 장화
}
// 몸통: 은색 갑옷 + 빨간 겉옷 + 금색 벨트 + 가슴 신호 문양
const torso = pivot(rig, 0, HIP_Y, 0);
box(torso, 0.5, 0.46, 0.3, MAT.steel, 0, 0.23, 0);
box(torso, 0.42, 0.5, 0.04, MAT.tabard, 0, 0.2, 0.16);           // 겉옷 앞
box(torso, 0.42, 0.5, 0.04, MAT.tabardDark, 0, 0.2, -0.16);      // 겉옷 뒤
box(torso, 0.52, 0.07, 0.32, MAT.gold, 0, 0.03, 0);              // 벨트
box(torso, 0.06, 0.06, 0.02, MAT.glow, 0, 0.27, 0.185);          // 문양: 점
box(torso, 0.18, 0.035, 0.02, MAT.glow, 0, 0.34, 0.185);         //        작은 호
box(torso, 0.28, 0.035, 0.02, MAT.glow, 0, 0.4, 0.185);          //        큰 호
box(torso, 0.62, 0.12, 0.34, MAT.steelDark, 0, 0.44, 0);         // 어깨 갑옷
// 투구: 은색 + 바이저 슬릿 + 볏 + BLE 안테나 깃
const head = pivot(torso, 0, 0.5, 0);
box(head, 0.4, 0.38, 0.4, MAT.steel, 0, 0.19, 0);
box(head, 0.3, 0.06, 0.02, MAT.glow, 0, 0.2, 0.205);             // 바이저 슬릿
box(head, 0.06, 0.14, 0.02, MAT.steelDark, 0, 0.1, 0.205);       // 코 보호대
MAT.plume = new THREE.MeshLambertMaterial({ color: 0xd8443c });
box(head, 0.08, 0.1, 0.36, MAT.plume, 0, 0.42, -0.02);          // 볏
const antenna = box(head, 0.035, 0.42, 0.035, MAT.steelDark, 0.14, 0.55, -0.08);
antenna.castShadow = false;
const antennaTip = box(head, 0.09, 0.09, 0.09, MAT.glowTip, 0.14, 0.78, -0.08);
// 팔: 오른손에 ADV 패킷 검, 왼팔에 작은 방패
const armL = pivot(rig, -0.33, SHOULDER_Y, 0), armR = pivot(rig, 0.33, SHOULDER_Y, 0);
for (const arm of [armL, armR]) {
  box(arm, 0.15, 0.36, 0.17, MAT.steel, 0, -0.18, 0);
  box(arm, 0.16, 0.09, 0.18, MAT.steelDark, 0, -0.38, 0);        // 장갑
}
const sword = pivot(armR, 0, -0.4, 0.06);
box(sword, 0.05, 0.12, 0.05, MAT.boot, 0, 0, 0);                  // 손잡이
box(sword, 0.2, 0.04, 0.06, MAT.gold, 0, 0.07, 0);                // 코등이
const blade = box(sword, 0.06, 0.5, 0.03, MAT.blade, 0, 0.34, 0);  // 빛나는 날
blade.castShadow = false;
sword.rotation.x = Math.PI / 2.4;                                  // 앞으로 기울여 든다
// 무기 모양 (Stage 12.2 상점가): 단검(짧은 날 둘)·장궁(활대 + 시위)·부채(펼친 날개)
const weaponAlt = {
  dagger: (() => { const g = new THREE.Group(); sword.add(g); box(g, 0.05, 0.3, 0.03, MAT.blade, 0, 0.24, 0); const g2 = new THREE.Group(); armL.add(g2); g2.position.set(0, -0.4, 0.06); g2.rotation.x = Math.PI / 2.4; box(g2, 0.05, 0.3, 0.03, MAT.blade, 0, 0.24, 0); box(g2, 0.14, 0.04, 0.05, MAT.gold, 0, 0.07, 0); return [g, g2]; })(),
  bow: (() => { const g = new THREE.Group(); armL.add(g); g.position.set(-0.06, -0.38, 0.12);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 20, Math.PI), MAT.boot); arc.rotation.z = Math.PI / 2; g.add(arc);
    const string = box(g, 0.012, 0.84, 0.012, MAT.blade, 0.0, 0, 0); string.castShadow = false; return [g]; })(),
  fan: (() => { const g = new THREE.Group(); sword.add(g); for (const a of [-0.45, -0.15, 0.15, 0.45]) { const r = box(g, 0.05, 0.42, 0.02, MAT.blade, 0, 0.26, 0); r.rotation.z = a; r.position.x = Math.sin(a) * 0.1; } return [g]; })()
};
for (const parts of Object.values(weaponAlt)) for (const g of parts) g.visible = false;
const shieldParts = [];
/** 무기 외형 — kind: sword · dagger · bow · fan (core/shop.js WEAPONS[].blade) */
export function setWeapon(w) {
  MAT.blade.color.setHex(w.blade.color);
  const kind = w.blade.kind;
  blade.visible = kind === "sword";
  for (const [k, parts] of Object.entries(weaponAlt)) for (const g of parts) g.visible = k === kind;
  for (const p of shieldParts) p.visible = kind !== "bow" && kind !== "dagger";   // 활·쌍단검은 방패 대신
}
/** 옷 외형 (core/shop.js OUTFITS) */
export function setOutfit(o) {
  MAT.tabard.color.setHex(o.tabard);
  MAT.tabardDark.color.setHex(o.tabardDark);
  MAT.plume.color.setHex(o.plume);
  MAT.steel.color.setHex(o.steel);
}
shieldParts.push(box(armL, 0.06, 0.34, 0.3, MAT.tabard, -0.1, -0.22, 0.02));   // 방패
shieldParts.push(box(armL, 0.065, 0.1, 0.1, MAT.glow, -0.135, -0.2, 0.02));   // 방패 문양

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
