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
import { SPAWN_POS, landmark, JOB_AREA, LANDMARKS, VILLAGERS } from "./core/layout.js";
import * as prisonUi from "./ui/prison.js";
import * as cryptUi from "./ui/crypt.js";
import { QUEST_SKILLS, RSSI_JOB, COMBAT } from "./core/balance.js";
import { isBlocked, supportHeightAt } from "./core/collision.js";
import { createMotor, resetMotor, jump, stepMotor, seekIntent } from "./core/motor.js";
import * as world from "./render/world.js";
import * as knightView from "./render/knight.js";
import { camera, orbit, rotateOrbit, setOrbitDistance, resetOrbit, cameraRelative, updateCamera, resizeCamera, setAttract, startLanding } from "./render/camera.js";
import * as splash from "./ui/splash.js";
import { openHopGuide, isHopGuideOpen, hopGuideSeen, hopGuideExample } from "./ui/hopGuide.js";
import { startTutorial, isTutorialOpen, tutorialSeen, tutorialState, tutorialNext } from "./ui/tutorial.js";
import { lifeRoot, stepLife, lifeState, villagerTargets, holdVillager } from "./render/villagers.js";
import { initTalk, openTalk, closeTalk, isTalkOpen, talkState, talkMore } from "./ui/talk.js";
splash.setStatus("🧱 스펙트럼 대륙을 짓는 중…");
import { initInput, readMoveInput, setInputEnabled } from "./ui/input.js";
import * as hud from "./ui/hud.js";
import { initLibrary, openLibrary, isLibraryOpen, currentAnswerKey, chapterLink, lastChapterUrl } from "./ui/library.js";
import * as questLog from "./ui/questLog.js";
import * as audio from "./ui/audio.js";
import { sfx } from "./ui/audio.js";
import { questEvent, answerWhatif, questById, readyForWhatif, PERKS } from "./core/quests.js";
import {
  SAVE_KEY, loadProgress, saveProgress, effectiveStats, applyQuizResult, recordChapterOpen
} from "./core/progress.js";
import { CHAPTERS } from "./core/chapters.data.js";
import { applyJobResult, jobChargesAt, startJobCharge, chargeCfg } from "./core/progress.js";
import { createRng } from "./core/quiz.js";
import { createJob, stepJob, markBeacon } from "./core/rssiJob.js";
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
// 조명·그림자 (Stage 11.7, 벤치마크 반영): 부드러운 그림자 + ACES 톤 매핑
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// 하늘: 위는 하늘색, 지평선은 밝은 안개색 — 떠 있는 섬 뒤로 보인다
const VILLAGE_SKY_TEX = (() => {
  const c = document.createElement("canvas");
  c.width = 2; c.height = 256;
  const g = c.getContext("2d").createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#7fbfea"); g.addColorStop(0.55, "#bfe0f2"); g.addColorStop(1, "#eef5f1");
  const ctx = c.getContext("2d"); ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const VILLAGE_FOG = new THREE.Color(0xd8ebf3);
scene.background = VILLAGE_SKY_TEX;
scene.fog = new THREE.Fog(VILLAGE_FOG, 70, 190);

const sun = new THREE.DirectionalLight(0xffefd6, 2.1); // 따뜻한 햇살 — 섬 전체에 그림자
sun.position.set(28, 46, 22);
sun.castShadow = true;
{
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;   // 모바일은 그림자 해상도를 낮춘다
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 120 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
}
scene.add(sun);
scene.add(new THREE.AmbientLight(0xdcecff, 0.45));
scene.add(new THREE.HemisphereLight(0xd6ecff, 0x7a8f5a, 0.85));

world.enableShadows(world.root);
world.sea.visible = false;   // 떠 있는 섬 — 바다 대신 하늘 (클릭 이동 레이캐스트도 보이는 것만 맞는다)
scene.add(world.root);
scene.add(lifeRoot);   // 주민·광고 패킷 (Stage 11.9)
scene.add(battleView.battleRoot);
world.enableShadows(battleView.battleRoot);   // 훈련장 봇
scene.add(dungeonView.dungeonRoot);
knightView.addKnightTo(scene);

// ---------- 사운드 (Stage 11) ----------
audio.initAudio({ bgm: !new URLSearchParams(location.search).has("test") });
audio.setBgm("village");
const btnSound = document.getElementById("btn-sound");
function renderSoundButton() {
  const m = audio.isMuted();
  btnSound.textContent = m ? "🔇" : "🔊";
  btnSound.setAttribute("aria-pressed", String(!m));
  btnSound.title = m ? "소리 켜기 (M)" : "소리 끄기 (M)";
}
btnSound.addEventListener("click", () => { audio.toggleMute(); renderSoundButton(); btnSound.blur(); });
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyM" || e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  audio.toggleMute();
  renderSoundButton();
});
renderSoundButton();

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
let stepDist = 0;  // 발소리 간격
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
  document.getElementById("btn-dash").hidden = !progress.quests.perks.dash;
  const q = questById(progress.quests.active);
  if (q && questReadyShown !== q.id && readyForWhatif(progress.quests, progress, q)) {
    questReadyShown = q.id;
    sfx("questReady");
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

/** 랜드마크 안내 모달을 띄우고 그 앞으로 걸어간다 — 건물 클릭과 퀘스트 "📍 길 안내"가 같이 쓴다 */
function goToLandmark(info) {
  hud.showModal(modalInfo(info));
  world.highlightSign(LANDMARKS.find((l) => l.info === info)?.id ?? null);
  sfx("open");
  const place = ["hall", "prison", "crypt"].find((id) => landmark(id).info === info);
  if (place) questProgress({ type: "visit", place });
  setMoveTarget(info.walkPos, `${info.title} 앞 도착`);
  hud.setBadge(`🚶 ${info.title}(으)로 이동 중`);
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

const dash = { t: 0, cooldown: 0 };
const dashBtn = document.getElementById("btn-dash");
function performDash() {
  if (inputLocked || !progress.quests.perks.dash || dash.cooldown > 0) return;
  dash.t = QUEST_SKILLS.DASH.time;
  sfx("dash");
  dash.cooldown = QUEST_SKILLS.DASH.cooldown;
  clearMoveTarget();
  hud.setBadge("⚡ Connect Request 돌진!");
}

function performJump() {
  if (jump(motor)) { hud.setBadge("🦘 점프!"); sfx("jump"); questProgress({ type: "jump" }); }
}

// ---------- 클릭 / 탭 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/** 모달 정보 — 퀘스트 보상으로 생기는 버튼(GATT 회관 서비스 상자)을 붙인다 (Stage 10) */
function modalInfo(info) {
  const qs = progress.quests;
  if (info === landmark("hall").info && qs.perks.gattAccess && !qs.claimed?.gattBox) {
    return { ...info, action: { id: "gattBox", label: `📦 서비스 상자 열기 (CR2032 ${GATT_BOX_REWARD})` } };
  }
  return info;
}
const GATT_BOX_REWARD = 20;
function openGattBox() {
  const qs = progress.quests;
  if (!qs.perks.gattAccess || qs.claimed?.gattBox) return;
  (qs.claimed ??= {}).gattBox = new Date().toISOString();
  progress.cr2032 += GATT_BOX_REWARD;
  persist();
  hud.hideModal();
  hud.renderStats(effectiveStats(progress), wallet(), ["cr2032"]);
  sfx("coin");
  fx.showToast(`📦 서비스 상자 (UUID 0x180F Battery Service) — 특성 'Battery Level'을 읽었다: CR2032 +${GATT_BOX_REWARD}`, 5);
}

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
    : [...battleView.monsterTargets, ...villagerTargets, ...world.interactiveObjects, world.terrain, world.sea];
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

  // 주민을 누르면 대사창 (Stage 11.14)
  for (let o = hits[0].object; o; o = o.parent) {
    if (o.userData.villager) { talkTo(o.userData.villager); return; }
  }
  const info = findInteractive(hits[0].object);
  if (info) { goToLandmark(info); return; }

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
  chapterLink,
  guideTo: (id) => {
    if (run) { fx.showToast("📍 던전 안에서는 길 안내를 할 수 없다 — 마을로 돌아간 뒤 다시 눌러 보자", 3); return; }
    goToLandmark(landmark(id).info);
  },
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
      sfx("questComplete");
      fx.showToast(`📜 ${r.completed.code} 완료 — ${r.completed.title}\n🎁 ${rw.label} · 📖 완독 배지 획득`, 5);
    }
    return r;
  }
});
questsReady = true;
refreshQuests();

// ---------- 보안의 감옥 · 지하묘지 (Stage 10) ----------
const overlayChange = (open) => {
  setInputEnabled(!open);
  inputLocked = open;
  if (open) { clearMoveTarget(); hud.hideModal(); }
};
prisonUi.initPrison({
  rng: createRng(TEST_MODE ? 21 : Date.now() + 3),
  onOpenChange: overlayChange,
  onPassed: () => { sfx("perfect"); questProgress({ type: "pairing" }); fx.showToast("🔓 페어링 시험 통과 — 도청자와 중간자를 구별했다", 3.5); }
});
cryptUi.initCrypt({
  onOpenChange: overlayChange,
  onAllDone: () => { sfx("perfect"); questProgress({ type: "power" }); fx.showToast("🔋 배터리 계약 3건 완수 — 지하묘지의 센서들이 깨어났다", 3.5); }
});

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
  if (shot) { clearMoveTarget(); sfx("fire"); }
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
        sfx(e.crit ? "crit" : "hit");
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
        sfx("kill");
        const { level, leveledUp } = applyKill(progress, m.type, e.xp);
        questEvent(progress.quests, { type: "kill", monsterType: m.type });
        fx.floatText(m.x, m.y + 1.0, m.z, `XP +${e.xp}`, "loot");
        changed.push("xp");
        if (leveledUp) sfx("levelUp");
        if (leveledUp) fx.showToast(`⭐ 레벨 업! Lv ${level} — 스탯 포인트 +${leveledUp * STAT_POINTS_PER_LEVEL} (패킷 대장간 RF 랩에서 분배)`, 4);
        dirty = true;
        break;
      }
      case "pickup":
        applyPickup(progress, e.item, e.count);
        fx.floatText(motor.x, motor.y + 0.8, motor.z, `🪙 CR2032 +${e.count}`, "loot");
        sfx("pickup");
        changed.push("cr2032");
        dirty = true;
        break;
      case "playerHit":
        fx.floatText(motor.x, motor.y + 0.9, motor.z, `-${e.amount}`, "hurt");
        sfx("hurt");
        break;
      case "dodge":
        fx.floatText(motor.x, motor.y + 0.9, motor.z, e.dash ? "⚡ 돌진 회피!" : "회피!", "dodge");
        sfx("dodge");
        break;
      case "shieldBlock":
        fx.floatText(motor.x, motor.y + 0.9, motor.z, "🛡️ MIC 실패 — 위조 패킷 폐기", "dodge");
        sfx("shield");
        break;
      case "packetLost": {
        // 간섭 채널 위에서 쏜 패킷이 깨졌다 — 이 몬스터의 대역이 드러난다(채널 분류)
        const m = e.monster;
        if (!m.revealed) { m.revealed = true; fx.showToast(`🔍 Wi-Fi ${m.wifi}번 대역 발견 — 채널 ${run?.link?.channel}에서 패킷이 깨졌다. 채널맵에서 빼면 피할 수 있다`, 3.5); }
        fx.floatText(m.x, m.y + 0.8, m.z, `패킷 손실 ✗ch${run?.link?.channel ?? "?"}`, "dodge");
        sfx("packetLost");
        break;
      }
      case "outOfBand":
        fx.floatText(motor.x, motor.y + 0.9, motor.z, `간섭 밖 ch${run?.link?.channel ?? "?"} — 피해 0`, "dodge");
        sfx("outOfBand");
        break;
      case "windup":
        if (Math.hypot(e.monster.x - motor.x, e.monster.z - motor.z) < 8) sfx("windup"); // 가까운 공격 예고만
        break;
      case "ko":
        sfx("ko");
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

const DUNGEON_SKY = new THREE.Color(0x07040f);
function setAmbience(underground) {
  audio.setBgm(underground ? "dungeon" : "village");
  scene.background = underground ? DUNGEON_SKY : VILLAGE_SKY_TEX;
  scene.fog.color.copy(underground ? DUNGEON_SKY : VILLAGE_FOG);
  scene.fog.near = underground ? 14 : 70;
  scene.fog.far = underground ? 40 : 190;
  world.root.visible = !underground;
  lifeRoot.visible = !underground;
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
  if (!TEST_MODE && !hopGuideSeen()) showHopGuide();   // 처음 들어오면 호핑·간섭 설명 (Stage 11.12)
}
function talkTo(v) {
  hud.hideModal();
  clearMoveTarget();
  openTalk(v);
}
initTalk({
  onOpen: (v) => { holdVillager(v.id, motor); setInputEnabled(false); inputLocked = true; sfx("open"); },
  onClose: () => { holdVillager(null); setInputEnabled(true); inputLocked = false; },
  onChapterOpen: (id) => { recordChapterOpen(progress, id); persist(); }
});

function showTutorial() {
  if (isTutorialOpen()) return;
  questLog.closeQuestLog();
  questLog.closeQuestPop();
  hud.hideModal();
  setInputEnabled(false);
  inputLocked = true;
  clearMoveTarget();
  startTutorial(() => { setInputEnabled(true); inputLocked = false; });
}
// 📘 다시 보기 버튼 (조작법 상자·퀘스트 로그)
document.addEventListener("click", (e) => {
  if (e.target instanceof Element && e.target.closest('[data-action="tutorial"]')) showTutorial();
});
function showHopGuide() {
  setInputEnabled(false);
  inputLocked = true;
  clearMoveTarget();
  openHopGuide(() => { setInputEnabled(true); inputLocked = false; });
}

/** 관문/포털에서 다음 층 도전 (입장료) */
function enterNextFloor() {
  const floor = nextFloor(progress);
  if (!payDungeonEntry(progress)) return;
  persist();
  hud.renderStats(effectiveStats(progress), wallet(), ["cr2032"]);
  dungeonUi.closeDungeonPanel();
  sfx("portal");
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
  if (job && job.phase !== "done") { fx.showToast("📡 비콘 찾기 알바 중에는 던전에 들어갈 수 없다 — 끝내거나 ✖로 그만두자", 3); return; }
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
  sfx("perfect");
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
  sfx("portal");
  fx.showToast(`🔁 ${run.floor}층 체크포인트로 재연결 (롤백 ${run.rollbacks}회째) — 채널맵을 다시 정비하세요`, 3);
}

chmap.initChmap({
  hasAfh: () => hasAfhSkill(progress),
  onToggle: (ch) => {
    if (run?.link && !toggleLinkChannel(run.link, ch)) { sfx("denied"); fx.showToast("채널맵은 최소 2채널을 써야 합니다", 2); } else sfx("channelToggle");
  },
  onAfh: () => {
    if (!run?.link || !hasAfhSkill(progress)) return;
    if (!run.battle.monsters.some((m) => m.state !== "dead" && m.revealed)) { fx.showToast("아직 드러난 간섭 대역이 없습니다 — 몬스터를 맞혀 스캔하세요", 2.5); return; }
    if (applyAfh(run.link, run.battle)) { sfx("afh"); fx.showToast(`📶 AFH: 채널맵 갱신 요청 — 이벤트 #${run.link.pending.instant}부터 적용`, 2.5); }
  },
  onReset: () => { if (run?.link) requestMap(run.link, allChannelsMap()); }
});

dungeonUi.initDungeonPanel({
  // 롤백을 먼저(phase가 combat으로 돌아감) 하고 창을 닫는다 — 반대 순서면 닫기 처리가 "마을로"로 판단한다
  onRollback: () => { rollbackToCheckpoint(); dungeonUi.closeDungeonPanel(); },
  getProgress: () => progress,
  onEnter: enterNextFloor,
  onLeave: () => leaveDungeon(false),
  onHelp: () => showHopGuide(),
  onClose: (mode) => {
    setInputEnabled(true);
    inputLocked = false;
    if (mode === "timeout" && run?.phase === "timeout") leaveDungeon(true); // 롤백을 고르지 않고 닫으면 마을로
    if (mode === "console") consoleCooldown = 3;
    if (mode === "portal") portalCooldown = 3;
  },
  onToggle: (ch) => { if (run && toggleChannel(run.puzzle, ch)) { sfx("channelToggle"); dungeonUi.updateConsole(run); } else sfx("denied"); },
  onReset: () => { if (run) { resetMap(run.puzzle); dungeonUi.updateConsole(run); } },
  onObserve: (on) => { if (run) { run.observing = on; dungeonUi.setObserving(on); dungeonUi.updateConsole(run); } },
  onTest: () => {
    if (!run || run.puzzle.solved) return;
    const result = runLinkTest(run.puzzle);
    sfx(result.ok ? "perfect" : "wrong");
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

// ---------- 알바: 비콘 찾기 (Stage 11.2) ----------
// 실시간 시계 (테스트는 __PK.advanceClock으로 앞당긴다 — 측정기 배터리 충전 검증용)
let clockOffset = 0;
const now = () => Date.now() + clockOffset;
const jobRng = createRng(TEST_MODE ? 7 : Date.now());
/** @type {import("./core/rssiJob.js").Job | null} */
let job = null;

/** 비콘을 숨길 수 있는 자리: (측정 구역 안에서) 걸어서 닿는 평지, 장애물에서 조금 떨어진 곳 (훈련장·던전 입구 제외) */
function isBeaconSpot(x, z) {
  if (Math.hypot(x, z) > WORLD.PLAY_RADIUS - 1 || isDungeonCell(x, z)) return false;
  if (Math.hypot(x - TRAINING_GROUND.x, z - TRAINING_GROUND.z) < 5) return false;
  const y = groundHeightAt(x, z);
  if (!Number.isFinite(y) || y > SPAWN_POS.y + 0.6) return false;
  return [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].every(([dx, dz]) => !isBlocked(x + dx, z + dz, y));
}
let huntRevealShown = false;

/** 공개 기둥만 숨긴다 (다음 비콘으로 넘어갈 때) */
function hideReveal() {
  huntBeacon.visible = false;
  huntRevealShown = false;
}
/** 알바가 끝나면 측정 구역 원도 숨긴다 */
function endHunt() {
  hideReveal();
  huntArea.visible = false;
}

function onJobDone() {
  endHunt();
  const paid = applyJobResult(progress, job.result);
  questEvent(progress.quests, { type: "job", grade: job.result.grade });
  persist();
  hud.renderStats(effectiveStats(progress), wallet(), ["cr2032"]);
  sfx(paid > 0 ? "coin" : "wrong");
  jobPanel.showResult(job.result, paid, job.history);
}

jobPanel.initJobPanel({
  getProgress: () => progress,
  getCharges: () => jobChargesAt(progress, now()),
  getRechargeSec: () => chargeCfg(progress).RECHARGE_SEC,
  onStart: () => {
    if (!startJobCharge(progress, now())) return; // 배터리 없음 (버튼도 비활성)
    persist();
    job = createJob(jobRng, { start: { x: motor.x, z: motor.z }, area: JOB_AREA, isSpotOk: isBeaconSpot });
    huntArea.visible = true;
    jobPanel.showRunning();
    jobPanel.updateJob(job);
    // 모달은 닫히고 기사는 걸어 다니며 찾는다
    setInputEnabled(true);
    inputLocked = false;
    hud.setBadge("📡 등대 둘레 노란 원 안에서 비콘을 찾자");
  },
  onMark: () => {
    if (!job || job.phase !== "search") return;
    markBeacon(job, motor);
    sfx("measure");
    jobPanel.updateJob(job);
  },
  onAbort: () => {
    job = null; // 찾는 도중 그만두면 보수 없이 중단
    endHunt();
    hud.setBadge(regionLabel());
  },
  onClose: () => {
    setInputEnabled(true);
    inputLocked = false;
  }
});

// 정답 공개 때 비콘 위치를 보여 주는 기둥 (판정 색)
const huntBeacon = new THREE.Group();
{
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 10), new THREE.MeshBasicMaterial({ color: 0x7dffb5, transparent: true, opacity: 0.75 }));
  pillar.position.y = 1.6;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 32), new THREE.MeshBasicMaterial({ color: 0x7dffb5, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: 0x39d0ff }));
  box.position.y = 0.25;
  huntBeacon.add(pillar, ring, box);
  huntBeacon.visible = false;
  scene.add(huntBeacon);
}
// 측정 구역 — 등대 둘레의 노란 원 (알바 중에만 보인다)
const huntArea = new THREE.Group();
{
  const y = groundHeightAt(JOB_AREA.x, JOB_AREA.z) + 0.04;
  const ring = new THREE.Mesh(new THREE.RingGeometry(RSSI_JOB.AREA_R - 0.12, RSSI_JOB.AREA_R, 64),
    new THREE.MeshBasicMaterial({ color: 0xffd76b, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(RSSI_JOB.AREA_R - 0.12, 64),
    new THREE.MeshBasicMaterial({ color: 0xffd76b, side: THREE.DoubleSide, transparent: true, opacity: 0.08, depthWrite: false }));
  for (const m of [ring, fill]) { m.rotation.x = -Math.PI / 2; m.position.set(JOB_AREA.x, y, JOB_AREA.z); huntArea.add(m); }
  fill.position.y -= 0.01;
  huntArea.visible = false;
  scene.add(huntArea);
}
const TIER_COLOR = { precise: 0x7dffb5, good: 0xb5f07d, near: 0xffb36b, miss: 0xff7a70 };
function showHuntBeacon() {
  const b = job.beacon;
  huntBeacon.position.set(b.x, groundHeightAt(b.x, b.z), b.z);
  const color = TIER_COLOR[b.tier?.id] ?? 0x7dffb5;
  huntBeacon.children[0].material.color.setHex(color);
  huntBeacon.children[1].material.color.setHex(color);
  huntBeacon.visible = true;
}

function openJob() {
  if (job && job.phase !== "done") { fx.showToast("📡 이미 비콘을 찾는 중이다", 2); return; }
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
    sfx(!r.ok ? "denied" : r.success ? "upgradeOk" : "upgradeFail");
    rfLab.showUpgradeResult(piece, r, before, effectiveStats(progress));
  },
  onAllocate: (stat) => {
    const before = effectiveStats(progress);
    const ok = allocatePoint(progress, stat);
    if (ok) { persist(); refreshStats([stat, "xp"]); }
    sfx(ok ? "upgradeOk" : "denied");
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
    else if (id === "prison") { hud.hideModal(); prisonUi.openPrison(); }
    else if (id === "crypt") { hud.hideModal(); cryptUi.openCrypt(); }
    else if (id === "gattBox") openGattBox();
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
  onDash: performDash,
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
const fireBtn = document.getElementById("btn-fire");
function simulate(dt) {
  if (isHopGuideOpen()) return;   // 던전 설명을 보는 동안 게임은 멈춘다 (Stage 11.12)
  if (job && job.phase !== "done" && !run) {
    const got = stepJob(job, dt, jobRng, motor);
    if (got.length) sfx("beacon"); // 광고 패킷 하나 수신 = 짧은 핑
    if (job.phase === "reveal" && !huntRevealShown) { showHuntBeacon(); huntRevealShown = true; }
    if (job.phase === "search" && huntRevealShown) hideReveal();
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
  // Connect Request 돌진: 바라보는 방향으로 짧게 빠르게 (Stage 10)
  dash.cooldown = Math.max(0, dash.cooldown - dt);
  let speed = effectiveStats(progress).hop;
  if (dash.t > 0) {
    dash.t = Math.max(0, dash.t - dt);
    intent = { dirX: Math.sin(motor.rotY), dirZ: Math.cos(motor.rotY), speedScale: 1 };
    speed *= QUEST_SKILLS.DASH.speedMul;
  }
  dashBtn.classList.toggle("cooling", dash.cooldown > 0);
  // 발사 쿨타임: 쏘면 어두워지고 시계 방향으로 걷힌다 (--cd 1 → 0)
  const fcd = activeBattle().player.fireCooldown / COMBAT.ADV_PACKET.cooldown;
  fireBtn.classList.toggle("cooling", fcd > 0);
  fireBtn.style.setProperty("--cd", Math.max(0, fcd).toFixed(3));
  dashBtn.style.setProperty("--cd", (dash.cooldown / QUEST_SKILLS.DASH.cooldown).toFixed(3));

  const { moved, landed } = stepMotor(motor, intent, dt, currentWorld(), speed);
  // 걸은 거리 (Q0) — 1 m 단위로 모아서 반영
  questWalk += moved;
  if (motor.grounded && dash.t <= 0) { stepDist += moved; if (stepDist > 1.7) { stepDist = 0; sfx("step"); } } // 발소리
  if (questWalk >= 1) { const m = Math.floor(questWalk); questWalk -= m; questProgress({ type: "walk", amount: m }); }
  // 클릭 이동 중 양 축이 모두 막히면 목표 도달 불가로 취소
  if (moveTarget && inputLen <= 0.05 && intent.speedScale > 0 && moved < 0.0001) clearMoveTarget();
  if (landed) {
    knightView.onLanded(motor.x, motor.y, motor.z);
    sfx("land");
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
    handleBattleEvents(stepBattle(activeBattle(), dt, {
      player: motor, stats: effectiveStats(progress), rng: battleRng, interference,
      invulnerable: dash.t > 0,
      shieldBlock: progress.quests.perks.aesShield ? QUEST_SKILLS.AES_SHIELD.blockChance : 0
    }));
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
  if (!hud.openModalTitle()) world.highlightSign(null);
  battleView.syncBattle(activeBattle(), camera, t, dt);
  dungeonView.syncDungeon(run, t);
  fx.updateFx(projectToScreen, dt);
  fx.setPlayerHp(battle.player.hp, battle.player.maxHp);
}

// ---------- 메인 루프 ----------
// ?test 모드: 실시간 루프는 시뮬레이션·렌더를 멈추고, 테스트가 __PK.tick()으로 고정 스텝을 진행 (FPS와 무관한 결정적 테스트)
const FIXED_DT = 1 / 60;
const clock = new THREE.Clock();

// 자동 품질 조절 (Stage 11.8): 그림자·고해상도가 버거운 기기는 2초마다 프레임 시간을 보고 한 단계씩 낮춘다
// 1단계: 픽셀 비율 1 + 그림자 512 → 2단계: 그림자 끔. (테스트 모드는 렌더하지 않으므로 제외)
const perf = { sum: 0, n: 0, level: 0 };
function adaptQuality(rawDt) {
  if (perf.level >= 2 || rawDt > 0.5) return;            // 탭 전환 등 큰 공백은 무시
  perf.sum += rawDt; perf.n++;
  if (perf.sum < 2) return;
  const avg = perf.sum / perf.n;
  perf.sum = 0; perf.n = 0;
  if (avg < 1 / 25) return;
  perf.level++;
  if (perf.level === 1) {
    renderer.setPixelRatio(1);
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.map?.dispose(); sun.shadow.map = null;
  } else {
    renderer.shadowMap.enabled = false;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }
}

function animate() {
  requestAnimationFrame(animate);
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  if (TEST_MODE) return;
  adaptQuality(raw);

  simulate(dt);
  const t = clock.elapsedTime;
  renderFrame(t, dt);
  world.animateWorld(t);
  if (!run) stepLife(dt, t, motor);
  knightView.animateEffects(t, dt);
  renderer.render(scene, camera);
}
knightView.syncKnight(motor, false, 0);
if (!TEST_MODE) setAttract(true);   // 타이틀 뒤에서 마을 위를 천천히 돈다
updateCamera(motor, 1);
animate();

// ---------- 타이틀 → 착지 (Stage 11.5) ----------
if (!TEST_MODE) {
  setInputEnabled(false);
  const q = questById(progress.quests.active);
  const save = loaded.status === "loaded"
    ? `⭐ Lv ${levelFromXp(progress.xp).level} · 🪙 ${progress.cr2032}${q ? ` · 📜 ${q.code} ${q.title}` : " · 📜 모든 퀘스트 완료"}`
    : null;
  // 첫 화면이 실제로 그려진 뒤 타이틀로 바꾼다
  requestAnimationFrame(() => requestAnimationFrame(() => splash.ready({
    save,
    onStart: () => {
      startLanding(1.8);
      setInputEnabled(true);
      sfx("portal");
      document.body.classList.add("revealing");
      setTimeout(() => document.body.classList.remove("prestart"), 900);   // 거의 내려앉았을 때 HUD가 차례로
      setTimeout(() => document.body.classList.remove("revealing"), 2200);
      if (!tutorialSeen()) setTimeout(showTutorial, 2300);   // 처음 온 사람: 설명서 → UI 투어 (Stage 11.13)
    }
  })));
}

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
  library: { open: openLibrary, isOpen: isLibraryOpen, answerKey: currentAnswerKey, lastChapterUrl },
  signs: () => world.signs.map((s) => s.userData.signText),
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
  prison: { open: prisonUi.openPrison, isOpen: prisonUi.isPrisonOpen, answer: prisonUi.currentAnswer },
  crypt: { open: cryptUi.openCrypt, isOpen: cryptUi.isCryptOpen, state: cryptUi.cryptState },
  dash: () => ({ ...dash }),
  zoom: () => orbit.distance,
  quality: () => perf.level,
  hopGuide: { open: showHopGuide, isOpen: isHopGuideOpen, example: hopGuideExample },
  tutorial: { open: showTutorial, state: tutorialState, next: tutorialNext },
  talk: { open: (id) => talkTo(VILLAGERS.find((v) => v.id === id)), close: closeTalk, state: talkState, more: talkMore },
  fireCd: () => getComputedStyle(fireBtn).getPropertyValue("--cd"),
  life: () => { stepLife(1 / 60, 0, motor); return lifeState(); },
  audio: { log: audio.soundLog, clear: audio.clearSoundLog, state: audio.audioState, names: audio.SFX_NAMES },
  chargeCfg: () => chargeCfg(progress),
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
      samples: job.beacon.samples.length, beacon: { x: job.beacon.x, z: job.beacon.z }, err: job.beacon.err, result: job.result,
      area: job.area, probes: job.probes.length + (job.probe ? 1 : 0), areaShown: huntArea.visible,
      revealShown: huntBeacon.visible
    },
    isHunting: jobPanel.isMeasuring,
    mark: () => jobPanel.isMeasuring() && window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyB", key: "b" }))
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
