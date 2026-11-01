// 3인칭 오빗 카메라 — yaw/pitch/distance 상태와 추종 (THREE 의존)

import * as THREE from "three";

export const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 400);

export const DEFAULT_PITCH = 0.52;
export const orbit = { yaw: 0, pitch: DEFAULT_PITCH, distance: 15 };
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

export function updateCamera(target, dt) {
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
