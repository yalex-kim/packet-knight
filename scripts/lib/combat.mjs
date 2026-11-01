// 전투 봇 — 게임과 같은 core/battle.js를 돌린다 (훈련장 · 던전 층)
import { MONSTERS, TRAINING_GROUND, DUNGEON } from "../../src/core/balance.js";
import { createBattle, syncPlayerHp, stepBattle, fireAdvPacket } from "../../src/core/battle.js";
import { createMotor, stepMotor } from "../../src/core/motor.js";
import { DUNGEON_ROOM, generateFloor, createFloorBattle, stepAcs } from "../../src/core/dungeon.js";
import { createLink, stepLink, applyAfh, interferenceFor } from "../../src/core/link.js";
import { VILLAGE } from "../../src/core/collision.js";
import { REACTION } from "./rssi.mjs";

export const COMBAT_DT = 1 / 30; // 전투 시뮬은 30 Hz (60 Hz와 결과 차이 없음을 확인 — PRD §8.7)

export const COMBAT_STRATEGIES = [
  { name: "제자리 (stand)", mode: "stand" },
  { name: "회피 (kite)", mode: "kite" },
  { name: "돌격 (rush)", mode: "rush" }
];

/** 한 스텝의 봇 조작: 가장 가까운 적을 보고, 전략에 따라 이동, 쿨다운마다 발사 */
function botStep(battle, pl, mode, dt, stats) {
  const world = battle.world ?? VILLAGE;
  battle.sinceHit = (battle.sinceHit ?? 0) + dt;
  const alive = battle.monsters.filter((m) => m.state !== "dead");
  const near = alive.sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z))[0];
  let intent = { dirX: 0, dirZ: 0, speedScale: 0 };
  if (near) {
    const dx = near.x - pl.x, dz = near.z - pl.z, d = Math.hypot(dx, dz) || 1;
    if (mode === "rush" && d > 1.2) intent = { dirX: dx / d, dirZ: dz / d, speedScale: 1 };
    if (mode !== "stand" && d > 9) intent = { dirX: dx / d, dirZ: dz / d, speedScale: 1 };
    // 사람처럼: 2.5초 넘게 한 대도 못 맞혔으면(장애물 뒤 등) 적에게 다가간다
    if (battle.sinceHit > 2.5 && d > 2) intent = { dirX: dx / d, dirZ: dz / d, speedScale: 1 };
    // 회피: 공격 예고를 보고 반응 지연 뒤 공격 범위 밖으로 물러난다
    const threat = alive.find((m) => m.state === "windup" && Math.hypot(m.x - pl.x, m.z - pl.z) < MONSTERS[m.type].attackRange + 0.7
      && m.t < MONSTERS[m.type].windup - REACTION);
    if (mode === "kite" && threat) {
      const tx = pl.x - threat.x, tz = pl.z - threat.z, td = Math.hypot(tx, tz) || 1;
      intent = { dirX: tx / td, dirZ: tz / td, speedScale: 1 };
    }
    pl.rotY = Math.atan2(dx, dz);
  }
  stepMotor(pl, intent, dt, world, stats.hop);
  if (near) fireAdvPacket(battle, pl, near);
}

/** 훈련장 60초 사냥 (Stage 6) */
export function trainingSession(mode, stats, rng, seconds = 60) {
  const battle = createBattle(TRAINING_GROUND.spawns);
  syncPlayerHp(battle, stats.hp);
  const pl = createMotor({ x: TRAINING_GROUND.x, y: 2, z: TRAINING_GROUND.z + 5 });
  pl.rotY = Math.PI;
  const r = { kills: 0, cr2032: 0, xp: 0, damage: 0, hits: 0, ko: 0, lowest: stats.hp, regenObserved: false };
  let wasHurt = false;
  for (let t = 0; t < seconds; t += COMBAT_DT) {
    botStep(battle, pl, mode, COMBAT_DT, stats);
    const before = battle.player.hp;
    for (const e of stepBattle(battle, COMBAT_DT, { player: pl, stats, rng })) {
      if (e.type === "hit") battle.sinceHit = 0;
      if (e.type === "kill") { r.kills++; r.xp += e.xp; r.cr2032 += e.drops.reduce((n, d) => n + (d.item === "cr2032" ? d.count : 0), 0); }
      if (e.type === "playerHit") { r.damage += e.amount; r.hits++; wasHurt = true; }
      if (e.type === "ko") { r.ko++; battle.player.hp = battle.player.maxHp; }
    }
    if (wasHurt && battle.player.hp > before) r.regenObserved = true;
    r.lowest = Math.min(r.lowest, battle.player.hp);
  }
  return r;
}

/**
 * 던전 한 층의 전투 — 게임과 같은 core/dungeon.js generateFloor·DUNGEON_WORLD (Stage 7 구현).
 * 방 중앙에서 시작, Wi-Fi 간섭 몬스터 FLOOR_MONSTERS마리가 사방 7 m에서 다가온다.
 * 모두 쓰러뜨리면 전투 클리어, HP 0이면 실패(Connection Timeout). 드롭은 처치 즉시 획득으로 본다.
 * 링크 퍼즐(채널맵)은 전투력과 무관하므로 경제 모델에서 시간(TIME.LINK_PUZZLE)으로만 반영한다.
 * (처음엔 마을 지형을 빌렸으나 나무 뒤에 몬스터가 걸리는 인공물로 "장비가 좋을수록 클리어율 하락"이 나왔다 — PRD §8.7)
 */
/** 대역을 본 뒤 채널맵 갱신을 요청하기까지 (초): AFH 스킬 버튼 한 번 vs HUD 칸을 손으로 하나씩 */
export const AFH_DELAY = Object.freeze({ button: 1.5, manual: 6 });

/**
 * @param {{ afh?: false|"button"|"manual" }} opts 스캔한 몬스터 대역을 채널맵에서 빼는가, 어떻게 (Stage 8)
 */
export function dungeonFloor(mode, stats, rng, floor = 1, { afh = mode === "rush" ? false : "button" } = {}) {
  const layout = generateFloor(floor, Math.floor(rng() * 2 ** 31));
  const battle = createFloorBattle(layout);
  syncPlayerHp(battle, stats.hp);
  const pl = createMotor({ x: DUNGEON_ROOM.cx, y: DUNGEON_ROOM.floorY, z: DUNGEON_ROOM.cz });
  const link = createLink(layout.hopIncrement);
  const interference = interferenceFor(link);
  let afhAt = Infinity; // 다음 "간섭 채널 빼기" 누를 시각
  const r = { cleared: false, ko: false, time: 0, kills: 0, cr2032: 0, xp: 0, hpLeft: 0, packetLost: 0, outOfBand: 0, damage: 0 };
  for (let t = 0; t < DUNGEON.TIME_LIMIT; t += COMBAT_DT) {
    stepLink(link, COMBAT_DT);
    if (t >= afhAt) { applyAfh(link, battle); afhAt = Infinity; }
    for (const e of stepAcs(battle, floor, COMBAT_DT, rng)) if (afh && e.monster.revealed) afhAt = Math.min(afhAt, t + AFH_DELAY[afh]);
    botStep(battle, pl, mode, COMBAT_DT, stats);
    for (const e of stepBattle(battle, COMBAT_DT, { player: pl, stats, rng, interference })) {
      if (e.type === "hit") {
        battle.sinceHit = 0;
        if (!e.monster.revealed) { e.monster.revealed = true; if (afh) afhAt = Math.min(afhAt, t + AFH_DELAY[afh]); }
      }
      if (e.type === "packetLost") {
        r.packetLost++;
        battle.sinceHit = 0; // 쏘고는 있다 (다가갈 필요 없음)
        if (!e.monster.revealed) { e.monster.revealed = true; if (afh) afhAt = Math.min(afhAt, t + AFH_DELAY[afh]); }
      }
      if (e.type === "outOfBand") r.outOfBand++;
      if (e.type === "playerHit") r.damage += e.amount;
      if (e.type === "kill") { r.kills++; r.xp += e.xp; r.cr2032 += e.drops.reduce((k, d) => k + (d.item === "cr2032" ? d.count : 0), 0); }
      if (e.type === "ko") { r.ko = true; r.time = t; return r; }
    }
    if (r.kills === battle.monsters.length) { r.cleared = true; r.time = t; r.hpLeft = battle.player.hp; return r; }
  }
  r.time = DUNGEON.TIME_LIMIT;
  return r;
}
