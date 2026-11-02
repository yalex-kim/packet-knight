// 아레나 충돌 세계 — 장애물 없는 원형 방 (던전 층 템플릿, 시뮬레이션용). 순수 로직
// core/collision.js의 CollisionWorld와 같은 모양이라 motor·battle에 그대로 넘길 수 있다.

/**
 * @param {{ cx?: number, cz?: number, radius: number, floorY?: number }} opts
 * @returns {import("./collision.js").CollisionWorld & { cx: number, cz: number, radius: number, floorY: number }}
 */
export function createArena({ cx = 0, cz = 0, radius, floorY = 0 }) {
  return Object.freeze({
    cx, cz, radius, floorY,
    isBlocked: (x, z) => Math.hypot(x - cx, z - cz) > radius,
    supportHeightAt: () => floorY
  });
}
