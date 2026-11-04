// 마을의 생기 (Stage 11.9) — 걷는 주민 NPC, 등대의 BLE 광고 패킷 연출 (THREE 의존, 장식용)
// 주민 데이터·경로는 core/layout.js VILLAGERS. 게임 로직·충돌에는 관여하지 않는다.

import * as THREE from "three";
import { VILLAGERS, TOWER_POS } from "../core/layout.js";
import { groundHeightAt } from "../core/terrain.js";
import { makeSign } from "./world.js";
import { pickLine } from "../core/villagerLines.js";

export const lifeRoot = new THREE.Group();

const skin = new THREE.MeshLambertMaterial({ color: 0xf1c7a1 });
const pants = new THREE.MeshLambertMaterial({ color: 0x3d4a5c });
const shoe = new THREE.MeshLambertMaterial({ color: 0x3a2c24 });
function box(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

/** 주민 한 명 — 기사보다 조금 작고 둥글둥글하게 */
function makeVillager(v) {
  const root = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: v.shirt });
  const hair = new THREE.MeshLambertMaterial({ color: v.hair });
  const legL = pivot(root, -0.09, 0.34, 0), legR = pivot(root, 0.09, 0.34, 0);
  for (const l of [legL, legR]) { box(l, 0.15, 0.26, 0.17, pants, 0, -0.13, 0); box(l, 0.16, 0.08, 0.2, shoe, 0, -0.3, 0.02); }
  const torso = box(root, 0.4, 0.4, 0.26, shirt, 0, 0.54, 0);
  const head = pivot(root, 0, 0.74, 0);
  box(head, 0.34, 0.32, 0.32, skin, 0, 0.16, 0);
  box(head, 0.36, 0.1, 0.34, hair, 0, 0.34, -0.01);
  box(head, 0.36, 0.2, 0.08, hair, 0, 0.22, -0.15);
  box(head, 0.05, 0.05, 0.02, new THREE.MeshBasicMaterial({ color: 0x1d2733 }), -0.08, 0.17, 0.165);
  box(head, 0.05, 0.05, 0.02, new THREE.MeshBasicMaterial({ color: 0x1d2733 }), 0.08, 0.17, 0.165);
  const armL = pivot(root, -0.26, 0.72, 0), armR = pivot(root, 0.26, 0.72, 0);
  for (const a of [armL, armR]) { box(a, 0.11, 0.3, 0.13, shirt, 0, -0.15, 0); box(a, 0.1, 0.07, 0.11, skin, 0, -0.33, 0); }
  const label = makeSign(v.name, 0.95);
  label.scale.multiplyScalar(0.62);
  label.position.y = 1.32;
  root.add(label);
  return { root, legL, legR, armL, armR, head, torso, speech: null, lastLine: null };
}

const villagers = VILLAGERS.map((v, i) => {
  const parts = makeVillager(v);
  const [a, b] = v.route;
  const t0 = (i * 0.37) % 1;
  parts.root.position.set(a[0] + (b[0] - a[0]) * t0, groundHeightAt(a[0], a[1]), a[1] + (b[1] - a[1]) * t0);
  lifeRoot.add(parts.root);
  return { v, ...parts, t: t0, dir: i % 2 ? -1 : 1, pause: 0, phase: i, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
});

const WALK_SPEED = 1.1;   // m/s — 기사(6.4)보다 느긋하게
function stepVillagers(dt, time) {
  for (const n of villagers) {
    const [a, b] = n.v.route;
    let moving = false;
    if (n.held) { n.pause = Math.max(n.pause, 0.5); }
    else if (n.pause > 0) n.pause -= dt;
    else {
      n.t += (n.dir * WALK_SPEED * dt) / n.len;
      if (n.t >= 1 || n.t <= 0) {                       // 끝에 닿으면 잠깐 쉬었다가 돌아선다
        n.t = Math.min(1, Math.max(0, n.t));
        n.dir *= -1;
        n.pause = 1.5 + ((n.phase * 0.73) % 1) * 2.5;
      }
      moving = n.pause <= 0;
    }
    const x = a[0] + (b[0] - a[0]) * n.t, z = a[1] + (b[1] - a[1]) * n.t;
    n.root.position.set(x, groundHeightAt(x, z), z);
    const face = Math.atan2((b[0] - a[0]) * n.dir, (b[1] - a[1]) * n.dir);
    const turn = ((face - n.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;   // 가까운 쪽으로 −π~π
    if (!n.held) n.root.rotation.y += Math.max(-dt * 6, Math.min(dt * 6, turn));
    const sw = moving ? Math.sin(time * 9 + n.phase) : 0;
    n.legL.rotation.x = sw * 0.6; n.legR.rotation.x = -sw * 0.6;
    n.armL.rotation.x = -sw * 0.5; n.armR.rotation.x = sw * 0.5;
    n.torso.position.y = 0.54 + (moving ? Math.abs(sw) * 0.03 : Math.sin(time * 2 + n.phase) * 0.01);
    n.head.rotation.y = moving ? 0 : Math.sin(time * 0.8 + n.phase) * 0.35;
  }
}

// ---------- 등대의 BLE 광고 패킷 (채널 37·38·39 = 세 색) ----------
const TOP = new THREE.Vector3(TOWER_POS.x, groundHeightAt(TOWER_POS.x, TOWER_POS.z) + 7.7, TOWER_POS.z);
const CH_COLORS = [0x39d0ff, 0x7dffb5, 0xffd76b];
const packetGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const packets = Array.from({ length: 18 }, () => {
  const m = new THREE.Mesh(packetGeo, new THREE.MeshBasicMaterial({ color: 0x39d0ff, transparent: true, opacity: 0 }));
  m.visible = false;
  lifeRoot.add(m);
  return { m, t: 0, life: 0, from: new THREE.Vector3(), to: new THREE.Vector3() };
});
const pulse = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 40), new THREE.MeshBasicMaterial({ color: 0x7de3ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
pulse.rotation.x = -Math.PI / 2;
pulse.position.copy(TOP);
lifeRoot.add(pulse);
let advTimer = 0, pulseT = 1, nextPacket = 0;

function stepPackets(dt) {
  advTimer -= dt;
  if (advTimer <= 0) {                     // 광고 이벤트: 고리 하나 + 세 채널로 패킷 셋
    advTimer = 1.6;
    pulseT = 0;
    for (let ch = 0; ch < 3; ch++) {
      const p = packets[nextPacket];
      nextPacket = (nextPacket + 1) % packets.length;
      const ang = Math.random() * Math.PI * 2, r = 6 + Math.random() * 12;
      p.from.copy(TOP);
      p.to.set(TOWER_POS.x - 6 + Math.cos(ang) * r, groundHeightAt(0, 0) + 0.6, TOWER_POS.z - 6 + Math.sin(ang) * r);
      p.t = -ch * 0.12;                    // 채널마다 살짝 늦게 (37 → 38 → 39)
      p.life = 1.9;
      p.m.material.color.setHex(CH_COLORS[ch]);
      p.m.visible = true;
    }
  }
  if (pulseT < 1) {
    pulseT = Math.min(1, pulseT + dt / 1.1);
    pulse.scale.setScalar(1 + pulseT * 7);
    pulse.material.opacity = 0.7 * (1 - pulseT);
  }
  for (const p of packets) {
    if (!p.m.visible) continue;
    p.t += dt;
    if (p.t < 0) { p.m.material.opacity = 0; continue; }
    const k = Math.min(1, p.t / p.life);
    p.m.position.lerpVectors(p.from, p.to, k);
    p.m.position.y += Math.sin(k * Math.PI) * 3;          // 포물선
    p.m.rotation.set(p.t * 4, p.t * 3, 0);
    p.m.material.opacity = k < 0.85 ? 0.95 : 0.95 * (1 - (k - 0.85) / 0.15);
    if (k >= 1) p.m.visible = false;
  }
}

/** 말풍선 스프라이트를 이 대사로 새로 만든다 (긴 대사는 두 줄로 접지 않고 한 줄 — 머리 위라 짧게 보인다) */
/** 말풍선 스프라이트 (Stage 12.7): 흰 둥근 풍선 + 아래 꼬리, 진한 글씨, 최대 3줄로 줄바꿈 */
function makeBubble(text) {
  const font = "600 34px 'Pretendard Variable', Pretendard, system-ui, 'Noto Sans KR', sans-serif";
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.font = font;
  const maxW = 520;
  // 낱말 단위 줄바꿈 (한국어는 공백 기준), 너무 길면 3줄째에서 …
  const words = text.split(" "), lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].replace(/.{0,2}$/, "…"); }
  const padX = 26, padY = 20, lh = 44, tail = 22;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + padX * 2;
  const h = lines.length * lh + padY * 2;
  c.width = w + 8; c.height = h + tail + 8;
  ctx.font = font;
  ctx.fillStyle = "rgba(20, 40, 70, .25)";                         // 그림자
  ctx.beginPath(); ctx.roundRect(6, 8, w, h, 22); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#1d2733"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(2, 2, w, h, 22); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w / 2 - 16, h); ctx.lineTo(w / 2, h + tail); ctx.lineTo(w / 2 + 16, h); ctx.closePath(); ctx.fill();   // 꼬리
  ctx.beginPath(); ctx.moveTo(w / 2 - 16, h + 1); ctx.lineTo(w / 2, h + tail); ctx.lineTo(w / 2 + 16, h + 1); ctx.stroke();
  ctx.fillStyle = "#ffffff"; ctx.fillRect(w / 2 - 15, h - 3, 30, 6);  // 꼬리와 풍선 이음새 지우기
  ctx.fillStyle = "#1d2733"; ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, 2 + padX, 2 + padY + lh * i + lh / 2));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // 화면 크기 고정(거리와 상관없이 읽힌다): sizeAttenuation false — 크기는 화면 높이에 대한 비율
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  const worldH = 0.00052 * c.height * (innerHeight < innerWidth ? 1 : 0.8);
  sprite.scale.set(worldH * c.width / c.height, worldH, 1);
  sprite.center.set(0.5, 0);                                         // 꼬리 끝이 머리 위에 오게
  sprite.renderOrder = 12;
  sprite.raycast = () => {};
  sprite.userData.baseScale = sprite.scale.clone();
  sprite.userData.born = performance.now();
  return sprite;
}
function say(n, line) {
  if (n.speech) { n.root.remove(n.speech); n.speech.material.map.dispose(); n.speech.material.dispose(); }
  n.speech = makeBubble(line.text);
  n.speech.position.y = 1.5;
  n.root.add(n.speech);
  n.lastLine = line.text;
}
/** 말풍선 등장 애니메이션 (톡 튀어나온다) */
function popBubbles() {
  for (const n of villagers) {
    const s = n.speech;
    if (!s?.visible) continue;
    const k = Math.min(1, (performance.now() - s.userData.born) / 220);
    const e = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.12 : 1;
    s.scale.copy(s.userData.baseScale).multiplyScalar(Math.max(0.05, k) * e);
  }
}
// 말풍선: 기사 8 m 안의 주민 하나가 6~10초마다 4초 동안 (대사는 villagerLines.js에서 무작위)
let speechTimer = 3, speaking = null, speechLeft = 0;
function stepSpeech(dt, knight) {
  if (speaking) {
    speechLeft -= dt;
    if (speechLeft <= 0) { speaking.speech.visible = false; speaking = null; }
    return;
  }
  speechTimer -= dt;
  if (speechTimer > 0 || !knight) return;
  speechTimer = 6 + Math.random() * 4;
  const near = villagers.filter((n) => Math.hypot(n.root.position.x - knight.x, n.root.position.z - knight.z) < 8);
  if (!near.length) return;
  speaking = near[Math.floor(Math.random() * near.length)];
  say(speaking, pickLine(speaking.v.topics, Math.random, speaking.lastLine));
  speechLeft = 5.5;   // 말풍선은 문장 전체라 조금 더 오래
}

/** 테스트·스크린샷 훅: 이 주민이 지금 한마디 */
export function sayNow(id) {
  const n = villagers.find((v) => v.v.id === id);
  if (!n) return null;
  if (speaking && speaking !== n) speaking.speech.visible = false;
  speaking = n; say(n, pickLine(n.v.topics, Math.random, n.lastLine)); speechLeft = 5.5;
  return n.lastLine;
}

/** 이 주민이 정해진 말을 한다 (💡 이야기 알림 등, Stage 13.14) */
export function sayText(id, text) {
  const n = villagers.find((v) => v.v.id === id);
  if (!n) return;
  if (speaking && speaking !== n) speaking.speech.visible = false;
  speaking = n; say(n, { text }); speechLeft = 5.5;
}

// ---------- 💡 이야기가 있는 주민 표시 (Stage 13.14) ----------
const tipMark = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d", { willReadFrequently: true });
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, "rgba(255, 236, 150, .95)"); g.addColorStop(0.55, "rgba(255, 214, 90, .55)"); g.addColorStop(1, "rgba(255, 214, 90, 0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.font = "72px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText("💡", 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(0.7, 0.7, 1);
  s.renderOrder = 11;
  s.visible = false;
  s.raycast = () => {};
  return s;
})();
let tipOwner = null;
/** 💡를 이 주민 머리 위에 (null이면 지운다) */
export function setTipVillager(id) {
  tipOwner?.root.remove(tipMark);
  tipOwner = id ? villagers.find((v) => v.v.id === id) ?? null : null;
  tipMark.visible = Boolean(tipOwner);
  if (tipOwner) tipOwner.root.add(tipMark);
}
export const tipVillager = () => tipOwner?.v.id ?? null;

/** 클릭 대상 — 주민 루트 그룹들 (userData.villager = VILLAGERS 항목) */
export const villagerTargets = villagers.map((n) => { n.root.userData.villager = n.v; return n.root; });
/** 클릭한 주민: 걸음을 멈추고 기사를 바라본다 (대사창이 닫힐 때까지) */
export function holdVillager(id, knight) {
  for (const n of villagers) {
    n.held = n.v.id === id;
    if (n.held && knight) n.root.rotation.y = Math.atan2(knight.x - n.root.position.x, knight.z - n.root.position.z);
  }
}

/** @param {{ x: number, z: number }} [knight] 기사 위치 (말풍선 거리 판정) */
export function stepLife(dt, time, knight) {
  if (tipMark.visible) { tipMark.position.y = 1.75 + Math.sin(time * 3) * 0.08; tipMark.material.rotation = Math.sin(time * 2) * 0.12; }
  stepVillagers(dt, time);
  stepPackets(dt);
  stepSpeech(dt, knight);
  popBubbles();
}
/** 주민 충돌 원 (Stage 11.17) — 기사는 이 원 밖으로 밀려난다 */
export const VILLAGER_RADIUS = 0.3;
export const villagerCircles = () => villagers.map((n) => ({ x: n.root.position.x, z: n.root.position.z, r: VILLAGER_RADIUS }));
/** 테스트 훅: 주민 수·움직였는지 */
export const lifeState = () => ({ villagers: villagers.length, positions: villagers.map((n) => [n.root.position.x, n.root.position.z]), packets: packets.filter((p) => p.m.visible).length });
