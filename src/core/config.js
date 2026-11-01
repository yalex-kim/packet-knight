// 월드·물리 상수 — 순수 데이터 (THREE·DOM 의존 없음, Node에서 import 가능)

export const WORLD = Object.freeze({
  ISLAND_RADIUS: 26,
  VILLAGE_RADIUS: 16.5, // 마을 평지 반경
  SURFACE_Y: 2.0,       // 마을 평지 표면 높이
  DUNGEON_PIT_Y: -0.5,  // 지하 던전 바닥 표면 높이
  SEA_LEVEL: 0,
  PLAY_RADIUS: 24.5,    // 섬 외곽 이동 한계
  HEIGHT_STEP: 0.5,     // 높이 양자화 단위 (반 블록 계단)
  BEDROCK_Y: -4,
  DUNGEON_X: -9.0,      // 던전 입구 (북서쪽 외곽)
  DUNGEON_Z: -13.0
});

export const PHYSICS = Object.freeze({
  KNIGHT_RADIUS: 0.42,  // 장애물 충돌 반경
  FOOT_HALF: 0.3,       // 지형 칸 판정용 발바닥 반폭
  STEP_MAX: 0.55,       // 걸어서 오를 수 있는 최대 단차 (반 블록 OK, 한 블록은 점프)
  SPEED: 6.4,           // = PRD §8.4 HOP 기본값
  GRAVITY: -24.0,
  JUMP_FORCE: 8.5,      // 최고점 ≈ 1.5 (한 블록 + 분수대 턱)
  STEP_SMOOTH: 16,      // 계단 오르내림 보간 속도
  TURN_RATE: 15,
  ARRIVE_DIST: 0.25     // 클릭 이동 도착 판정 거리
});
