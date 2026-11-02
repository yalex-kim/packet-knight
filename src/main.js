// Packet Knight — 엔트리: 씬 구성, 게임 상태, 메인 루프
// PRD.md §7 DoD는 scripts/smoke.mjs 로 자동 검증한다.
//   Stage 3: "큐브가 지형 단차를 오르내리고 건물에 부딪힌다"
//   Stage 4: "퀴즈 3문제 정답 시 스탯이 오르고 localStorage에 저장된다 (새로고침 후에도 유지)"
//   Stage 5: "60초 플레이로 CR2032가 지급되고 잔액이 저장된다"
//   Stage 6: "몬스터를 처치해 아이템을 얻고, HP가 줄었다가 회복된다"
//   Stage 7: "던전이 매번 다른 채널 배치로 생성되고 클리어 시 다음 층이 열린다"
//   Stage 8: "HP 0 시 체크포인트 롤백이 기록대로 동작한다" + 간섭 채널 밖이면 피해 0 (실시간 채널맵)
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
import { initLibrary, openLibrary, isLibraryOpen, currentAnswerKey, openReader, isReaderOpen, readerUrl } from "./ui/library.js";
import * as questLog from "./ui/questLog.js";
import { questEvent, answerWhatif, questById, readyForWhatif, PERKS } from "./core/quests.js";
import {
  SAVE_KEY, loadProgress, saveProgress, effectiveStats, applyQuizResult, recordChapterOpen
} from "./core/progress.js";
import { CHAPTERS } from "./core/chapters.data.js";
import { applyJobResult, jobChargesAt, startJobCharge } from "./core/progress.js";
import { createRng } from "./core/quiz.js";
import { createJob, stepJob, confirmMeasurement } from "./core/rssiJob.js";
import * as jobPanel from "./ui/jobPanel.js";
import { TRAINING_GROUND, MONSTERS, GEAR, STAT_POINTS_PER_LEVEL } from "./core/balance.js";
import { createBattle, syncPlayerHp, stepBattle, fireAdvPacket, revivePlayer } from "./core/battle.js";
import { recordScan, applyKill, applyPickup } from "./core/progress.js";
import { levelFromXp } from "./core/combat.js";
import * as battleView from "./render/battleView.js";
import * as fx from "./ui/fx.js";
import { VILLAGE } from "./core/collision.js";
import { DUNGEON_ROOM, DUNGEON_WORLD, generateFloor, createLinkPuzzle, toggleChannel, resetMap, observe, runLinkTest, createFloorBattle, stepAcs } from "./core/dungeon.js";
import { createLink, stepLink, toggleLinkChannel, applyAfh, requestMap, interferenceFor } from "./core/link.js";
import { allChannelsMap } from "./core/hopping.js";
import { hasAfhSkill } from "./core/progress.js";
import * as chmap from "./ui/chmap.js";
import { nextFloor, payDungeonEntry, applyFloorClear, applyTimeoutPenalty } from "./core/progress.js";
import * as dungeonView from "./render/dungeonView.js";
import * as dungeonUi from "./ui/dungeonPanel.js";
import * as rfLab from "./ui/rfLab.js";
import { upgradeGear, allocatePoint } from "./core/progress.js";

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
scene.add(battleView.battleRoot);
scene.add(dungeonView.dungeonRoot);
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

let questsReady = false; // 퀘스트 UI 초기화 전에는 트래커를 건드리지 않는다
let questWalk = 0; // 1 m 미만 걸은 거리 누적
let questReadyShown = null; // 🔮 열림 안내를 한 번만 띄우려고 기억해 둔 퀘스트
function persist() {
  lastSaveOk = saveProgress(storage, progress);
  if (!lastSaveOk) hud.setBadge("⚠️ 진행도를 저장할 수 없습니다 (브라우저 저장소 차단)");
  refreshQuests();
}
/** 퀘스트 트래커 갱신 + 예측해 보기가 새로 열리면 안내 (상태 단계는 강좌·강화·던전에서 바뀐다) */
function refreshQuests() {
  if (!questsReady) return;
  questLog.refreshTracker();
  const q = questById(progress.quests.active);
  if (q && questReadyShown !== q.id && readyForWhatif(progress.quests, progress, q)) {
    questReadyShown = q.id;
    fx.showToast(`🔮 ${q.code} 마지막 관문 — 예측해 보기가 열렸다! 왼쪽 퀘스트 트래커나 Q 키로 답해 보자`, 4.5);
  }
}
/** 게임 사건 → 퀘스트 진행 (바뀌었을 때만 저장) */
function questProgress(ev) {
  if (questEvent(progress.quests, ev)) persist();
}
const wallet = () => ({ skillSlots: progress.skillSlots, cr2032: progress.cr2032, xp: progress.xp, statPoints: progress.statPoints });
hud.renderStats(effectiveStats(progress), wallet());

// ---------- 게임 상태 ----------
const motor = createMotor(SPAWN_POS);

// ---------- 전투 (훈련장) ----------
const battle = createBattle(TRAINING_GROUND.spawns);
syncPlayerHp(battle, effectiveStats(progress).hp);

// ---------- 호핑 던전 (Stage 7) ----------
/** 진행 중인 층 — 없으면 마을에 있다
 * @type {null | { floor: number, layout: ReturnType<typeof generateFloor>, battle: ReturnType<typeof createBattle>,
 *   puzzle: ReturnType<typeof createLinkPuzzle>, phase: "combat"|"link"|"open", observing: boolean }} */
let run = null;
const activeBattle = () => run?.battle ?? battle;
const currentWorld = () => (run ? DUNGEON_WORLD : VILLAGE);
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
  if (jump(motor)) { hud.setBadge("🦘 점프!"); questProgress({ type: "jump" }); }
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
  const targets = run
    ? [...battleView.monsterTargets, ...dungeonView.dungeonTargets]
    : [...battleView.monsterTargets, ...world.interactiveObjects, world.terrain, world.sea];
  const hits = raycaster.intersectObjects(targets, true).filter((h) => h.object.visible);
  if (hits.length === 0) {
    if (run) tapDungeonFloor();
    return;
  }

  // 몬스터를 탭하면 그 몬스터를 조준해 발사
  for (let o = hits[0].object; o; o = o.parent) {
    if (o.userData.monsterId) {
      performFire(activeBattle().monsters.find((m) => m.id === o.userData.monsterId));
      return;
    }
    if (o.userData.dungeonTarget) {
      const pos = o.userData.dungeonTarget === "console" ? dungeonView.CONSOLE_POS : dungeonView.PORTAL_POS;
      setMoveTarget({ x: pos.x, y: DUNGEON_ROOM.floorY, z: pos.z + (o.userData.dungeonTarget === "console" ? 1.2 : -1.2) }, null);
      return;
    }
  }
  if (run) { tapDungeonFloor(); return; }

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

/** 던전 바닥 탭: 바닥 평면(floorY)과 광선의 교점으로 이동 */
function tapDungeonFloor() {
  const { origin, direction } = raycaster.ray;
  if (Math.abs(direction.y) < 1e-4) return;
  const k = (DUNGEON_ROOM.floorY - origin.y) / direction.y;
  if (k <= 0) return;
  const x = origin.x + direction.x * k, z = origin.z + direction.z * k;
  if (DUNGEON_WORLD.isBlocked(x, z)) return;
  setMoveTarget({ x, y: DUNGEON_ROOM.floorY, z }, null);
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
      syncPlayerHp(battle, effectiveStats(progress).hp); // HP 보너스는 즉시 반영
    }
    return outcome;
  },
  onChapterOpen: (chapterId) => { recordChapterOpen(progress, chapterId); persist(); },
  onOpenChange: (open) => {
    setInputEnabled(!open);
    inputLocked = open;
    if (open) { clearMoveTarget(); hud.hideModal(); }
  }
});

// ---------- 퀘스트 로그 (Stage 9) ----------
questLog.initQuestLog({
  seed: TEST_MODE ? 5 : undefined,
  getProgress: () => progress,
  openReader,
  isReaderOpen,
  onOpenChange: (open) => {
    setInputEnabled(!open);
    inputLocked = open;
    if (open) { clearMoveTarget(); hud.hideModal(); }
  },
  onAnswer: (questId, originalIndex) => {
    const r = answerWhatif(progress.quests, progress, questId, originalIndex);
    if (r.completed) {
      const rw = r.completed.reward;
      persist();
      hud.renderStats(effectiveStats(progress), wallet(), [...(rw.cr2032 ? ["cr2032"] : []), ...Object.keys(rw.bonus ?? {})]);
      syncPlayerHp(battle, effectiveStats(progress).hp);
      fx.showToast(`📜 ${r.completed.code} 완료 — ${r.completed.title}\n🎁 ${rw.label} · 📖 완독 배지 획득`, 5);
    }
    return r;
  }
});
questsReady = true;
refreshQuests();

// ---------- 전투 이벤트 처리 ----------
const battleRng = createRng(TEST_MODE ? 11 : Date.now() + 1);
let inputLocked = false; // 오버레이가 열려 있으면 발사 금지

function performFire(target = null) {
  if (inputLocked) return;
  // 퀘스트 보상: DLE(사거리) · ADV 패킷 강화(데미지 계수) — Stage 9
  const perks = progress.quests.perks;
  const shot = fireAdvPacket(activeBattle(), motor, target, {
    rangeMul: perks.dle ? PERKS.dle.rangeMul : 1,
    ...(perks.advBoost ? { coef: PERKS.advBoost.coef } : {})
  });
  if (shot) clearMoveTarget();
}

function handleBattleEvents(events) {
  let dirty = false;
  const changed = [];
  for (const e of events) {
    switch (e.type) {
      case "hit": {
        const m = e.monster;
        if (m.wifi && !m.revealed) m.revealed = true; // 스캔 = 대역 판명
        fx.floatText(m.x, m.y + 0.6, m.z, `${e.amount}${e.crit ? "!" : ""}`, e.crit ? "crit" : "");
        questProgress({ type: "hit", monsterType: m.type });
        if (e.firstScan && recordScan(progress, m.type)) {
          const def = MONSTERS[m.type];
          fx.showToast(`🔍 도감 등록 — ${def.name} · ${def.role} · ${def.pdu}\n${def.scan}`, 6);
          dirty = true;
        }
        break;
      }
      case "kill": {
        const m = e.monster;
        battleView.burstAt(m.x, m.y, m.z);
        const { level, leveledUp } = applyKill(progress, m.type, e.xp);
        questEvent(progress.quests, { type: "kill", monsterType: m.type });
        fx.floatText(m.x, m.y + 1.0, m.z, `XP +${e.xp}`, "loot");
        changed.push("xp");
        if (leveledUp) fx.showToast(`⭐ 레벨 업! Lv ${level} — 스탯 포인트 +${leveledUp * STAT_POINTS_PER_LEVEL} (패킷 대장간 RF 랩에서 분배)`, 4);
        dirty = true;
        break;
      }
      case "pickup":
        applyPickup(progress, e.item, e.count);
        fx.floatText(motor.x, motor.y + 0.8, motor.z, `🪙 CR2032 +${e.count}`, "loot");
        changed.push("cr2032");
        dirty = true;
        break;
      case "playerHit":
        fx.floatText(motor.x, motor.y + 0.9, motor.z, `-${e.amount}`, "hurt");
        break;
      case "dodge":
        fx.floatText(motor.x, motor.y + 0.9, motor.z, "회피!", "dodge");
        break;
      case "packetLost": {
        // 간섭 채널 위에서 쏜 패킷이 깨졌다 — 이 몬스터의 대역이 드러난다(채널 분류)
        const m = e.monster;
        if (!m.revealed) { m.revealed = true; fx.showToast(`🔍 Wi-Fi ${m.wifi}번 대역 발견 — 채널 ${run?.link?.channel}에서 패킷이 깨졌다. 채널맵에서 빼면 피할 수 있다`, 3.5); }
        fx.floatText(m.x, m.y + 0.8, m.z, `패킷 손실 ✗ch${run?.link?.channel ?? "?"}`, "dodge");
        break;
      }
      case "outOfBand":
        fx.floatText(motor.x, motor.y + 0.9, motor.z, `간섭 밖 ch${run?.link?.channel ?? "?"} — 피해 0`, "dodge");
        break;
      case "ko":
        if (run) {
          // 던전 KO = Connection Timeout: CR2032 10% 손실 → 체크포인트(층 시작)로 롤백하거나 마을로 (PRD §5, Stage 8)
          const lost = applyTimeoutPenalty(progress);
          changed.push("cr2032");
          dirty = true;
          run.phase = "timeout";
          clearMoveTarget();
          setInputEnabled(false);
          inputLocked = true;
          dungeonUi.openTimeout({ floor: run.floor, lost, rollbacks: run.rollbacks });
        } else {
          // 훈련장 KO: 페널티 없이 시작 지점으로 (Stage 8에서 체크포인트 롤백으로 확장)
          fx.showToast("📶 Connection Timeout — 시작 지점으로 재연결합니다 (supervision timeout)", 4);
          resetMotor(motor, SPAWN_POS);
          resetOrbit(SPAWN_POS.y);
          clearMoveTarget();
          revivePlayer(battle);
        }
        break;
    }
  }
  if (dirty) {
    persist();
    hud.renderStats(effectiveStats(progress), wallet(), changed);
  }
}

// ---------- 호핑 던전: 입장 · 층 진행 · 귀환 ----------
const dungeonRng = createRng(TEST_MODE ? 99 : Date.now() + 2);
let dungeonSeedBase = TEST_MODE ? 1234 : Date.now() >>> 0;
let consoleCooldown = 0; // 콘솔 앞을 떠났다 돌아와야 다시 자동으로 열린다
let portalCooldown = 0;

const DUNGEON_SKY = new THREE.Color(0x07040f), VILLAGE_SKY = scene.background.clone();
function setAmbience(underground) {
  scene.background.copy(underground ? DUNGEON_SKY : VILLAGE_SKY);
  scene.fog.color.copy(underground ? DUNGEON_SKY : VILLAGE_SKY);
  scene.fog.near = underground ? 14 : 90;
  scene.fog.far = underground ? 40 : 220;
  world.root.visible = !underground;
}

/** 체크포인트 = 층 시작 순간: 같은 layout으로 전투·링크·위치를 다시 만든다 (PRD §5 Connection Timeout 롤백) */
function placeAtCheckpoint() {
  const b = createFloorBattle(run.layout);
  b.player = battle.player; // HP는 마을과 던전이 공유한다
  run.battle = b;
  run.link = createLink(run.layout.hopIncrement);
  run.phase = "combat";
  resetMotor(motor, { x: DUNGEON_ROOM.cx, y: DUNGEON_ROOM.floorY, z: DUNGEON_ROOM.cz });
  resetOrbit(DUNGEON_ROOM.floorY);
  clearMoveTarget();
}

function startFloor(floor) {
  const layout = generateFloor(floor, (dungeonSeedBase += 7919));
  run = { floor, layout, battle: null, link: null, puzzle: createLinkPuzzle(layout), phase: "combat", observing: true, rollbacks: 0 };
  placeAtCheckpoint();
  const b = run.battle;
  setAmbience(true);
  hud.hideModal();
  hud.setBadge(`⚔️ 호핑 던전 ${floor}층`);
  fx.showToast(`⚔️ ${floor}층 — Wi-Fi 간섭 몬스터 ${b.monsters.length}마리! 바닥의 빨간 원(광역 예고) 밖으로 피하세요`, 4);
}

/** 관문/포털에서 다음 층 도전 (입장료) */
function enterNextFloor() {
  const floor = nextFloor(progress);
  if (!payDungeonEntry(progress)) return;
  persist();
  hud.renderStats(effectiveStats(progress), wallet(), ["cr2032"]);
  dungeonUi.closeDungeonPanel();
  startFloor(floor);
}

function leaveDungeon(ko = false) {
  run = null;
  setAmbience(false);
  const gate = { x: -9.0, z: -7.6 }; // 던전 관문 위 (layout.js dungeonGate walkPos)
  resetMotor(motor, { x: gate.x, y: groundHeightAt(gate.x, gate.z), z: gate.z });
  resetOrbit(motor.y);
  clearMoveTarget();
  revivePlayer(battle);
  if (!ko) battle.player.hp = battle.player.maxHp;
  if (dungeonUi.isDungeonPanelOpen()) dungeonUi.closeDungeonPanel();
  dungeonUi.updateHud(null);
  hud.setBadge("⚔️ 던전 관문 · 마을로 귀환");
}

function openDungeonEntry() {
  setInputEnabled(false);
  inputLocked = true;
  clearMoveTarget();
  hud.hideModal();
  dungeonUi.openEntry({ floor: nextFloor(progress), fromPortal: false });
}

function openLinkConsole() {
  if (!run || run.phase === "combat") return;
  setInputEnabled(false);
  inputLocked = true;
  clearMoveTarget();
  run.observing = !run.puzzle.solved;
  dungeonUi.openConsole(run);
}

/** 던전 안 위치 이벤트: 콘솔·포털에 다가가면 자동으로 연다 */
function checkDungeonProximity(dt) {
  consoleCooldown = Math.max(0, consoleCooldown - dt);
  portalCooldown = Math.max(0, portalCooldown - dt);
  if (!run || dungeonUi.isDungeonPanelOpen()) return;
  const dC = Math.hypot(motor.x - dungeonView.CONSOLE_POS.x, motor.z - dungeonView.CONSOLE_POS.z);
  const dP = Math.hypot(motor.x - dungeonView.PORTAL_POS.x, motor.z - dungeonView.PORTAL_POS.z);
  if (run.phase === "link" && dC < 1.8 && consoleCooldown <= 0) { consoleCooldown = 3; openLinkConsole(); }
  if (run.phase === "open" && dP < 1.6 && portalCooldown <= 0) {
    portalCooldown = 3;
    setInputEnabled(false);
    inputLocked = true;
    clearMoveTarget();
    dungeonUi.openEntry({ floor: nextFloor(progress), fromPortal: true });
  }
}

function onCombatCleared() {
  run.phase = "link";
  fx.showToast("✅ 간섭 몬스터 소탕! 북쪽 📡 링크 콘솔에서 채널맵을 정비해 연결을 안정시키세요", 5);
}

/** 롤백 선택: 체크포인트에서 재연결 */
function rollbackToCheckpoint() {
  if (!run) return;
  run.rollbacks += 1;
  progress.dungeon.rollbacks = (progress.dungeon.rollbacks ?? 0) + 1;
  persist();
  revivePlayer(battle);
  placeAtCheckpoint();
  fx.showToast(`🔁 ${run.floor}층 체크포인트로 재연결 (롤백 ${run.rollbacks}회째) — 채널맵을 다시 정비하세요`, 3);
}

chmap.initChmap({
  hasAfh: () => hasAfhSkill(progress),
  onToggle: (ch) => { if (run?.link && !toggleLinkChannel(run.link, ch)) fx.showToast("채널맵은 최소 2채널을 써야 합니다", 2); },
  onAfh: () => {
    if (!run?.link || !hasAfhSkill(progress)) return;
    if (!run.battle.monsters.some((m) => m.state !== "dead" && m.revealed)) { fx.showToast("아직 드러난 간섭 대역이 없습니다 — 몬스터를 맞혀 스캔하세요", 2.5); return; }
    if (applyAfh(run.link, run.battle)) fx.showToast(`📶 AFH: 채널맵 갱신 요청 — 이벤트 #${run.link.pending.instant}부터 적용`, 2.5);
  },
  onReset: () => { if (run?.link) requestMap(run.link, allChannelsMap()); }
});

dungeonUi.initDungeonPanel({
  // 롤백을 먼저(phase가 combat으로 돌아감) 하고 창을 닫는다 — 반대 순서면 닫기 처리가 "마을로"로 판단한다
  onRollback: () => { rollbackToCheckpoint(); dungeonUi.closeDungeonPanel(); },
  getProgress: () => progress,
  onEnter: enterNextFloor,
  onLeave: () => leaveDungeon(false),
  onClose: (mode) => {
    setInputEnabled(true);
    inputLocked = false;
    if (mode === "timeout" && run?.phase === "timeout") leaveDungeon(true); // 롤백을 고르지 않고 닫으면 마을로
    if (mode === "console") consoleCooldown = 3;
    if (mode === "portal") portalCooldown = 3;
  },
  onToggle: (ch) => { if (run && toggleChannel(run.puzzle, ch)) dungeonUi.updateConsole(run); },
  onReset: () => { if (run) { resetMap(run.puzzle); dungeonUi.updateConsole(run); } },
  onObserve: (on) => { if (run) { run.observing = on; dungeonUi.setObserving(on); dungeonUi.updateConsole(run); } },
  onTest: () => {
    if (!run || run.puzzle.solved) return;
    const result = runLinkTest(run.puzzle);
    if (result.ok) {
      run.phase = "open";
      run.observing = false;
      applyFloorClear(progress, run.floor, result.stars);
      persist();
      fx.showToast(`🌀 ${run.floor}층 클리어! 남쪽 포털로 다음 층에 갈 수 있습니다`, 4);
    }
    dungeonUi.showTestResult(result, run);
  }
});

// ---------- 알바: 비콘 신호 측정소 ----------
// 실시간 시계 (테스트는 __PK.advanceClock으로 앞당긴다 — 측정기 배터리 충전 검증용)
let clockOffset = 0;
const now = () => Date.now() + clockOffset;
const jobRng = createRng(TEST_MODE ? 7 : Date.now());
/** @type {import("./core/rssiJob.js").Job | null} */
let job = null;

function onJobDone() {
  const paid = applyJobResult(progress, job.result);
  questEvent(progress.quests, { type: "job", grade: job.result.grade });
  persist();
  hud.renderStats(effectiveStats(progress), wallet(), ["cr2032"]);
  jobPanel.showResult(job.result, paid, job.history);
}

jobPanel.initJobPanel({
  getProgress: () => progress,
  getCharges: () => jobChargesAt(progress, now()),
  onStart: () => {
    if (!startJobCharge(progress, now())) return; // 배터리 없음 (버튼도 비활성)
    persist();
    job = createJob(jobRng);
    jobPanel.showRunning();
    jobPanel.updateJob(job);
  },
  onConfirm: () => { if (job) { confirmMeasurement(job); jobPanel.updateJob(job); } },
  onClose: () => {
    job = null; // 측정 도중 닫으면 보수 없이 중단
    setInputEnabled(true);
    inputLocked = false;
  }
});

function openJob() {
  setInputEnabled(false);
  inputLocked = true;
  clearMoveTarget();
  hud.hideModal();
  jobPanel.openJob();
}

// ---------- RF 랩: 장비 강화 · 스탯 분배 (Stage 7.5) ----------
const labRng = createRng(TEST_MODE ? 31 : Date.now() + 3);
function refreshStats(changed) {
  hud.renderStats(effectiveStats(progress), wallet(), changed);
  syncPlayerHp(battle, effectiveStats(progress).hp); // HP가 오르면 즉시 반영
}
rfLab.initRfLab({
  getProgress: () => progress,
  getStats: () => effectiveStats(progress),
  onUpgrade: (piece) => {
    const before = effectiveStats(progress);
    const r = upgradeGear(progress, piece, labRng);
    if (r.ok) { persist(); refreshStats(["cr2032", ...(r.success ? [GEAR[piece].stat] : [])]); }
    rfLab.showUpgradeResult(piece, r, before, effectiveStats(progress));
  },
  onAllocate: (stat) => {
    const before = effectiveStats(progress);
    const ok = allocatePoint(progress, stat);
    if (ok) { persist(); refreshStats([stat, "xp"]); }
    rfLab.showAllocResult(stat, ok, before, effectiveStats(progress));
    return ok;
  },
  onClose: () => { setInputEnabled(true); inputLocked = false; }
});
function openRfLab() {
  setInputEnabled(false);
  inputLocked = true;
  clearMoveTarget();
  hud.hideModal();
  rfLab.openRfLab();
}

hud.setModalHandlers({
  action: (id) => {
    if (id === "library") openLibrary();
    else if (id === "job") openJob();
    else if (id === "dungeon") openDungeonEntry();
    else if (id === "rflab") openRfLab();
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
  onFire: () => performFire(),
  onQuests: () => questLog.openQuestLog(),
  onMoveKey: clearMoveTarget,
  onTap: handleTap,
  onOrbit: rotateOrbit,
  onZoom: (apply) => setOrbitDistance(apply(orbit.distance)),
  getZoom: () => orbit.distance
});

const btnReset = document.getElementById("btn-reset");
btnReset.addEventListener("click", () => {
  if (run) leaveDungeon(false); // 던전 안에서는 귀환
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
    const seek = seekIntent(motor, moveTarget, dt, effectiveStats(progress).hop);
    if (seek.arrived) arriveAtTarget();
    else intent = seek;
  }

  const { moved, landed } = stepMotor(motor, intent, dt, currentWorld(), effectiveStats(progress).hop);
  // 걸은 거리 (Q0) — 1 m 단위로 모아서 반영
  questWalk += moved;
  if (questWalk >= 1) { const m = Math.floor(questWalk); questWalk -= m; questProgress({ type: "walk", amount: m }); }
  // 클릭 이동 중 양 축이 모두 막히면 목표 도달 불가로 취소
  if (moveTarget && inputLen <= 0.05 && intent.speedScale > 0 && moved < 0.0001) clearMoveTarget();
  if (landed) {
    knightView.onLanded(motor.x, motor.y, motor.z);
    hud.setBadge(regionLabel());
  }

  // 던전 전투: 링크 도약 · ACS · 간섭 판정 (Stage 8)
  let interference = null;
  if (run?.phase === "combat") {
    stepLink(run.link, dt);
    for (const e of stepAcs(run.battle, run.floor, dt, dungeonRng)) {
      if (e.monster.revealed) fx.floatText(e.monster.x, e.monster.y + 1.2, e.monster.z, `ACS: Wi-Fi ${e.from}→${e.to}`, "crit");
    }
    interference = interferenceFor(run.link);
  }
  if (run?.phase !== "timeout") {
    handleBattleEvents(stepBattle(activeBattle(), dt, { player: motor, stats: effectiveStats(progress), rng: battleRng, interference }));
  }
  if (run) {
    if (run.phase === "combat" && run.battle.monsters.every((m) => m.state === "dead")) onCombatCleared();
    if (run.phase === "link" && run.observing && dungeonUi.dungeonPanelMode() === "console") {
      observe(run.puzzle, dt, dungeonRng);
      dungeonUi.updateConsole(run);
    }
    checkDungeonProximity(dt);
  }
  dungeonUi.updateHud(run);
  chmap.updateChmap(run);

  knightView.syncKnight(motor, moved > 0.0005, dt);
  updateCamera(motor, dt);
  fx.updateToast(dt);
}

// 월드 좌표 → 화면 좌표 (떠오르는 숫자용)
const projVec = new THREE.Vector3();
function projectToScreen(x, y, z) {
  projVec.set(x, y, z).project(camera);
  return { x: (projVec.x + 1) / 2 * window.innerWidth, y: (1 - projVec.y) / 2 * window.innerHeight, behind: projVec.z > 1 };
}

function renderFrame(t, dt) {
  battleView.syncBattle(activeBattle(), camera, t, dt);
  dungeonView.syncDungeon(run, t);
  fx.updateFx(projectToScreen, dt);
  fx.setPlayerHp(battle.player.hp, battle.player.maxHp);
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
  renderFrame(t, dt);
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
  library: { open: openLibrary, isOpen: isLibraryOpen, answerKey: currentAnswerKey, readerUrl, isReaderOpen },
  quests: {
    open: (id) => questLog.openQuestLog(id),
    close: questLog.closeQuestLog,
    isOpen: questLog.isQuestLogOpen,
    shownOrder: questLog.shownOrder,
    state: () => structuredClone(progress.quests)
  },
  battle: {
    fire: () => performFire(),
    /** 테스트용: 플레이어 HP 직접 설정 (Connection Timeout 재현) */
    setHp: (hp) => { battle.player.hp = hp; },
    state: () => ({
      hp: battle.player.hp, maxHp: battle.player.maxHp, drops: activeBattle().drops.length,
      monsters: activeBattle().monsters.map((m) => ({ id: m.id, hp: m.hp, maxHp: m.maxHp, state: m.state, x: m.x, z: m.z, type: m.type }))
    })
  },
  rflab: { open: openRfLab, isOpen: rfLab.isRfLabOpen },
  dungeon: {
    openEntry: openDungeonEntry,
    enter: enterNextFloor,
    leave: () => leaveDungeon(false),
    openConsole: openLinkConsole,
    /** 테스트용 관찰: 진행 중인 층 (정답인 막힌 채널 포함) */
    rollback: rollbackToCheckpoint,
    link: () => run?.link && { event: run.link.event, channel: run.link.channel, map: [...run.link.map], pending: run.link.pending && { instant: run.link.pending.instant, map: [...run.link.pending.map] } },
    monsters: () => run?.battle.monsters.map((m) => ({ id: m.id, wifi: m.wifi, revealed: m.revealed, hp: m.hp, maxHp: m.maxHp, x: m.x, z: m.z, state: m.state })),
    state: () => run && {
      floor: run.floor, phase: run.phase, rollbacks: run.rollbacks, spawns: run.layout.spawns, hopIncrement: run.layout.hopIncrement, wifi: run.layout.wifi, monsterWifi: run.layout.monsterWifi,
      blocked: [...run.layout.blocked].sort((a, b) => a - b), map: [...run.puzzle.map], solved: run.puzzle.solved,
      observed: run.puzzle.stats.map((s) => ({ ...s })), event: run.puzzle.event
    },
    panelMode: dungeonUi.dungeonPanelMode,
    room: DUNGEON_ROOM
  },
  advanceClock: (ms) => { clockOffset += ms; },
  job: {
    open: openJob,
    isOpen: jobPanel.isJobOpen,
    /** 테스트용 관찰: 현재 세션 요약 (실제 거리 포함) */
    state: () => job && {
      phase: job.phase, timeLeft: job.timeLeft, score: job.score, rounds: job.history.length,
      samples: job.beacon.samples.length, distance: job.beacon.distance, result: job.result
    }
  },
  teleport: (x, z, y) => Object.assign(motor, { x, z, y: y ?? (run ? DUNGEON_ROOM.floorY : groundHeightAt(x, z)), vy: 0, grounded: true }),
  /** 시뮬레이션을 seconds 만큼 고정 스텝으로 진행 (테스트 모드용) */
  tick: (seconds) => {
    for (let n = Math.round(seconds / FIXED_DT); n > 0; n--) simulate(FIXED_DT);
    renderFrame(0, seconds);
    scene.updateMatrixWorld(); // 렌더를 생략하므로 레이캐스트용 행렬을 직접 갱신
  },
  projectToScreen: (x, y, z) => {
    scene.updateMatrixWorld();
    const v = new THREE.Vector3(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }
};
