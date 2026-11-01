// Packet Knight — 엔트리: 씬 구성, 게임 상태, 메인 루프
// PRD.md §7 DoD는 scripts/smoke.mjs 로 자동 검증한다.
//   Stage 3: "큐브가 지형 단차를 오르내리고 건물에 부딪힌다"
//   Stage 4: "퀴즈 3문제 정답 시 스탯이 오르고 localStorage에 저장된다 (새로고침 후에도 유지)"
//   Stage 5: "60초 플레이로 CR2032가 지급되고 잔액이 저장된다"
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
import { initInput, readMoveInput, setInputEnabled } from "./ui/input.js";
import * as hud from "./ui/hud.js";
import { initLibrary, openLibrary, isLibraryOpen, currentAnswerKey } from "./ui/library.js";
import {
  SAVE_KEY, loadProgress, saveProgress, effectiveStats, applyQuizResult, recordChapterOpen
} from "./core/progress.js";
import { CHAPTERS } from "./core/chapters.data.js";
import { applyJobResult } from "./core/progress.js";
import { createRng } from "./core/quiz.js";
import { createJob, stepJob, confirmMeasurement } from "./core/rssiJob.js";
import * as jobPanel from "./ui/jobPanel.js";

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

// ---------- 진행도 (localStorage) ----------
// 사생활 보호 모드 등에서 localStorage 접근 자체가 예외를 던질 수 있다
let storage = null;
try { storage = window.localStorage; } catch { /* 저장 없이 플레이 */ }

const loaded = loadProgress(storage);
const progress = loaded.progress;
if (loaded.status === "corrupt") {
  // 깨진 세이브는 덮어쓰기 전에 보관해 둔다 (수동 복구용)
  try { storage.setItem(`${SAVE_KEY}.corrupt`, storage.getItem(SAVE_KEY) ?? ""); } catch { /* 무시 */ }
  console.warn("[PacketKnight] 저장 데이터가 손상되어 새 진행도로 시작합니다.");
}
let lastSaveOk = loaded.status !== "unavailable";

function persist() {
  lastSaveOk = saveProgress(storage, progress);
  if (!lastSaveOk) hud.setBadge("⚠️ 진행도를 저장할 수 없습니다 (브라우저 저장소 차단)");
}
const wallet = () => ({ skillSlots: progress.skillSlots, cr2032: progress.cr2032 });
hud.renderStats(effectiveStats(progress), wallet());

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

// ---------- 도서관 강의실 (교육 루프) ----------
const TEST_MODE = new URLSearchParams(location.search).has("test");

initLibrary({
  seed: TEST_MODE ? 42 : undefined,
  getProgress: () => progress,
  getStats: () => effectiveStats(progress),
  onQuizFinished: (chapterId, perfect) => {
    const outcome = applyQuizResult(progress, chapterId, perfect);
    persist();
    if (outcome.reward) {
      const changed = [outcome.reward.stat, ...(outcome.reward.slotUnlocked ? ["slots"] : [])];
      hud.renderStats(effectiveStats(progress), wallet(), changed);
    }
    return outcome;
  },
  onChapterOpen: (chapterId) => { recordChapterOpen(progress, chapterId); persist(); },
  onOpenChange: (open) => {
    setInputEnabled(!open);
    if (open) { clearMoveTarget(); hud.hideModal(); }
  }
});

// ---------- 알바: 비콘 신호 측정소 ----------
const jobRng = createRng(TEST_MODE ? 7 : Date.now());
/** @type {import("./core/rssiJob.js").Job | null} */
let job = null;

function onJobDone() {
  const paid = applyJobResult(progress, job.result);
  persist();
  hud.renderStats(effectiveStats(progress), wallet(), ["cr2032"]);
  jobPanel.showResult(job.result, paid, job.history);
}

jobPanel.initJobPanel({
  getProgress: () => progress,
  onStart: () => {
    job = createJob(jobRng);
    jobPanel.showRunning();
    jobPanel.updateJob(job);
  },
  onConfirm: () => { if (job) { confirmMeasurement(job); jobPanel.updateJob(job); } },
  onClose: () => {
    job = null; // 측정 도중 닫으면 보수 없이 중단
    setInputEnabled(true);
  }
});

function openJob() {
  setInputEnabled(false);
  clearMoveTarget();
  hud.hideModal();
  jobPanel.openJob();
}

hud.setModalHandlers({
  action: (id) => {
    if (id === "library") openLibrary();
    else if (id === "job") openJob();
  },
  // 모달의 "교과서 챕터 보기" 클릭도 학습 지표로 센다 (PRD §1.3 ②)
  link: (href) => {
    const chapter = CHAPTERS.find((c) => href.endsWith(`/${c.file}`));
    if (chapter) { recordChapterOpen(progress, chapter.id); persist(); }
  }
});

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
  if (job && job.phase !== "done") {
    stepJob(job, dt, jobRng);
    if (job.phase === "done") onJobDone();
    else jobPanel.updateJob(job);
  }

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
  progress: () => structuredClone(progress),
  stats: () => effectiveStats(progress),
  saveStatus: () => ({ load: loaded.status, lastSaveOk }),
  library: { open: openLibrary, isOpen: isLibraryOpen, answerKey: currentAnswerKey },
  job: {
    open: openJob,
    isOpen: jobPanel.isJobOpen,
    /** 테스트용 관찰: 현재 세션 요약 (실제 거리 포함) */
    state: () => job && {
      phase: job.phase, timeLeft: job.timeLeft, score: job.score, rounds: job.history.length,
      samples: job.beacon.samples.length, distance: job.beacon.distance, result: job.result
    }
  },
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
