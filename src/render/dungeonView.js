// 호핑 던전 렌더링 — 지하 원형 방, 채널 기둥 37개(채널맵 상태 표시), 링크 콘솔, 다음 층 포털 (THREE 의존)

import * as THREE from "three";
import { DUNGEON_ROOM } from "../core/dungeon.js";
import { DATA_CHANNELS } from "../core/hopping.js";
import { monsterBand } from "../core/link.js";

const { cx, cz, radius, floorY } = DUNGEON_ROOM;
// Stage 11.21: 바닥·벽·고리를 밝게 — 몬스터가 바닥에 묻히지 않게
export const dungeonRoot = new THREE.Group();
dungeonRoot.visible = false;

// ---------- 방 ----------
const roomMat = { floor: new THREE.MeshLambertMaterial({ color: 0x3a4660 }), ring: new THREE.MeshBasicMaterial({ color: 0x4f7fb8, side: THREE.DoubleSide }), wall: new THREE.MeshLambertMaterial({ color: 0x2a2440, side: THREE.BackSide }) };
/** 층 테마 (Stage 12.1) — 공유기 지하실(파랑) · 부엌 아래(주황) · 도청 회랑(초록) */
const THEMES = {
  router:  { floor: 0x3a4660, ring: 0x4f7fb8, wall: 0x2a2440 },
  kitchen: { floor: 0x5a4636, ring: 0xd98a4a, wall: 0x3a2618 },
  spy:     { floor: 0x2f4a40, ring: 0x4fd89a, wall: 0x16302a }
};
export function setTheme(theme) {
  const t = THEMES[theme] ?? THEMES.router;
  roomMat.floor.color.setHex(t.floor); roomMat.ring.color.setHex(t.ring); roomMat.wall.color.setHex(t.wall);
}
{
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.6, radius + 0.6, 0.6, 48), roomMat.floor);
  floor.position.set(cx, floorY - 0.3, cz);
  dungeonRoot.add(floor);
  // 바닥의 동심원 무늬 (전파 은유)
  for (const r of [3, 6, 9]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.05, r + 0.05, 64), roomMat.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, floorY + 0.01, cz);
    dungeonRoot.add(ring);
  }
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(radius + 1.4, radius + 1.4, 5, 48, 1, true),
    roomMat.wall
  );
  wall.position.set(cx, floorY + 2.5, cz);
  dungeonRoot.add(wall);
}

// ---------- 채널 기둥 37개 (벽을 따라 0→36, 2404~2478 MHz) ----------
const pillarGeo = new THREE.BoxGeometry(0.32, 1, 0.32);
const pillars = [];
for (let c = 0; c < DATA_CHANNELS; c++) {
  const a = (c / DATA_CHANNELS) * Math.PI * 2 - Math.PI / 2;
  const mat = new THREE.MeshBasicMaterial({ color: 0x2b6cff });
  const p = new THREE.Mesh(pillarGeo, mat);
  p.position.set(cx + Math.cos(a) * (radius + 0.9), floorY + 0.5, cz + Math.sin(a) * (radius + 0.9));
  dungeonRoot.add(p);
  pillars.push(p);
}

// ---------- 링크 콘솔 (방 북쪽) & 다음 층 포털 (방 남쪽) ----------
export const CONSOLE_POS = Object.freeze({ x: cx, z: cz - 8.2 });
export const PORTAL_POS = Object.freeze({ x: cx, z: cz + 8.2 });

export const consoleMesh = new THREE.Group();
{
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.7), new THREE.MeshLambertMaterial({ color: 0x3a4658 }));
  base.position.y = 0.5;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.06), new THREE.MeshBasicMaterial({ color: 0x39d0ff }));
  screen.position.set(0, 1.25, 0.1);
  screen.rotation.x = -0.35;
  consoleMesh.add(base, screen);
  consoleMesh.userData.screen = screen;
  consoleMesh.position.set(CONSOLE_POS.x, floorY, CONSOLE_POS.z);
  consoleMesh.userData.dungeonTarget = "console";
  dungeonRoot.add(consoleMesh);
}

export const portalMesh = new THREE.Group();
{
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.18, 10, 32), new THREE.MeshLambertMaterial({ color: 0x2b2f36 }));
  frame.position.y = 1.4;
  const film = new THREE.Mesh(new THREE.CircleGeometry(1.05, 32), new THREE.MeshBasicMaterial({ color: 0x3a2c55, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  film.position.y = 1.4;
  portalMesh.add(frame, film);
  portalMesh.userData.film = film;
  portalMesh.position.set(PORTAL_POS.x, floorY, PORTAL_POS.z);
  portalMesh.userData.dungeonTarget = "portal";
  dungeonRoot.add(portalMesh);
}

// ---------- 🎁 보물 상자 (Stage 13.21) — 특성 층 구석 ----------
export const chestMesh = new THREE.Group();
{
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a2e }), gold = new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x3a2a00 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), wood); base.position.y = 0.25;
  const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.3);
  const lidBox = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.22, 0.62), wood); lidBox.position.set(0, 0.11, 0.3); lid.add(lidBox);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.08, 0.64), gold); band.position.y = 0.3;
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), gold); lock.position.set(0, 0.42, 0.32);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.02, 24), new THREE.MeshBasicMaterial({ color: 0xffd76b, transparent: true, opacity: 0.35 }));
  glow.position.y = 0.01;
  chestMesh.add(base, lid, band, lock, glow);
  chestMesh.userData = { lid, glow };
  chestMesh.visible = false;
  dungeonRoot.add(chestMesh);
}

/** 클릭 대상 (콘솔·포털) */
export const dungeonTargets = [consoleMesh, portalMesh];

/**
 * 매 프레임 동기화
 * @param {{ phase: string, puzzle: any } | null} run 진행 중인 층 (없으면 숨김)
 */
export function syncDungeon(run, t) {
  dungeonRoot.visible = Boolean(run);
  if (!run) return;
  const ch = run.layout.chest;
  chestMesh.visible = Boolean(ch);
  if (ch) {
    chestMesh.position.set(ch.x, floorY, ch.z);
    chestMesh.rotation.y = Math.atan2(cx - ch.x, cz - ch.z);   // 방 가운데를 본다
    const open = Boolean(run.chestOpened);
    chestMesh.userData.lid.rotation.x = open ? -1.9 : -Math.abs(Math.sin(t * 2)) * 0.08;
    chestMesh.userData.glow.material.opacity = open ? 0 : 0.25 + 0.2 * Math.sin(t * 3);
  }
  // 전투 중: 기둥 = 기사 링크 (지금 채널·뺀 채널·드러난 Wi-Fi 대역) — Stage 8
  if (run.phase === "combat" && run.link) {
    const band = new Set();
    for (const m of run.battle.monsters) if (m.state !== "dead" && m.revealed) for (const c of monsterBand(m)) band.add(c);
    for (let c = 0; c < DATA_CHANNELS; c++) {
      const p = pillars[c];
      const now = run.link.channel === c;
      const used = run.link.map[c];
      let color = used ? 0x2b6cff : 0x1a1f2a;
      if (band.has(c)) color = used ? 0xff3b30 : 0x5a1a16;
      if (now) color = band.has(c) ? 0xffb36b : 0x7dffb5;
      p.material.color.setHex(color);
      p.scale.y = now ? 2.4 : used ? 1.4 : 0.6;
      p.position.y = floorY + p.scale.y / 2;
    }
  } else {
  const puzzle = run.puzzle;
  const recent = puzzle?.log.at(-1);
  for (let c = 0; c < DATA_CHANNELS; c++) {
    const p = pillars[c];
    const s = puzzle?.stats[c];
    const used = puzzle ? puzzle.map[c] : true;
    const lossy = s && s.tx > 0 && s.lost / s.tx > 0.5;
    let color = used ? 0x2b6cff : 0x1a1f2a;
    if (lossy) color = used ? 0xff3b30 : 0x5a1a16;
    const active = recent && recent.channel === c && puzzle.sinceEvent < 0.1;
    if (active) color = recent.lost ? 0xffb36b : 0x7dffb5;
    p.material.color.setHex(color);
    p.scale.y = active ? 2.2 : used ? 1.4 : 0.6;
    p.position.y = floorY + p.scale.y / 2;
  }
  }
  const open = run.phase === "open";
  const film = portalMesh.userData.film;
  film.material.color.setHex(open ? 0x9d4bff : 0x3a2c55);
  film.material.opacity = open ? 0.75 + 0.15 * Math.sin(t * 4) : 0.35;
  consoleMesh.userData.screen.material.color.setHex(run.phase === "combat" ? 0x3a4658 : run.phase === "link" ? 0x39d0ff : 0x7dffb5);
}
