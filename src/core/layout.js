// 마을 배치 데이터 — 랜드마크 위치·상호작용 문구·충돌 형상 (순수 데이터, THREE·DOM 의존 없음)
// 문구의 스펙 수치는 PRD §2.3 원칙에 따라 connectivityBook 본문과 대조한다.

import { WORLD } from "./config.js";
import { groundHeightAt } from "./terrain.js";
import { chapterUrl } from "./book.js";

const S = WORLD.SURFACE_Y;
const CHAPTER = (file) => chapterUrl(file);

/**
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {{ title: string, sub: string, desc: string, lore: string, link: string, walkPos: Vec3, action?: { id: string, label: string } }} LandmarkInfo
 * @typedef {{ id: string, pos: Vec3, info: LandmarkInfo }} Landmark
 */

/** @type {Landmark[]} */
export const LANDMARKS = [
  {
    id: "hall",
    pos: { x: 0, y: S, z: -8.5 },
    info: {
      title: "🏛️ GATT 중앙 회관",
      sub: "[데이터 프로필 허브]",
      desc: "스펙트럼 대륙의 모든 서비스(Service)와 특성(Characteristic)이 등록되는 행정 중앙 회관입니다. 시민 NPC들에게 데이터를 읽기(Read), 쓰기(Write), 알림(Notify) 받는 퀘스트를 수주합니다.",
      lore: "GATT는 BLE 연결 후 데이터를 계층(Profile > Service > Characteristic > Descriptor)으로 주고받는 표준 규격입니다.",
      link: CHAPTER("gatt.html"),
      walkPos: { x: 0, y: S, z: -6.2 }
    }
  },
  {
    id: "library",
    pos: { x: -9.0, y: S, z: -1.0 },
    info: {
      title: "📚 RF 이론 도서관",
      sub: "[connectivityBook 연동 연구소]",
      desc: "2.4GHz 무선통신의 모든 원리가 기록된 지식의 성소입니다. 챕터 퀴즈를 풀면 스탯(TX 파워, 수신 감도)이 오르고 새로운 스킬 슬롯이 해금됩니다.",
      lore: "무선 통신 교과서 connectivityBook의 Bluetooth 챕터 원문 지식이 인터랙티브하게 보관되어 있습니다.",
      link: CHAPTER("intro.html"),
      action: { id: "library", label: "📖 강의실 입장" },
      walkPos: { x: -6.6, y: S, z: -1.0 }
    }
  },
  {
    id: "forge",
    pos: { x: 9.0, y: S, z: -1.0 },
    info: {
      title: "🔨 패킷 대장간",
      sub: "[장비 강화 & 배터리 상점]",
      desc: "안테나 사거리를 늘리고, 크리스털 정밀도를 맞추며, 던전 탐험에 필수적인 코인 배터리 CR2032를 장착하고 교체하는 하드웨어 정비소입니다.",
      lore: "저전력 BLE 기기의 수명과 성능을 좌우하는 CR2032 전원 설계 및 RF 매칭 회로를 은유합니다.",
      link: CHAPTER("power.html"),
      action: { id: "rflab", label: "🔧 RF 랩 입장" },
      walkPos: { x: 6.6, y: S, z: -1.0 }
    }
  },
  {
    id: "tower",
    pos: { x: 8.0, y: S, z: 8.0 },
    info: {
      title: "📡 전파의 등대 (안테나 타워)",
      sub: "[비콘 채널 37 송출탑]",
      desc: "2.402GHz 주파수로 주기적인 Advertising 패킷 신호를 사방으로 뿜어내는 마을의 랜드마크입니다. 신호를 수신해 RSSI 거리를 측정하는 알바 미니게임을 진행할 수 있습니다.",
      lore: "블루투스 기기가 자신을 발견(Discovery)시키기 위해 브로드캐스트하는 3개 고정 채널(37, 38, 39) 중 첫 번째 채널입니다.",
      link: CHAPTER("advertising.html"),
      action: { id: "job", label: "📡 알바 시작 (60초)" },
      walkPos: { x: 6.4, y: S, z: 6.4 }
    }
  },
  {
    id: "fountain",
    pos: { x: 0, y: S, z: 0 },
    info: {
      title: "⛲ GATT 중앙 분수대",
      sub: "[마을 중앙 만남의 광장]",
      desc: "스펙트럼 대륙의 모든 패킷 기사들이 모여 정보를 나누고 휴식을 취하는 중앙 광장의 분수대입니다. 중앙 룬에서 은은한 2.4GHz 전파의 파동이 샘솟습니다.",
      lore: "BLE 연결에서 여러 Peripheral과 연결을 맺고 연결 이벤트 타이밍을 주도하는 Central 역할처럼, 모든 경로가 모이고 갈라지는 중심점입니다.",
      link: CHAPTER("connection.html"),
      walkPos: { x: 0, y: S, z: 3.0 }
    }
  },
  {
    id: "dungeonGate",
    pos: { x: WORLD.DUNGEON_X, y: WORLD.DUNGEON_PIT_Y, z: WORLD.DUNGEON_Z },
    info: {
      title: "⚔️ 37채널 호핑 던전 지하 입구",
      sub: "[지하 던전 포털 · Lv.1 권장]",
      desc: "스펙트럼 대륙 지하 37개 데이터 채널로 이어지는 관문입니다. 패킷 기사는 연결 이벤트마다 바뀌는 호핑 패턴을 밟아가며 Wi-Fi 간섭 몬스터를 격퇴해야 합니다.",
      lore: "BLE 연결은 연결 이벤트(연결 간격 375µs~4s, Core 6.2+)마다 채널 선택 알고리즘(CSA #1/#2)으로 37개 데이터 채널(2404~2478MHz) 중 다음 채널로 건너뜁니다. 간섭이 심한 채널은 채널맵에서 빼는 적응형 호핑(AFH)입니다. (초당 1600회 호핑은 BR/EDR Classic의 이야기!)",
      link: CHAPTER("hopping.html"),
      action: { id: "dungeon", label: "⚔️ 던전 입장" },
      walkPos: { x: WORLD.DUNGEON_X, y: S, z: -7.6 }
    }
  }
];

// 훈련장 표지판 (Stage 6) — 위치는 balance.js TRAINING_GROUND 북쪽 가장자리
LANDMARKS.push({
  id: "trainingSign",
  pos: { x: -9.0, y: S, z: 4.6 },
  info: {
    title: "⚔️ 패킷 훈련장",
    sub: "[ADV 패킷 사격 연습 · Lv.1]",
    desc: "광고만 외치는 훈련용 비콘 봇들이 돌아다니는 연습장입니다. F 키·발사 버튼·몬스터 클릭으로 ADV 패킷을 쏘세요. 봇의 LED가 빨갛게 변하면 공격 예고 — 뒤로 물러나면 피할 수 있습니다. 쓰러뜨리면 경험치와 가끔 CR2032를 떨어뜨립니다.",
    lore: "LE에서 처음 만나는 두 기기는 대칭이 아닙니다. 한쪽은 외치고(광고), 한쪽은 듣습니다(스캔). 광고만 하고 연결을 받지 않는 기기를 GAP 브로드캐스터라 부릅니다.",
    link: CHAPTER("advertising.html"),
    walkPos: { x: -9.0, y: S, z: 3.6 }
  }
});

export const landmark = (id) => LANDMARKS.find((l) => l.id === id);

// 스폰은 분수대 충돌 반경(1.85 + 0.42) 바깥이어야 한다 (smoke: "스폰 지점이 충돌 영역 밖이다")
export const SPAWN_POS = Object.freeze({ x: 0, y: S, z: 3.0 });

/** [x, z, scale] */
export const TREE_POSITIONS = [
  [-13, -7, 1.1], [-12, 5, 0.9], [12, -7, 1.0], [13, 4, 1.1],
  [-5, -12, 1.0], [5, -11, 0.95], [-4, 12, 1.1], [4, 12, 1.0],
  [-11, -1, 0.85], [11, -1, 0.85], [-6, 6, 1.0], [6, 6, 0.9],
  [-14, 0, 1.2], [14, 0, 1.1]
];

/** [x, z] */
export const LAMP_POSITIONS = [
  [-1.8, 2.5], [1.8, 2.5], [-1.8, -2.5], [1.8, -2.5],
  [-1.8, -7.0], [1.8, -7.0], [-6.0, -1.8], [6.0, -1.8]
];

// 충돌 형상 — top: 윗면 절대 높이. 발 높이 + STEP_MAX 보다 낮으면 올라설 수 있다.
export const OBSTACLE_BOXES = [
  { id: "hall",        minX: -2.0,  maxX: 2.0,   minZ: -10.2, maxZ: -7.0, top: S + 3.4 },
  { id: "library",     minX: -10.6, maxX: -7.4,  minZ: -2.4,  maxZ: 0.4,  top: S + 3.2 },
  { id: "forge",       minX: 7.4,   maxX: 10.6,  minZ: -2.4,  maxZ: 0.4,  top: S + 2.8 },
  { id: "tower",       minX: 7.1,   maxX: 8.9,   minZ: 7.1,   maxZ: 8.9,  top: S + 8.0 },
  // 던전 관문 — 던전 구현(Stage 7) 전까지는 통과 불가
  { id: "dungeonGate", minX: -10.6, maxX: -7.4,  minZ: -13.5, maxZ: -12.5, top: WORLD.DUNGEON_PIT_Y + 3.3 }
];

export const FOUNTAIN_RIM_HEIGHT = 0.7; // 걸어서는 못 오르고(STEP_MAX 0.55) 점프로 올라설 수 있다

export const OBSTACLE_CIRCLES = [
  { id: "fountainRim",    x: 0, z: 0, r: 1.85, top: S + FOUNTAIN_RIM_HEIGHT },
  { id: "fountainPillar", x: 0, z: 0, r: 0.45, top: S + 1.7 },
  ...TREE_POSITIONS.map(([x, z, s]) => ({ id: "tree", x, z, r: 0.45, top: groundHeightAt(x, z) + 1.8 * s })),
  ...LAMP_POSITIONS.map(([x, z]) => ({ id: "lamp", x, z, r: 0.12, top: groundHeightAt(x, z) + 2.0 })),
  { id: "trainingSign", x: -9.0, z: 4.6, r: 0.25, top: S + 1.8 }
];
