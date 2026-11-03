// 3인칭 오빗 카메라 — yaw/pitch/distance 상태와 추종 (THREE 의존)

import * as THREE from "three";

export const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 400);

export const DEFAULT_PITCH = 0.52;
// 기본 줌 (Stage 11.3: 15 → 20, 사용자 요청 "좀 더 줌 아웃"). 세로 화면은 가로 시야가 좁아 더 멀리서 본다.
export const DEFAULT_DISTANCE = window.innerWidth / window.innerHeight < 0.75 ? 25 : 20;
export const orbit = { yaw: 0, pitch: DEFAULT_PITCH, distance: DEFAULT_DISTANCE };
const DIST_MIN = 6, DIST_MAX = 36;
const PITCH_MIN = 0.15, PITCH_MAX = 1.2;

// 점프·계단에서 화면이 덜컹이지 않도록 추종 높이만 부드럽게 따라간다
let focusY = 0;

export function rotateOrbit(dYaw, dPitch) {
  orbit.yaw += dYaw;
  orbit.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, orbit.pitch + dPitch));
}
export function setOrbitDistance(d) {
  orbit.distance = Math.max(DIST_MIN, Math.min(DIST_MAX, d));
}
export function resetOrbit(targetY) {
  orbit.yaw = 0;
  orbit.pitch = DEFAULT_PITCH;
  focusY = targetY;
}

/** 카메라 기준 입력(right, forward)을 월드 방향으로 변환 */
export function cameraRelative(right, forward) {
  const fwdX = -Math.sin(orbit.yaw), fwdZ = -Math.cos(orbit.yaw);
  const rightX = Math.cos(orbit.yaw), rightZ = -Math.sin(orbit.yaw);
  return { x: rightX * right + fwdX * forward, z: rightZ * right + fwdZ * forward };
}

// ---------- 타이틀 화면 배경 · 착지 연출 (Stage 11.5) ----------
// attract: 타이틀 뒤에서 마을 위 높은 곳을 천천히 돈다. landing: 시작하면 그 자리에서 기사 뒤 기본 시점으로 내려앉는다.
const ATTRACT = { distance: 50, pitch: 0.62, spin: 0.08 };   // 섬 옆면(지층)이 보이는 낮은 각도
let attract = false;
let landing = null;
const easeOutCubic = (k) => 1 - (1 - k) ** 3;

export function setAttract(on) {
  attract = on;
  if (on) Object.assign(orbit, { distance: ATTRACT.distance, pitch: ATTRACT.pitch });
}
/** 지금 시점에서 기본 시점(거리 DEFAULT_DISTANCE, 기본 각도, 정면 yaw 0)으로 duration초 동안 내려앉는다 */
export function startLanding(duration = 1.8) {
  attract = false;
  const yaw = ((orbit.yaw % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;   // −π~π: 가까운 쪽으로 돈다
  landing = { t: 0, d: duration, from: { distance: orbit.distance, pitch: orbit.pitch, yaw }, to: { distance: DEFAULT_DISTANCE, pitch: DEFAULT_PITCH, yaw: 0 } };
}
export const isLanding = () => landing !== null;

export function updateCamera(target, dt) {
  if (attract) orbit.yaw += ATTRACT.spin * dt;
  if (landing) {
    landing.t += dt;
    const k = easeOutCubic(Math.min(1, landing.t / landing.d));
    for (const key of ["distance", "pitch", "yaw"]) orbit[key] = landing.from[key] + (landing.to[key] - landing.from[key]) * k;
    if (k >= 1) landing = null;
  }
  focusY += (target.y - focusY) * Math.min(1, dt * 6);
  const hDist = orbit.distance * Math.cos(orbit.pitch);
  const vDist = orbit.distance * Math.sin(orbit.pitch);
  camera.position.set(
    target.x + Math.sin(orbit.yaw) * hDist,
    focusY + vDist,
    target.z + Math.cos(orbit.yaw) * hDist
  );
  camera.lookAt(target.x, focusY + 1.0, target.z);
}

export function resizeCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
