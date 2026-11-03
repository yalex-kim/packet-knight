// 칸 단위 높이맵 — 시각(렌더)과 물리(충돌)가 공유하는 단일 진실 공급원
// 칸 (i, j)는 월드 [i, i+1] × [j, j+1] 영역을 덮는다. 높이는 칸 중심에서 샘플링해
// HEIGHT_STEP 단위로 양자화한다 → 렌더링된 블록 윗면과 캐릭터가 밟는 높이가 항상 일치한다.

import { WORLD } from "./config.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function isDungeonCell(x, z) {
  return Math.abs(x - WORLD.DUNGEON_X) <= 2.2 && z >= WORLD.DUNGEON_Z - 1.5 && z <= WORLD.DUNGEON_Z + 5.0;
}

/** 연속 높이 설계 함수 (생성 전용 — 물리는 groundHeightAt을 쓴다) */
export function rawHeight(x, z) {
  const { SURFACE_Y, DUNGEON_PIT_Y } = WORLD;
  if (isDungeonCell(x, z)) {
    const t = clamp((WORLD.DUNGEON_Z + 5.0 - z) / 5.5, 0, 1);
    return SURFACE_Y - t * (SURFACE_Y - DUNGEON_PIT_Y);
  }
  // 섬 전체가 마을과 같은 높이의 평지다 (Stage 11.2: 바깥 고리가 반 블록씩 내려가던 계단 해안을 없앴다 — 사용자 요청)
  return SURFACE_Y;
}

const cellKey = (i, j) => i * 1000 + j;

/** @type {Map<number, number>} */
const heightMap = new Map();
for (let i = -WORLD.ISLAND_RADIUS; i < WORLD.ISLAND_RADIUS; i++) {
  for (let j = -WORLD.ISLAND_RADIUS; j < WORLD.ISLAND_RADIUS; j++) {
    const cx = i + 0.5, cz = j + 0.5;
    if (Math.hypot(cx, cz) > WORLD.ISLAND_RADIUS) continue;
    heightMap.set(cellKey(i, j), Math.round(rawHeight(cx, cz) / WORLD.HEIGHT_STEP) * WORLD.HEIGHT_STEP);
  }
}

export function cellHeight(i, j) {
  const h = heightMap.get(cellKey(i, j));
  return h === undefined ? -Infinity : h;
}

/** 임의의 (x, z) 위치에서 실제 밟는 지표면(Top Face) 높이 Y. 섬 밖은 -Infinity */
export function groundHeightAt(x, z) {
  return cellHeight(Math.floor(x), Math.floor(z));
}

/** 모든 섬 칸을 순회: cb(i, j, top) */
export function forEachCell(cb) {
  for (const [key, top] of heightMap) {
    const i = Math.round(key / 1000);
    cb(i, key - i * 1000, top);
  }
}

/** 지표 종류 (렌더 재질 선택용) */
export function surfaceTypeAt(x, z) {
  if (isDungeonCell(x, z)) return "darkStone";
  const r = Math.hypot(x, z);
  if (r > WORLD.ISLAND_RADIUS - 2) return "sand";   // 떠 있는 섬의 가장자리 모래 테두리 (Stage 11.7: 바다가 없어져 넓은 모래 띠 → 잔디)
  if (r <= 3.2) return "plaza";
  const { DUNGEON_X, DUNGEON_Z } = WORLD;
  const isNorthAve = Math.abs(x) <= 1 && z >= -9 && z <= 0;
  const isSouthAve = Math.abs(x) <= 1 && z >= 0 && z <= 8;
  const isEastWestAve = (z >= -2 && z <= 0) && (x >= -10 && x <= 10);
  // 던전 길: 동서 대로 → 회관 서쪽 골목 → 회관 뒤 → 계단 (Stage 12.2)
  const isDungeonRoad = (x >= -3.6 && x <= -2.4 && z <= -2 && z >= -11.6)
    || (z >= -11.6 && z <= -10.5 && x >= -3.6 && x <= DUNGEON_X + 1.2)
    || (Math.abs(x - DUNGEON_X) <= 1.2 && z <= -10.5 && z >= DUNGEON_Z + 5);
  // 등대 길: 남쪽 대로 → 등대 앞 (Stage 11.4 등대를 남동쪽 바깥으로 옮김 — 지하묘지 옆을 비켜 간다)
  const isBeaconRoad = (z >= 4 && z <= 12.2) && Math.abs(x - (1 + 9 * ((z - 4) / 8.2))) <= 1.2;
  if (isNorthAve || isSouthAve || isEastWestAve || isDungeonRoad || isBeaconRoad) return "path";
  return "grass";
}
