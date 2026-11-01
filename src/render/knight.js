// 기사 렌더링 — 큐브 기사 메시, 착지 충격파, 이동 목표 마커, 스쿼시/스트레치/보행 애니메이션 (THREE 의존)

import * as THREE from "three";
import { metalMat } from "./world.js";

const LAND_SQUASH_TIME = 0.22;
const LANDING_RING_TIME = 0.28;

// knight(위치·회전) > rig(스쿼시/바운스, 발밑 피벗) > 몸통·바이저·안테나
export const knight = new THREE.Group();
const rig = new THREE.Group();
knight.add(rig);
{
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.85, 0.85),
    new THREE.MeshLambertMaterial({ color: 0xd8443c }) // 기사 붉은 갑옷
  );
  body.position.y = 0.425;
  rig.add(body);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.06), new THREE.MeshBasicMaterial({ color: 0x39d0ff }));
  visor.position.set(0, 0.52, 0.44);
  rig.add(visor);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6), metalMat);
  antenna.position.set(0.24, 1.05, 0);
  rig.add(antenna);
}

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
export function syncKnight(m, isMoving, dt) {
  knight.position.set(m.x, m.y, m.z);
  knight.rotation.y = m.rotY;

  // 착지 스쿼시 / 체공 스트레치 / 보행 바운스 — 리그 전체에 적용
  if (squashTime > 0) {
    squashTime -= dt;
    const p = Math.max(0, squashTime / LAND_SQUASH_TIME);
    rig.scale.set(1 + p * 0.22, 1 - p * 0.22, 1 + p * 0.22);
    rig.position.y = 0;
  } else if (!m.grounded) {
    const stretch = Math.min(0.18, Math.abs(m.vy) * 0.015);
    rig.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
    rig.position.y = 0;
  } else if (isMoving) {
    walkAnimTime += dt * 14;
    rig.scale.set(1, 1, 1);
    rig.position.y = Math.abs(Math.sin(walkAnimTime)) * 0.06;
  } else {
    rig.scale.set(1, 1, 1);
    rig.position.y = 0;
  }
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
