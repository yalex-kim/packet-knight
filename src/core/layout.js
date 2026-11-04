// 마을 배치 데이터 — 랜드마크 위치·상호작용 문구·충돌 형상 (순수 데이터, THREE·DOM 의존 없음)
// 문구의 스펙 수치는 PRD §2.3 원칙에 따라 connectivityBook 본문과 대조한다.

import { WORLD } from "./config.js";
import { groundHeightAt } from "./terrain.js";
import { chapterUrl } from "./book.js";

const S = WORLD.SURFACE_Y;
const CHAPTER = (file) => chapterUrl(file);

/**
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {{ sign?: string, title: string, sub: string, desc: string, lore: string, link: string, walkPos: Vec3, action?: { id: string, label: string } }} LandmarkInfo
 * @typedef {{ id: string, pos: Vec3, info: LandmarkInfo }} Landmark
 */

/** @type {Landmark[]} */
/** 등대·지하묘지 위치 (Stage 11.4: 두 자리를 맞바꾸고 등대를 더 바깥으로 — 등대 둘레가 비콘 찾기 측정 구역) */
export const TOWER_POS = Object.freeze({ x: 11.5, z: 13.5 });
export const CRYPT_POS = Object.freeze({ x: 8.0, z: 8.0 });

export const LANDMARKS = [
  {
    id: "hall",
    pos: { x: 0, y: S, z: -8.5 },
    info: {
      sign: "🏛️ GATT 중앙 회관",  // 건물 위 이름 표지판 (render/world.js)
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
      sign: "📚 도서관",  // 건물 위 이름 표지판 (render/world.js)
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
      sign: "🔨 패킷 대장간 · RF 랩",  // 건물 위 이름 표지판 (render/world.js)
      title: "🔨 패킷 대장간",
      sub: "[RF 랩 · 장비 강화 & 레벨업 스탯 분배]",
      desc: "대장간 안의 RF 랩에서 CR2032를 재료로 안테나·크리스털 같은 RF 부품을 강화하고, 레벨업으로 받은 스탯 포인트를 분배합니다. 분수대 동쪽, 구리 지붕에 굴뚝이 있는 건물입니다.",
      lore: "저전력 BLE 기기의 수명과 성능을 좌우하는 CR2032 전원 설계 및 RF 매칭 회로를 은유합니다.",
      link: CHAPTER("power.html"),
      action: { id: "rflab", label: "🔧 RF 랩 입장 (장비 강화·스탯 분배)" },
      walkPos: { x: 8.6, y: S, z: 3.4 }   // 정면(남쪽) 앞 — 광장 가로등을 비켜 걸어올 수 있게
    }
  },
  {
    id: "tower",
    pos: { x: TOWER_POS.x, y: S, z: TOWER_POS.z },
    info: {
      sign: "📡 전파의 등대 · 알바",  // 건물 위 이름 표지판 (render/world.js)
      title: "📡 전파의 등대 (안테나 타워)",
      sub: "[비콘 채널 37 송출탑]",
      desc: "2.402GHz 주파수로 주기적인 Advertising 패킷 신호를 사방으로 뿜어내는 마을의 랜드마크입니다. 등대지기에게서 측정기를 받아, 등대 둘레 측정 구역(바닥의 노란 원) 안에 숨겨진 비콘을 RSSI로 찾아내는 60초 알바를 할 수 있습니다.",
      lore: "블루투스 기기가 자신을 발견(Discovery)시키기 위해 브로드캐스트하는 3개 고정 채널(37, 38, 39) 중 첫 번째 채널입니다.",
      link: CHAPTER("advertising.html"),
      action: { id: "job", label: "📡 비콘 찾기 알바 (60초 · 🪙 최대 8개)" },
      extra: { id: "jobRank", label: "🍎 알바 랭킹" },   // 사과나무 랭킹의 📡 비콘 알바 판 (Stage 13.8)
      walkPos: { x: TOWER_POS.x - 1.7, y: S, z: TOWER_POS.z - 1.7 }
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
      sign: "⚔️ 호핑 던전",  // 건물 위 이름 표지판 (render/world.js)
      title: "⚔️ 37채널 호핑 던전 지하 입구",
      sub: "[지하 던전 포털 · Lv.1 권장]",
      desc: "스펙트럼 대륙 지하 37개 데이터 채널로 이어지는 관문입니다. 패킷 기사는 연결 이벤트마다 바뀌는 호핑 패턴을 밟아가며 Wi-Fi 간섭 몬스터를 격퇴해야 합니다.",
      lore: "BLE 연결은 연결 이벤트(연결 간격 375µs~4s, Core 6.2+)마다 채널 선택 알고리즘(CSA #1/#2)으로 37개 데이터 채널(2404~2478MHz) 중 다음 채널로 건너뜁니다. 간섭이 심한 채널은 채널맵에서 빼는 적응형 호핑(AFH)입니다. (초당 1600회 호핑은 BR/EDR Classic의 이야기!)",
      link: CHAPTER("hopping.html"),
      action: { id: "dungeon", label: "⚔️ 던전 입장" },
      walkPos: { x: WORLD.DUNGEON_X, y: S, z: WORLD.DUNGEON_Z + 5.4 }
    }
  }
];

// 훈련장 표지판 (Stage 6) — 위치는 balance.js TRAINING_GROUND 북쪽 가장자리
LANDMARKS.push({
  id: "trainingSign",
  pos: { x: -9.0, y: S, z: 4.6 },
  info: {
    sign: "⚔️ 패킷 훈련장",   // 건물 위 이름 표지판 (사용자 요청)
    title: "⚔️ 패킷 훈련장",
    sub: "[ADV 패킷 사격 연습 · Lv.1]",
    desc: "광고만 외치는 훈련용 비콘 봇들이 돌아다니는 연습장입니다. F 키·발사 버튼·몬스터 클릭으로 ADV 패킷을 쏘세요. 봇의 LED가 빨갛게 변하면 공격 예고 — 뒤로 물러나면 피할 수 있습니다. 쓰러뜨리면 경험치와 가끔 CR2032를 떨어뜨립니다.",
    lore: "LE에서 처음 만나는 두 기기는 대칭이 아닙니다. 한쪽은 외치고(광고), 한쪽은 듣습니다(스캔). 광고만 하고 연결을 받지 않는 기기를 GAP 브로드캐스터라 부릅니다.",
    link: CHAPTER("advertising.html"),
    walkPos: { x: -9.0, y: S, z: 3.6 }
  }
});

// Stage 10: 보안의 감옥(북동) · 전력 잃은 지하묘지(남동) — PRD §2.1·§6 Q7·Q8
LANDMARKS.push({
  id: "prison",
  pos: { x: 10.0, y: S, z: -12.0 },
  info: {
      sign: "🔒 보안의 감옥",  // 건물 위 이름 표지판 (render/world.js)
    title: "🔒 보안의 감옥",
    sub: "[페어링 시험장 · Q7]",
    desc: "몰래 엿듣는 도청자와 쪽지를 바꿔치기하는 중간자가 갇힌 감옥입니다. 간수의 페어링 시험을 통과하세요: 두 기기의 입출력 능력으로 페어링 방식을 판정하고, 숫자 비교 화면이 다르면 '아니요'로 중간자를 잡아내야 합니다.",
    lore: "LE Secure Connections는 P-256 ECDH로 도청을 막고, 숫자 비교·패스키로 중간자를 막습니다. 입출력이 없는 기기는 Just Works — 미인증입니다. ([Vol 3] Part H §2.3.5.1 Table 2.8)",
    link: CHAPTER("security.html"),
    action: { id: "prison", label: "🔐 페어링 시험" },
    walkPos: { x: 10.0, y: S, z: -9.6 }
  }
});
LANDMARKS.push({
  id: "crypt",
  pos: { x: CRYPT_POS.x, y: S, z: CRYPT_POS.z },
  info: {
    sign: "🪫 지하묘지",
    title: "🪫 전력 잃은 지하묘지",
    sub: "[CR2032 배터리 계약소 · Q8]",
    desc: "배터리가 다해 잠든 센서들의 무덤입니다. 묘지기의 계약을 받아 센서 세 개의 연결 간격·페리페럴 지연·수면 시계를 골라, 요구 반응 시간 안에서 CR2032 하나로 약속한 햇수를 버티게 하세요.",
    lore: "평균 전류 ≈ 수면 전류 + 이벤트 전하 ÷ 간격, 수명 ≈ 용량 ÷ 평균 전류. 간격이 길수록 창 넓히기((ppm÷10⁶)×시간 + 16 µs)가 커집니다.",
    link: CHAPTER("power.html"),
    action: { id: "crypt", label: "🔋 배터리 계약" },
    walkPos: { x: CRYPT_POS.x, y: S, z: CRYPT_POS.z + 2.2 }   // 정면(남쪽) 앞
  }
});

export const landmark = (id) => LANDMARKS.find((l) => l.id === id);

// 스폰은 분수대 충돌 반경(1.85 + 0.42) 바깥이어야 한다 (smoke: "스폰 지점이 충돌 영역 밖이다")
export const SPAWN_POS = Object.freeze({ x: 0, y: S, z: 3.0 });

/** [x, z, scale] */
/**
 * 마을 주민 (Stage 11.9 · 11.14) — 장식용 NPC. 두 점 사이를 오가며 가끔 멈춘다 (충돌 없음, 경로는 장애물을 피해 골랐다).
 * 대사는 core/villagerLines.js에서 관심 장(topics) 위주로 무작위. face: 대사창 초상화 (Gemini로 생성, src/assets/faces)
 */
export const VILLAGERS = Object.freeze([
  { id: "merchant",  name: "GATT 상인",     role: "회관 앞 데이터 상인",   route: [[-3.2, -5.6], [3.2, -5.6]],   shirt: 0x4f7bd9, hair: 0x3b2a1e, face: "merchant",  topics: ["gatt", "connection"] },
  { id: "librarian", name: "사서",          role: "RF 이론 도서관 사서",   route: [[-6.75, -4.2], [-6.75, 2.6]], shirt: 0x7a5cc9, hair: 0xd9d2c5, face: "librarian", topics: ["intro", "design", "radio"] },
  { id: "smith",     name: "대장장이",      role: "패킷 대장간 RF 장인",   route: [[6.75, -4.0], [6.75, 2.4]],   shirt: 0x9c5a2e, hair: 0x2a1d14, face: "smith",     topics: ["radio", "phy", "power"] },
  { id: "keeper",    name: "등대지기",      role: "전파의 등대 지킴이",    route: [[8.8, 10.4], [14.6, 10.8]],   shirt: 0x2f8f7a, hair: 0x8a8a8a, face: "keeper",    topics: ["advertising", "location", "mesh"] },
  { id: "walkerA",   name: "펌웨어 개발자", role: "BT 스택 10년 차",       route: [[-1.2, 4.5], [-1.2, 15.0]],   shirt: 0xe0a33a, hair: 0x5a3a22, face: "fwdev",     topics: ["connection", "hopping", "power", "gatt"] },
  { id: "walkerB",   name: "QA 엔지니어",   role: "호환성 테스트 담당",    route: [[-13.0, -3.6], [-6.6, -3.6]], shirt: 0xd9567a, hair: 0x1f1a17, face: "qa",        topics: ["security", "coexistence", "audio", "hopping"] }
]);

/** 상점가 (Stage 12.2) — 북서쪽(옛 던전 자리)에 모아, 남쪽(기본 카메라 쪽)을 바라본다 */
export const SHOPS = Object.freeze({ weapon: { x: -11.4, z: -11.5 }, outfit: { x: -7.4, z: -11.5 } });   // 북서쪽 옛 던전 자리 (사용자 요청)
LANDMARKS.push({
  id: "weaponShop",
  pos: { x: SHOPS.weapon.x, y: S, z: SHOPS.weapon.z },
  info: {
    sign: "⚔️ 무기점",
    title: "⚔️ 패킷 무기점",
    sub: "[상점가 · CR2032로 무기 사기]",
    desc: "ADV 패킷을 쏘는 방식이 다른 무기들 — 빠른 2M 쌍단검, 멀리 닿는 Coded 장궁, 세 갈래로 뿌리는 확장 광고 부채. 산 무기는 언제든 바꿔 낄 수 있어요.",
    lore: "PHY는 속도·거리·전력을 맞바꾼다. 2M은 빠르지만 감도가 낮고, Coded는 멀리 가지만 느리다.",
    link: CHAPTER("phy.html"),
    action: { id: "weaponShop", label: "🛒 무기 보기" },
    walkPos: { x: SHOPS.weapon.x, y: S, z: SHOPS.weapon.z + 2.3 }
  }
});
LANDMARKS.push({
  id: "outfitShop",
  pos: { x: SHOPS.outfit.x, y: S, z: SHOPS.outfit.z },
  info: {
    sign: "👘 옷가게",
    title: "👘 스펙트럼 옷가게",
    sub: "[상점가 · 기사복 갈아입기]",
    desc: "기사의 겉옷·볏·갑옷 색을 바꾸는 옷들. 능력치는 그대로, 멋만 달라져요.",
    lore: "블루투스 이름은 덴마크 왕 하랄드 '블루투스'에서 왔다 — 로고는 그의 이니셜 룬 ᚼ·ᛒ을 겹친 것.",
    link: CHAPTER("intro.html"),
    action: { id: "outfitShop", label: "🛒 옷 보기" },
    walkPos: { x: SHOPS.outfit.x, y: S, z: SHOPS.outfit.z + 2.3 }
  }
});

/** 개발자 광고판 (Stage 11.18) — 도서관 왼쪽 앞, 대각선으로 훈련장·광장을 바라본다. 내용은 home.yalex-k.com (y.AI.ex) 기준 */
export const BILLBOARD = Object.freeze({ x: -12.6, z: 4.6, width: 3.2, facing: Math.PI / 4 });   // 도서관 왼쪽 앞, 나무 하나를 치우고 대각선(남동쪽 — 훈련장·광장 쪽)으로 (사용자 지정)
LANDMARKS.push({
  id: "billboard",
  pos: { x: BILLBOARD.x, y: S, z: BILLBOARD.z },
  info: {
    title: "📋 개발자 광고판 — y.AI.ex",
    sub: "[Yalex의 바이브코딩 아티팩트]",
    desc: "이 게임을 만든 Yalex의 작업실 홈입니다. 말로 설계하고 AI와 짝 코딩으로 굳힌 아티팩트들 — 블루투스 교과서 ConnectivityBook, 이 게임 Packet Knight, 바벨 투자 콘솔 Barbell Fund, 한국사 영상 에이전트 K-History Studio — 이 거기 모여 있어요.",
    loreLabel: "🛠️ 만드는 방식: ",
    lore: "① 말로 설계 — 코드보다 문장을 먼저 ② AI와 짝 코딩 — Claude Code와 함께, 결정은 사람이 ③ 돌려서 확인 — 테스트·스모크·팩트체크 ④ 바로 내보내기 — git push 하면 배포.",
    link: "https://home.yalex-k.com/",
    linkLabel: "🏠 home.yalex-k.com 열기",
    walkPos: { x: BILLBOARD.x + Math.sin(BILLBOARD.facing) * 1.8, y: S, z: BILLBOARD.z + Math.cos(BILLBOARD.facing) * 1.8 }
  }
});

/** 비콘 찾기 알바의 측정 구역 = 등대 둘레 (반경은 balance.js RSSI_JOB.AREA_R). 등대는 지원(Stage 10 지하묘지 자리)보다 더 바깥 */
export const JOB_AREA = Object.freeze({ x: TOWER_POS.x, z: TOWER_POS.z });

export const TREE_POSITIONS = [
  [-13, -7, 1.1], [12, -7, 1.0], [13, 4, 1.1],   // (−12, 5) 나무는 광고판 자리로 비웠다 (Stage 11.18)
  [-5, -12, 1.0], [5, -11, 0.95], [-4, 12, 1.1], [4, 12, 1.0],
  [-6, 6, 1.0], [6, 6, 0.9],   // (±11, −1) 나무는 도서관·대장간과 겹쳐 치웠다 (Stage 11.20)
  [-14, 0, 1.2], [14, 0, 1.1],
  // 동서 숲 (Stage 11.20 — 과하지 않게 몇 그루씩)
  [-18, -6, 1.15], [-20.5, -3, 1.0], [-17.5, -2.5, 0.9], [-21, 1.5, 1.2], [-19, 4, 0.95], [-20.5, -7.5, 0.9], [-16.5, -9.5, 1.0],
  [18, -6, 1.1], [20.5, -2.5, 1.0], [17.5, -2, 0.9], [21, 2, 1.2], [19, 4.5, 0.95], [20.5, -8, 0.9], [16.5, -9.5, 1.0]
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
  { id: "tower",       minX: TOWER_POS.x - 0.9, maxX: TOWER_POS.x + 0.9, minZ: TOWER_POS.z - 0.9, maxZ: TOWER_POS.z + 0.9, top: S + 8.0 },
  { id: "prison",      minX: 8.5,   maxX: 11.5,  minZ: -13.3, maxZ: -10.7, top: S + 3.0 },
  { id: "weaponShop",  minX: SHOPS.weapon.x - 1.35, maxX: SHOPS.weapon.x + 1.35, minZ: SHOPS.weapon.z - 1.1, maxZ: SHOPS.weapon.z + 1.1, top: S + 3.0 },
  { id: "outfitShop",  minX: SHOPS.outfit.x - 1.35, maxX: SHOPS.outfit.x + 1.35, minZ: SHOPS.outfit.z - 1.1, maxZ: SHOPS.outfit.z + 1.1, top: S + 3.0 },
  { id: "crypt",       minX: CRYPT_POS.x - 1.0, maxX: CRYPT_POS.x + 1.0, minZ: CRYPT_POS.z - 0.8, maxZ: CRYPT_POS.z + 0.8, top: S + 1.9 },
  // 던전 관문 — 던전 구현(Stage 7) 전까지는 통과 불가
  { id: "dungeonGate", minX: WORLD.DUNGEON_X - 1.6, maxX: WORLD.DUNGEON_X + 1.6, minZ: WORLD.DUNGEON_Z - 0.5, maxZ: WORLD.DUNGEON_Z + 0.5, top: WORLD.DUNGEON_PIT_Y + 3.3 }
];

export const FOUNTAIN_RIM_HEIGHT = 0.7; // 걸어서는 못 오르고(STEP_MAX 0.55) 점프로 올라설 수 있다

export const OBSTACLE_CIRCLES = [
  { id: "fountainRim",    x: 0, z: 0, r: 1.85, top: S + FOUNTAIN_RIM_HEIGHT },
  { id: "fountainPillar", x: 0, z: 0, r: 0.95, top: S + 2.0 },   // 2층 그릇 아래로는 못 들어간다 (Stage 11.20)
  ...TREE_POSITIONS.map(([x, z, s]) => ({ id: "tree", x, z, r: 0.45, top: groundHeightAt(x, z) + 1.8 * s })),
  ...LAMP_POSITIONS.map(([x, z]) => ({ id: "lamp", x, z, r: 0.12, top: groundHeightAt(x, z) + 2.0 })),
  { id: "trainingSign", x: -9.0, z: 4.6, r: 0.25, top: S + 1.8 },
  // 개발자 광고판 기둥 2개 (판은 머리 위라 그 아래로 지나갈 수 있다)
  ...[-1, 1].map((k) => ({ id: "billboardPost", x: BILLBOARD.x + Math.cos(BILLBOARD.facing) * k * (BILLBOARD.width / 2 - 0.15), z: BILLBOARD.z - Math.sin(BILLBOARD.facing) * k * (BILLBOARD.width / 2 - 0.15), r: 0.2, top: S + 3.6 }))
];
