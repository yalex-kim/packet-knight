// 높이 인식 충돌 판정 — 지형 칸 + 박스/원형 장애물 (순수 로직)
// 규칙: 목표 지점의 바닥/장애물 윗면이 "발 높이 + STEP_MAX"보다 높으면 벽, 아니면 올라선다.

import { WORLD, PHYSICS } from "./config.js";
import { groundHeightAt } from "./terrain.js";
import { OBSTACLE_BOXES, OBSTACLE_CIRCLES } from "./layout.js";

const { KNIGHT_RADIUS, FOOT_HALF, STEP_MAX } = PHYSICS;

function boxOverlaps(b, x, z, pad) {
  return x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
}
function circleOverlaps(c, x, z, pad) {
  const d = c.r + pad;
  return (x - c.x) ** 2 + (z - c.z) ** 2 < d * d;
}

/** 발바닥 4모서리가 걸치는 지형 칸 높이 목록 */
function footprintHeights(x, z) {
  return [
    groundHeightAt(x - FOOT_HALF, z - FOOT_HALF), groundHeightAt(x + FOOT_HALF, z - FOOT_HALF),
    groundHeightAt(x - FOOT_HALF, z + FOOT_HALF), groundHeightAt(x + FOOT_HALF, z + FOOT_HALF)
  ];
}

/** 발 높이 feetY인 기사가 (x, z)에 있을 수 없으면 true */
export function isBlocked(x, z, feetY) {
  if (Math.hypot(x, z) > WORLD.PLAY_RADIUS) return true;
  const climb = feetY + STEP_MAX;
  for (const h of footprintHeights(x, z)) if (h > climb) return true;
  for (const b of OBSTACLE_BOXES) if (b.top > climb && boxOverlaps(b, x, z, KNIGHT_RADIUS)) return true;
  for (const c of OBSTACLE_CIRCLES) if (c.top > climb && circleOverlaps(c, x, z, KNIGHT_RADIUS)) return true;
  return false;
}

/** (x, z)에서 발 높이 feetY 기준으로 딛고 설 수 있는 가장 높은 면 */
export function supportHeightAt(x, z, feetY) {
  const climb = feetY + STEP_MAX;
  let best = -Infinity;
  for (const h of footprintHeights(x, z)) if (h <= climb && h > best) best = h;
  // 장애물 윗면은 중심점이 그 위에 있을 때만 받쳐준다 (가장자리에서 떨어질 수 있게)
  for (const b of OBSTACLE_BOXES) if (b.top <= climb && b.top > best && boxOverlaps(b, x, z, 0)) best = b.top;
  for (const c of OBSTACLE_CIRCLES) if (c.top <= climb && c.top > best && circleOverlaps(c, x, z, 0)) best = c.top;
  return best;
}
