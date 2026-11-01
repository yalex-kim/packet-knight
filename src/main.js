// Packet Knight — 엔트리: 씬 구성, 게임 상태, 메인 루프
// PRD.md §7 Stage 3 DoD (scripts/smoke.mjs 로 자동 검증): "큐브가 지형 단차를 오르내리고 건물에 부딪힌다"
//
// 계층:  core/ (순수 로직, Node에서 import 가능) → render/ (THREE) · ui/ (DOM) → main.js (조립)

import * as THREE from "three";
import { WORLD, PHYSICS } from "./core/config.js";
import { groundHeightAt, isDungeonCell } from "./core/terrain.js";
import { SPAWN_POS } from "./core/layout.js";
import { isBlocked, supportHeightAt } from "./core/collision.js";
import { createMotor, resetMotor, jump, stepMotor, seekIntent } from "./core/motor.js";
import * as world from "./render/world.js";
import * as knightView from "./render/knight.js";
import { camera, orbit, rotateOrbit, setOrbitDistance, resetOrbit, cameraRelative, updateCamera, resizeCamera } from "./render/camera.js";
import { initInput, readMoveInput } from "./ui/input.js";
import * as hud from "./ui/hud.js";

// ---------- 씬 & 렌더러 ----------
const app = document.getElementById("app");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec9e8);
scene.fog = new THREE.Fog(0x8ec9e8, 90, 220);

const sun = new THREE.DirectionalLight(0xfff5dd, 1.65); // 따뜻한 햇살 + 환경광
sun.position.set(50, 75, 40);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xc6e0ff, 0.65));
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3f6b3a, 0.55));

scene.add(world.root);
knightView.addKnightTo(scene);

// ---------- 게임 상태 ----------
const motor = createMotor(SPAWN_POS);
/** @type {{ x: number, y: number, z: number } | null} */
let moveTarget = null;
let pendingArrivalLabel = null;
resetOrbit(SPAWN_POS.y);

function regionLabel() {
  const { x, y, z } = motor;
  if (isDungeonCell(x, z)) return y < 0.6 ? "⚔️ 호핑 던전 입구 · 지하" : "⚔️ 호핑 던전 계단";
  if (Math.hypot(x, z) > WORLD.VILLAGE_RADIUS) return "🏖️ 스펙트럼 해안";
  return "🛡️ GATT 빌리지 광장";
}

function setMoveTarget(pos, arrivalLabel) {
  moveTarget = pos;
  pendingArrivalLabel = arrivalLabel;
  knightView.showTargetMarker(pos);
}
function clearMoveTarget() {
  moveTarget = null;
  pendingArrivalLabel = null;
  knightView.hideTargetMarker();
}
function arriveAtTarget() {
  hud.setBadge(pendingArrivalLabel ?? regionLabel());
  clearMoveTarget();
}

function performJump() {
  if (jump(motor)) hud.setBadge("🦘 점프!");
}

// ---------- 클릭 / 탭 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function findInteractive(obj) {
  for (let o = obj; o; o = o.parent) if (o.userData.interactive) return o.userData.interactive;
  return null;
}

function handleTap(clientX, clientY) {
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);

  // 건물·지형을 한 번에 검사해 화면에서 가장 앞에 있는 대상을 고른다
  const hits = raycaster.intersectObjects([...world.interactiveObjects, world.terrain, world.sea], true);
  if (hits.length === 0) return;

  const info = findInteractive(hits[0].object);
  if (info) {
    hud.showModal(info);
    setMoveTarget(info.walkPos, `${info.title} 앞 도착`);
    hud.setBadge(`🚶 ${info.title}(으)로 이동 중`);
    return;
  }

  const p = hits[0].point;
  const y = groundHeightAt(p.x, p.z);
  if (!Number.isFinite(y) || isBlocked(p.x, p.z, y)) return; // 장애물 내부·이동 불가 지점

  setMoveTarget({ x: p.x, y, z: p.z }, null);
  hud.setBadge(`📍 이동 중 (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  hud.hideModal();
}

initInput({
  surface: app,
  onJump: performJump,
  onMoveKey: clearMoveTarget,
  onTap: handleTap,
  onOrbit: rotateOrbit,
  onZoom: (apply) => setOrbitDistance(apply(orbit.distance)),
  getZoom: () => orbit.distance
});

const btnReset = document.getElementById("btn-reset");
btnReset.addEventListener("click", () => {
  resetMotor(motor, SPAWN_POS);
  resetOrbit(SPAWN_POS.y);
  clearMoveTarget();
  hud.hideModal();
  hud.setBadge("🛡️ GATT 빌리지 광장 · 평지");
  btnReset.blur(); // 포커스가 남아 스페이스바가 버튼을 다시 누르지 않도록
});

// ---------- 시뮬레이션 한 스텝 ----------
function simulate(dt) {
  const input = readMoveInput();
  if (input.joystick) clearMoveTarget();
  const inputLen = Math.hypot(input.right, input.forward);

  let intent = { dirX: 0, dirZ: 0, speedScale: 0 };
  if (inputLen > 0.05) {
    const norm = inputLen > 1 ? 1 / inputLen : 1;
    const dir = cameraRelative(input.right * norm, input.forward * norm);
    intent = { dirX: dir.x, dirZ: dir.z, speedScale: Math.min(1, inputLen) };
  } else if (moveTarget) {
    const seek = seekIntent(motor, moveTarget, dt);
    if (seek.arrived) arriveAtTarget();
    else intent = seek;
  }

  const { moved, landed } = stepMotor(motor, intent, dt);
  // 클릭 이동 중 양 축이 모두 막히면 목표 도달 불가로 취소
  if (moveTarget && inputLen <= 0.05 && intent.speedScale > 0 && moved < 0.0001) clearMoveTarget();
  if (landed) {
    knightView.onLanded(motor.x, motor.y, motor.z);
    hud.setBadge(regionLabel());
  }

  knightView.syncKnight(motor, moved > 0.0005, dt);
  updateCamera(motor, dt);
}

// ---------- 메인 루프 ----------
// ?test 모드: 실시간 루프는 시뮬레이션·렌더를 멈추고, 테스트가 __PK.tick()으로 고정 스텝을 진행 (FPS와 무관한 결정적 테스트)
const TEST_MODE = new URLSearchParams(location.search).has("test");
const FIXED_DT = 1 / 60;
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (TEST_MODE) return;

  simulate(dt);
  const t = clock.elapsedTime;
  world.animateWorld(t);
  knightView.animateEffects(t, dt);
  renderer.render(scene, camera);
}
knightView.syncKnight(motor, false, 0);
updateCamera(motor, 1);
animate();

window.addEventListener("resize", () => {
  resizeCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- 자동 스모크 테스트(scripts/smoke.mjs)용 관찰 훅 ----------
window.__PK = {
  motor, SPAWN_POS, STEP_MAX: PHYSICS.STEP_MAX,
  groundHeightAt, isBlocked, supportHeightAt,
  state: () => ({
    x: motor.x, y: motor.y, z: motor.z, rotY: motor.rotY, grounded: motor.grounded, vy: motor.vy,
    badge: hud.getBadge(), modal: hud.openModalTitle()
  }),
  teleport: (x, z, y) => Object.assign(motor, { x, z, y: y ?? groundHeightAt(x, z), vy: 0, grounded: true }),
  /** 시뮬레이션을 seconds 만큼 고정 스텝으로 진행 (테스트 모드용) */
  tick: (seconds) => {
    for (let n = Math.round(seconds / FIXED_DT); n > 0; n--) simulate(FIXED_DT);
    scene.updateMatrixWorld(); // 렌더를 생략하므로 레이캐스트용 행렬을 직접 갱신
  },
  projectToScreen: (x, y, z) => {
    scene.updateMatrixWorld();
    const v = new THREE.Vector3(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }
};
