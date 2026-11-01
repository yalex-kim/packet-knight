// 전투 렌더링 — 훈련용 비콘 봇, ADV 패킷 투사체, 드롭(CR2032), HP 바, 처치 연출 (THREE 의존)
// 상태는 core/battle.js가 들고, 여기서는 매 프레임 메시를 맞춘다.

import * as THREE from "three";
import { MONSTERS, TRAINING_GROUND } from "../core/balance.js";
import { groundHeightAt } from "../core/terrain.js";

export const battleRoot = new THREE.Group();
/** 클릭(탭) 대상 — 몬스터 루트 그룹들 (userData.monsterId) */
export const monsterTargets = [];

const bodyGeo = new THREE.BoxGeometry(0.7, 0.62, 0.7);
const visorGeo = new THREE.BoxGeometry(0.46, 0.14, 0.05);
const antennaGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6);
const ledGeo = new THREE.SphereGeometry(0.09, 10, 10);
const projGeo = new THREE.BoxGeometry(0.16, 0.16, 0.55);
const coinGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.07, 18);
const barGeo = new THREE.PlaneGeometry(0.9, 0.1);

const projMat = new THREE.MeshBasicMaterial({ color: 0x7dfcff });
const coinMat = new THREE.MeshLambertMaterial({ color: 0xd9dde2, emissive: 0x2a2a20 });
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x1a0d0d, transparent: true, opacity: 0.75, depthTest: false });
const barFgMat = new THREE.MeshBasicMaterial({ color: 0xff5a4e, depthTest: false });

// ---------- 훈련장 바닥 표시 (충돌 없는 원형 경계 타일 + 표지판은 layout 랜드마크) ----------
{
  const tileMat = new THREE.MeshLambertMaterial({ color: 0xc9b37a });
  const tileGeo = new THREE.BoxGeometry(0.55, 0.06, 0.55);
  const R = 5.6;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const x = TRAINING_GROUND.x + Math.cos(a) * R, z = TRAINING_GROUND.z + Math.sin(a) * R;
    const t = new THREE.Mesh(tileGeo, tileMat);
    t.position.set(x, groundHeightAt(x, z) + 0.03, z);
    t.rotation.y = -a;
    battleRoot.add(t);
  }
}

/** @type {Map<number, THREE.Group>} */
const monsterMeshes = new Map();
/** @type {Map<number, THREE.Mesh>} */
const projMeshes = new Map();
/** @type {Map<number, THREE.Mesh>} */
const dropMeshes = new Map();
const bursts = [];
const tmpQ = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Wi-Fi 간섭 몬스터: 안테나 3개 달린 공유기 + 광역 공격 예고 원(반경 = attackRange) */
function makeRouter(g) {
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a2f38, emissive: 0x000000 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.42, 0.75), bodyMat);
  body.position.y = 0.45;
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff9a3c });
  const rig = new THREE.Group();
  rig.add(body);
  for (const x of [-0.42, 0, 0.42]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 6), new THREE.MeshLambertMaterial({ color: 0x1a1d22 }));
    ant.position.set(x, 1.02, -0.25);
    ant.rotation.z = x * 0.35;
    rig.add(ant);
  }
  for (const x of [-0.3, -0.1, 0.1, 0.3]) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), ledMat);
    led.position.set(x, 0.5, 0.38);
    rig.add(led);
  }
  g.add(rig);
  const aoe = new THREE.Mesh(
    new THREE.RingGeometry(MONSTERS.wifiInterferer.attackRange - 0.15, MONSTERS.wifiInterferer.attackRange, 48),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false })
  );
  aoe.rotation.x = -Math.PI / 2;
  aoe.position.y = 0.04;
  aoe.visible = false;
  g.add(aoe);
  const aoeFill = new THREE.Mesh(
    new THREE.CircleGeometry(MONSTERS.wifiInterferer.attackRange, 48),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false })
  );
  aoeFill.rotation.x = -Math.PI / 2;
  aoeFill.position.y = 0.03;
  aoeFill.visible = false;
  g.add(aoeFill);
  return { rig, bodyMat, ledMat, aoe, aoeFill };
}

function makeMonster(m) {
  const g = new THREE.Group();
  if (m.type === "wifiInterferer") {
    const parts = makeRouter(g);
    const bar = makeBar(g, 1.7);
    g.userData = { monsterId: m.id, ...parts, ...bar };
    battleRoot.add(g);
    monsterTargets.push(g);
    monsterMeshes.set(m.id, g);
    return g;
  }
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5b6f8a, emissive: 0x000000 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.31;
  const visor = new THREE.Mesh(visorGeo, new THREE.MeshBasicMaterial({ color: 0x9ff0ff }));
  visor.position.set(0, 0.4, 0.36);
  const antenna = new THREE.Mesh(antennaGeo, new THREE.MeshLambertMaterial({ color: 0xb5c1cd }));
  antenna.position.y = 0.83;
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x39d0ff });
  const led = new THREE.Mesh(ledGeo, ledMat);
  led.position.y = 1.07;

  const rig = new THREE.Group();
  rig.add(body, visor, antenna, led);
  g.add(rig);

  const { bar, fg } = makeBar(g, 1.4);
  g.userData = { monsterId: m.id, rig, bodyMat, ledMat, bar, fg };
  battleRoot.add(g);
  monsterTargets.push(g);
  monsterMeshes.set(m.id, g);
  return g;
}

function makeBar(g, height) {
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(barGeo, barBgMat);
  const fg = new THREE.Mesh(barGeo, barFgMat);
  fg.position.z = 0.001;
  bar.add(bg, fg);
  bar.position.y = height;
  bar.renderOrder = 10;
  g.add(bar);
  return { bar, fg };
}

/** 처치 연출: 퍼지는 고리 */
export function burstAt(x, y, z, color = 0x7dd8ff) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.45, 24),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.05, z);
  battleRoot.add(ring);
  bursts.push({ mesh: ring, t: 0 });
}

/**
 * 전투 상태 → 메시 동기화
 * @param {ReturnType<typeof import("../core/battle.js").createBattle>} battle
 */
export function syncBattle(battle, camera, t, dt) {
  // 몬스터 — 활성 전투(마을 훈련장 또는 던전 층)에 없는 몬스터는 숨긴다
  const live = new Set();
  for (const m of battle.monsters) {
    live.add(m.id);
    const g = monsterMeshes.get(m.id) ?? makeMonster(m);
    const { rig, bodyMat, ledMat, bar, fg, aoe, aoeFill } = g.userData;
    g.visible = m.state !== "dead";
    if (!g.visible) continue;
    if (aoe) {
      // 광역 공격 예고: 바닥에 공격 범위가 차오른다 → 원 밖으로 피하라
      const on = m.state === "windup";
      aoe.visible = aoeFill.visible = on;
      if (on) {
        const k = 1 - m.t / MONSTERS[m.type].windup;
        aoe.material.opacity = 0.5 + 0.5 * k;
        aoeFill.material.opacity = 0.08 + 0.25 * k;
        aoeFill.scale.setScalar(Math.max(0.05, k));
      }
    }
    g.position.set(m.x, m.y, m.z);
    g.rotation.y = m.rotY;

    // LED: 평소엔 광고(비콘)·트래픽(Wi-Fi)처럼 깜빡, 공격 예고(windup) 중엔 빨갛게 → 피할 타이밍
    if (m.state === "windup") {
      ledMat.color.setHex(0xff3b30);
      const k = 1 - m.t / MONSTERS[m.type].windup;
      rig.scale.set(1 + 0.12 * k, 1 - 0.1 * k, 1 + 0.12 * k);
      rig.position.x = Math.sin(t * 60) * 0.03;
    } else {
      if (m.type === "wifiInterferer") ledMat.color.setHex(Math.sin(t * 14 + m.id) > 0 ? 0xff9a3c : 0x5a2a10);
      else ledMat.color.setHex(Math.sin(t * 9 + m.id) > 0.2 ? 0x39d0ff : 0x0c3a4a);
      rig.scale.set(1, 1, 1);
      rig.position.x = 0;
    }
    bodyMat.emissive.setHex(m.hitFlash > 0 ? 0xffffff : 0x000000);

    const ratio = m.hp / (m.maxHp ?? MONSTERS[m.type].hp);
    fg.scale.x = Math.max(0.001, ratio);
    fg.position.x = -0.45 * (1 - ratio);
    bar.visible = ratio < 1;
    // 빌보드: 부모(몸통) 회전을 상쇄하고 카메라를 바라보게
    bar.quaternion.copy(camera.quaternion).premultiply(tmpQ.setFromAxisAngle(Y_AXIS, -g.rotation.y));
  }
  for (const [id, g] of monsterMeshes) if (!live.has(id)) g.visible = false;

  // 투사체
  const liveProj = new Set();
  for (const p of battle.projectiles) {
    liveProj.add(p.id);
    let mesh = projMeshes.get(p.id);
    if (!mesh) {
      mesh = new THREE.Mesh(projGeo, projMat);
      battleRoot.add(mesh);
      projMeshes.set(p.id, mesh);
    }
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = Math.atan2(p.dx, p.dz);
  }
  for (const [id, mesh] of projMeshes) if (!liveProj.has(id)) { battleRoot.remove(mesh); projMeshes.delete(id); }

  // 드롭
  const liveDrops = new Set();
  for (const d of battle.drops) {
    liveDrops.add(d.id);
    let mesh = dropMeshes.get(d.id);
    if (!mesh) {
      mesh = new THREE.Mesh(coinGeo, coinMat);
      mesh.rotation.z = Math.PI / 2;
      battleRoot.add(mesh);
      dropMeshes.set(d.id, mesh);
    }
    mesh.position.set(d.x, d.y + 0.15 + Math.sin(t * 4 + d.id) * 0.08, d.z);
    mesh.rotation.y = t * 3;
  }
  for (const [id, mesh] of dropMeshes) if (!liveDrops.has(id)) { battleRoot.remove(mesh); dropMeshes.delete(id); }

  // 처치 고리
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.t += dt;
    const k = b.t / 0.4;
    b.mesh.scale.setScalar(1 + k * 3);
    b.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
    if (k >= 1) { battleRoot.remove(b.mesh); b.mesh.material.dispose(); b.mesh.geometry.dispose(); bursts.splice(i, 1); }
  }
}
