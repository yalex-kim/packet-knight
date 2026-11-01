// 전투 월드 — 몬스터 AI, ADV 패킷 투사체, 드롭, 플레이어 HP·회복 (PRD §3.2, §4.3, §8.4)
// 순수 로직 (THREE·DOM 의존 없음). 렌더는 render/battleView.js, 봇 시뮬레이터는 scripts/simulate.mjs
//
// stepBattle()이 돌려주는 이벤트 목록으로 화면·세이브가 반응한다:
//   fire · hit{monster, amount, crit, firstScan} · kill{monster, drops, xp} · wall
//   windup{monster} · playerHit{amount, crit} · dodge · pickup{item, count} · ko · respawn{monster}

import { PHYSICS } from "./config.js";
import { COMBAT, MONSTERS } from "./balance.js";
import { computeDamage, rollDodge } from "./combat.js";
import { createMotor, stepMotor } from "./motor.js";
import { VILLAGE } from "./collision.js";

/**
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {ReturnType<typeof createMotor> & {
 *   id: number, type: string, hp: number, state: "idle"|"chase"|"windup"|"cooldown"|"return"|"dead",
 *   t: number, home: { x: number, z: number }, wander: { x: number, z: number } | null, hitFlash: number
 * }} Monster
 * @typedef {{ id: number, x: number, y: number, z: number, dx: number, dz: number, traveled: number }} Projectile
 * @typedef {{ id: number, item: string, count: number, x: number, y: number, z: number, age: number }} Drop
 */

let nextId = 1;

/** @param {import("./collision.js").CollisionWorld} [world] 전투가 벌어지는 맵 (기본값 마을) */
export function createBattle(spawns, type = "trainingBot", world = VILLAGE, { hpScale = 1, atkScale = 1 } = {}) {
  const monsters = spawns.map(([x, z]) => spawnMonster(type, x, z, world));
  for (const m of monsters) { m.maxHp = Math.round(MONSTERS[type].hp * hpScale); m.hp = m.maxHp; m.atk = Math.round(MONSTERS[type].atk * atkScale); }
  return {
    world,
    monsters,
    projectiles: [],
    drops: [],
    player: { hp: null, maxHp: null, sinceHit: Infinity, fireCooldown: 0 },
    /** 이미 스캔(첫 명중)한 몬스터 종류 — 도감 등록 연출용 */
    scanned: new Set()
  };
}

function spawnMonster(type, x, z, world) {
  const m = createMotor({ x, y: world.supportHeightAt(x, z, 99), z });
  return Object.assign(m, {
    id: nextId++, type, hp: MONSTERS[type].hp, maxHp: MONSTERS[type].hp, state: "idle", t: 1,
    home: { x, z }, wander: null, hitFlash: 0
  });
}

/** 플레이어 HP 초기화/최대치 갱신 (스탯이 바뀌면 호출) */
export function syncPlayerHp(battle, maxHp) {
  const p = battle.player;
  if (p.maxHp === null) p.hp = maxHp;
  else if (maxHp > p.maxHp) p.hp += maxHp - p.maxHp; // 최대치가 오르면 그만큼 채운다
  p.maxHp = maxHp;
  p.hp = Math.min(p.hp, p.maxHp);
}

const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const alive = (m) => m.state !== "dead";

/**
 * 조준 보조: 바라보는 방향 ±aimCone 안의 가장 가까운 몬스터, 없으면 사거리 안의 가장 가까운 몬스터.
 * (사방에서 다가오는 던전 방에서 발사 버튼이 엉뚱한 벽을 쏘지 않도록 — Stage 7)
 * @param {{x:number,z:number,rotY:number}} shooter
 */
export function autoAimTarget(battle, shooter) {
  const { range, aimConeDeg } = COMBAT.ADV_PACKET;
  const cone = (aimConeDeg * Math.PI) / 180;
  let inCone = null, inConeD = Infinity, nearest = null, nearestD = Infinity;
  for (const m of battle.monsters) {
    if (!alive(m)) continue;
    const d = dist2D(m, shooter);
    if (d > range) continue;
    if (d < nearestD) { nearest = m; nearestD = d; }
    const ang = Math.atan2(m.x - shooter.x, m.z - shooter.z);
    const diff = Math.abs(Math.atan2(Math.sin(ang - shooter.rotY), Math.cos(ang - shooter.rotY)));
    if (diff <= cone && d < inConeD) { inCone = m; inConeD = d; }
  }
  return inCone ?? nearest;
}

/**
 * ADV 패킷 발사. target이 있으면 그쪽으로, 없으면 조준 보조 → 바라보는 방향.
 * 발사 방향으로 shooter.rotY를 돌린다.
 * @returns {Projectile|null} 쿨다운 중이면 null
 */
export function fireAdvPacket(battle, shooter, target = null) {
  const p = battle.player;
  if (p.fireCooldown > 0 || p.hp <= 0) return null;
  const aim = target && alive(target) ? target : autoAimTarget(battle, shooter);
  const ang = aim ? Math.atan2(aim.x - shooter.x, aim.z - shooter.z) : shooter.rotY;
  shooter.rotY = ang;
  const dx = Math.sin(ang), dz = Math.cos(ang);
  const proj = { id: nextId++, x: shooter.x + dx * 0.5, y: shooter.y + 0.55, z: shooter.z + dz * 0.5, dx, dz, traveled: 0 };
  battle.projectiles.push(proj);
  p.fireCooldown = COMBAT.ADV_PACKET.cooldown;
  return proj;
}

function damageMonster(battle, m, ctx, events) {
  const def = MONSTERS[m.type];
  const { amount, crit } = computeDamage(ctx.stats.tx, COMBAT.SKILL_COEF.advPacket, def.sec, ctx.rng);
  m.hp -= amount;
  m.hitFlash = 0.12;
  const firstScan = !battle.scanned.has(m.type);
  battle.scanned.add(m.type);
  events.push({ type: "hit", monster: m, amount, crit, firstScan });
  if (m.state === "idle" || m.state === "return") { m.state = "chase"; m.t = 0; }

  if (m.hp <= 0) {
    m.hp = 0;
    m.state = "dead";
    m.t = def.respawn;
    const drops = [];
    for (const d of def.drops) {
      if (ctx.rng() < d.chance) {
        const drop = { id: nextId++, item: d.item, count: d.count, x: m.x, y: m.y + 0.3, z: m.z, age: 0 };
        battle.drops.push(drop);
        drops.push(drop);
      }
    }
    events.push({ type: "kill", monster: m, drops, xp: def.xp });
  }
}

function stepProjectiles(battle, dt, ctx, events) {
  const { speed, range, hitRadius } = COMBAT.ADV_PACKET;
  battle.projectiles = battle.projectiles.filter((pr) => {
    const step = speed * dt;
    // 빠른 투사체가 몬스터를 뚫고 지나가지 않도록 잘게 나눠 검사
    const sub = Math.max(1, Math.ceil(step / 0.3));
    for (let i = 0; i < sub; i++) {
      pr.x += (pr.dx * step) / sub;
      pr.z += (pr.dz * step) / sub;
      pr.traveled += step / sub;
      for (const m of battle.monsters) {
        if (alive(m) && dist2D(pr, m) < hitRadius && Math.abs(pr.y - (m.y + 0.4)) < 1.0) {
          damageMonster(battle, m, ctx, events);
          return false;
        }
      }
      if (battle.world.isBlocked(pr.x, pr.z, pr.y - 0.3)) { events.push({ type: "wall", x: pr.x, y: pr.y, z: pr.z }); return false; }
      if (pr.traveled >= range) return false;
    }
    return true;
  });
}

function moveMonster(world, m, toX, toZ, speedScale, dt) {
  const dx = toX - m.x, dz = toZ - m.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return stepMotor(m, { dirX: 0, dirZ: 0, speedScale: 0 }, dt, world);
  return stepMotor(m, { dirX: dx / d, dirZ: dz / d, speedScale }, dt, world);
}

function stepMonster(battle, m, dt, ctx, events) {
  const def = MONSTERS[m.type];
  const player = ctx.player;
  const p = battle.player;
  m.hitFlash = Math.max(0, m.hitFlash - dt);
  const speedScale = def.speed / PHYSICS.SPEED;
  const d = dist2D(m, player);
  const playerNearHome = dist2D(player, m.home) < def.leash + def.aggro;

  switch (m.state) {
    case "dead":
      m.t -= dt;
      if (m.t <= 0) {
        const fresh = spawnMonster(m.type, m.home.x + (ctx.rng() - 0.5) * 2, m.home.z + (ctx.rng() - 0.5) * 2, battle.world);
        Object.assign(m, fresh, { id: m.id, home: m.home, maxHp: m.maxHp, hp: m.maxHp, atk: m.atk });
        events.push({ type: "respawn", monster: m });
      }
      return;

    case "idle":
      if (d < def.aggro && playerNearHome && p.hp > 0) { m.state = "chase"; break; }
      // 집 주변 배회
      m.t -= dt;
      if (m.t <= 0 || !m.wander) {
        const a = ctx.rng() * Math.PI * 2, r = ctx.rng() * def.leash * 0.8;
        m.wander = { x: m.home.x + Math.cos(a) * r, z: m.home.z + Math.sin(a) * r };
        m.t = 2 + ctx.rng() * 2;
      }
      moveMonster(battle.world, m, m.wander.x, m.wander.z, speedScale * 0.35, dt);
      return;

    case "return":
      moveMonster(battle.world, m, m.home.x, m.home.z, speedScale, dt);
      if (dist2D(m, m.home) < 0.6) { m.state = "idle"; m.t = 1; }
      return;

    case "chase":
      if (!playerNearHome || p.hp <= 0 || dist2D(m, m.home) > def.leash + 3) { m.state = "return"; return; }
      if (d <= def.attackRange) {
        m.state = "windup";
        m.t = def.windup;
        m.rotY = Math.atan2(player.x - m.x, player.z - m.z);
        events.push({ type: "windup", monster: m });
        return;
      }
      moveMonster(battle.world, m, player.x, player.z, speedScale, dt);
      return;

    case "windup":
      // 예고 동작 — 이 시간 안에 사거리 밖으로 빠지면 피할 수 있다
      m.t -= dt;
      stepMotor(m, { dirX: 0, dirZ: 0, speedScale: 0 }, dt, battle.world);
      if (m.t <= 0) {
        if (d <= def.attackRange + 0.4 && p.hp > 0) {
          if (!def.aoe && rollDodge(ctx.stats.rx, ctx.rng)) { // 광역 공격은 회피 불가 (PRD §8.4)
            events.push({ type: "dodge", monster: m });
          } else {
            const { amount, crit } = computeDamage(m.atk ?? def.atk, 1, ctx.stats.sec, ctx.rng);
            p.hp = Math.max(0, p.hp - amount);
            p.sinceHit = 0;
            events.push({ type: "playerHit", monster: m, amount, crit });
            if (p.hp <= 0) events.push({ type: "ko", monster: m });
          }
        }
        m.state = "cooldown";
        m.t = def.cooldown;
      }
      return;

    case "cooldown":
      m.t -= dt;
      // 공격 뒤 살짝 물러난다
      if (d < 1.2) moveMonster(battle.world, m, m.x + (m.x - player.x), m.z + (m.z - player.z), speedScale * 0.4, dt);
      else stepMotor(m, { dirX: 0, dirZ: 0, speedScale: 0 }, dt, battle.world);
      if (m.t <= 0) m.state = "chase";
      return;
  }
}

function stepDrops(battle, dt, ctx, events) {
  const { PICKUP_RADIUS, MAGNET_RADIUS } = COMBAT;
  const player = ctx.player;
  battle.drops = battle.drops.filter((dr) => {
    dr.age += dt;
    const d = dist2D(dr, player);
    if (dr.age > 0.3 && d < PICKUP_RADIUS) {
      events.push({ type: "pickup", item: dr.item, count: dr.count, drop: dr });
      return false;
    }
    if (dr.age > 0.6 && d < MAGNET_RADIUS) {
      // 자석: 가까이 가면 기사 쪽으로 끌려온다
      const k = Math.min(1, (6 * dt) / Math.max(d, 0.001));
      dr.x += (player.x - dr.x) * k;
      dr.z += (player.z - dr.z) * k;
      dr.y += (player.y + 0.3 - dr.y) * k;
    }
    return dr.age < 60;
  });
}

/**
 * 한 스텝 진행
 * @param {{ player: {x:number,y:number,z:number}, stats: Record<string, number>, rng: () => number }} ctx
 * @returns {Array<object>} 이벤트 목록
 */
export function stepBattle(battle, dt, ctx) {
  const events = [];
  const p = battle.player;
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.sinceHit += dt;
  if (p.hp > 0 && p.sinceHit >= COMBAT.REGEN_DELAY && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * COMBAT.REGEN_RATE * dt);
  }

  stepProjectiles(battle, dt, ctx, events);
  for (const m of battle.monsters) stepMonster(battle, m, dt, ctx, events);

  // 몬스터끼리, 몬스터와 기사가 겹치지 않게 몬스터를 밀어낸다
  for (const m of battle.monsters) {
    if (!alive(m)) continue;
    for (const o of [ctx.player, ...battle.monsters]) {
      if (o === m || (o.state && !alive(o))) continue;
      const dx = m.x - o.x, dz = m.z - o.z, d = Math.hypot(dx, dz), min = 0.85;
      if (d > 0.0001 && d < min && !battle.world.isBlocked(m.x + (dx / d) * (min - d), m.z + (dz / d) * (min - d), m.y)) {
        m.x += (dx / d) * (min - d);
        m.z += (dz / d) * (min - d);
      }
    }
  }

  stepDrops(battle, dt, ctx, events);
  return events;
}

/** KO 후 재연결: HP 가득, 몬스터는 집으로 */
export function revivePlayer(battle) {
  const p = battle.player;
  p.hp = p.maxHp;
  p.sinceHit = Infinity;
  battle.projectiles = [];
  for (const m of battle.monsters) if (m.state !== "dead") { m.state = "return"; }
}
