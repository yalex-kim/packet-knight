// 기사 이동 물리 — 슬라이딩 이동, 단차 오르내림, 낙하, 점프 (순수 로직)
// 렌더(THREE)와 분리되어 있어 봇 시뮬레이터가 Node에서 그대로 재사용할 수 있다.

import { PHYSICS } from "./config.js";
import { VILLAGE } from "./collision.js";

/**
 * @typedef {{ x: number, y: number, z: number, rotY: number, vy: number, grounded: boolean }} MotorState
 * @typedef {{ dirX: number, dirZ: number, speedScale: number }} MoveIntent  — dir은 단위 벡터, speedScale 0~1
 * @typedef {{ moved: number, landed: boolean }} StepResult
 */

/** 최단 각도로 회전 보간 (±π 경계에서 반대로 한 바퀴 도는 문제 방지) */
export function turnTowards(current, target, t) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * t;
}

/** @param {{x:number,y:number,z:number}} pos @returns {MotorState} */
export function createMotor(pos) {
  return { x: pos.x, y: pos.y, z: pos.z, rotY: 0, vy: 0, grounded: true };
}

/** @param {MotorState} m */
export function resetMotor(m, pos) {
  Object.assign(m, createMotor(pos));
}

/** @param {MotorState} m */
export function jump(m) {
  if (!m.grounded) return false;
  m.vy = PHYSICS.JUMP_FORCE;
  m.grounded = false;
  return true;
}

/** 축 분리 슬라이딩 이동. 실제 이동량을 반환 */
function slideMove(m, stepX, stepZ, { isBlocked }) {
  // 이미 장애물 안에 끼어 있으면(스폰·텔레포트 등) 빠져나올 수 있도록 판정을 건너뛴다
  const stuck = isBlocked(m.x, m.z, m.y);
  const x0 = m.x, z0 = m.z;
  if (stuck || !isBlocked(x0 + stepX, z0, m.y)) m.x += stepX;
  if (stuck || !isBlocked(m.x, z0 + stepZ, m.y)) m.z += stepZ;
  return Math.hypot(m.x - x0, m.z - z0);
}

/**
 * 한 스텝 진행
 * @param {MotorState} m @param {MoveIntent} intent @param {number} dt
 * @param {import("./collision.js").CollisionWorld} [world] 기본값은 마을
 * @returns {StepResult}
 */
export function stepMotor(m, intent, dt, world = VILLAGE) {
  const { SPEED, STEP_MAX, GRAVITY, STEP_SMOOTH, TURN_RATE } = PHYSICS;
  let moved = 0;
  let landed = false;

  if (intent.speedScale > 0) {
    const step = SPEED * dt * intent.speedScale;
    moved = slideMove(m, intent.dirX * step, intent.dirZ * step, world);
    if (Math.hypot(intent.dirX, intent.dirZ) > 0.0001) {
      m.rotY = turnTowards(m.rotY, Math.atan2(intent.dirX, intent.dirZ), Math.min(1, dt * TURN_RATE));
    }
  }

  // ----- 수직: 단차 오르내림 · 낙하 · 점프 -----
  const supportY = world.supportHeightAt(m.x, m.z, m.y);

  if (m.grounded) {
    const diff = supportY - m.y;
    if (diff < -STEP_MAX) {
      // 한 계단보다 큰 낙차 → 걸어 나가면 떨어진다
      m.grounded = false;
      m.vy = 0;
    } else if (Math.abs(diff) > 0.001) {
      m.y += diff * Math.min(1, dt * STEP_SMOOTH);
      if (Math.abs(supportY - m.y) < 0.01) m.y = supportY;
    }
  }

  if (!m.grounded) {
    m.vy += GRAVITY * dt;
    m.y += m.vy * dt;
    if (m.vy <= 0 && m.y <= supportY) {
      m.y = supportY;
      m.vy = 0;
      m.grounded = true;
      landed = true;
    }
  }

  return { moved, landed };
}

/**
 * 클릭 이동 목표를 향한 이동 의도 계산
 * @returns {MoveIntent & { arrived: boolean }}
 */
export function seekIntent(m, target, dt) {
  const dx = target.x - m.x, dz = target.z - m.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= PHYSICS.ARRIVE_DIST) return { dirX: 0, dirZ: 0, speedScale: 0, arrived: true };
  // 목표 지점을 넘어가지 않게 마지막 스텝은 감속
  return { dirX: dx / dist, dirZ: dz / dist, speedScale: Math.min(1, dist / (PHYSICS.SPEED * dt)), arrived: false };
}
