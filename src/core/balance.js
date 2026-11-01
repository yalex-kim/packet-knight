// 밸런스 수치 — PRD §8.4가 원본. 표를 고치면 이 파일도 같은 커밋에서 고친다.
// 게임과 봇 시뮬레이터(Stage 6.5)가 같은 값을 읽는다. 순수 데이터 (THREE·DOM 의존 없음)

/** @typedef {"hp"|"tx"|"rx"|"hop"|"sec"|"pwr"} StatKey */

/** Lv1 기본 스탯 (PRD §8.4) */
export const PLAYER_BASE = Object.freeze({ hp: 100, tx: 10, rx: 5, hop: 6.4, sec: 0, pwr: 100 });

/** 스탯 표시 정보 */
export const STAT_META = Object.freeze({
  hp:  { icon: "❤️", label: "HP",  name: "연결 안정성", unit: "" },
  tx:  { icon: "⚔️", label: "TX",  name: "공격력",     unit: "" },
  rx:  { icon: "💨", label: "RX",  name: "회피율",     unit: "%" },
  hop: { icon: "🦘", label: "HOP", name: "속도",       unit: "" },
  sec: { icon: "🛡️", label: "SEC", name: "방어력",     unit: "" },
  pwr: { icon: "🔋", label: "PWR", name: "배터리 효율", unit: "" }
});

/** 퀴즈 만점 보너스 크기 (PRD §8.4 "퀴즈 만점 보너스" 열) */
export const QUIZ_BONUS = Object.freeze({ hp: 5, tx: 1, rx: 1, sec: 1, pwr: 5 });

export const QUIZ = Object.freeze({
  QUESTIONS_PER_QUIZ: 3,   // PRD §4.1 "레슨 후 3문제 퀴즈"
  BASE_SKILL_SLOTS: 1,     // 기본 슬롯 (ADV 패킷)
  MAX_SKILL_SLOTS: 4
});

/**
 * 도서관 강좌 (PRD §4.1 표). 챕터를 처음 만점 통과하면 reward 스탯이 영구 상승하고 스킬 슬롯이 1개 열린다.
 * 같은 챕터 재통과는 보상이 없다(파밍 방지 — 학습 동기는 "다시 읽고 도전"에 둔다).
 * Stage 4는 PRD §6 Q0~Q3 챕터만 연다. 나머지는 해당 지역 스테이지에서 추가한다.
 * @type {ReadonlyArray<{ chapter: string, reward: StatKey }>}
 */
export const LIBRARY_COURSES = Object.freeze([
  { chapter: "intro",       reward: "hp"  }, // 블루투스의 큰 그림 → 연결 안정성
  { chapter: "radio",       reward: "tx"  }, // 전파·데시벨 → 송신 출력
  { chapter: "phy",         reward: "rx"  }, // PHY·변조 → 수신 감도(회피)
  { chapter: "advertising", reward: "pwr" }  // 광고 간격·듀티 → 배터리 효율
]);

/**
 * 알바: 비콘 신호 측정소 (PRD §4.2, §8.4). 모델 상수는 connectivityBook location.html 시뮬레이터 값.
 * 판정·등급 문턱은 scripts/simulate.mjs --game=rssi 봇 시뮬레이션으로 보정한다.
 */
export const RSSI_JOB = Object.freeze({
  DURATION: 60,            // 초 (PRD §7 Stage 5 DoD "60초 플레이")
  P1M: -59,                // 1 m 수신 세기 dBm
  PATH_LOSS_N: 2.7,        // 경로 손실 지수 (집 환경)
  FADING_SIGMA: 8,         // 패킷마다의 페이딩 흔들림 σ (dB) — 교과서 radio.html "패킷마다 ±10 dB 이상"
  MIN_DIST: 1, MAX_DIST: 12, // 비콘 거리 범위 (m, 로그 균등)
  ADV_INTERVAL: 0.1,       // 광고 간격 100 ms
  ADV_DELAY_MAX: 0.01,     // advDelay 0~10 ms
  MIN_SAMPLES: 1,
  REVEAL_TIME: 2.0,        // 결과 표시 + 다음 비콘 설치 시간 (초)
  // 판정: 배율 오차 기준. 틀린 측정 보고는 감점 — 감점이 없으면 "대충 많이 재기"가 최적이 되어
  // 학습 목표(평균을 내야 정확하다)와 반대가 된다 (2026-11 시뮬레이션에서 확인, PRD §4.2)
  TIERS: Object.freeze([
    { id: "precise", label: "정밀", maxRatio: 1.12, points: 100 },
    { id: "good",    label: "양호", maxRatio: 1.3,  points: 40 },
    { id: "near",    label: "근처", maxRatio: 1.6,  points: -20 }
  ]),
  MISS: Object.freeze({ id: "miss", label: "빗나감", maxRatio: Infinity, points: -100 }),
  // 세션 점수 → 등급 → CR2032 보수 (보수 8/6/4/2는 PRD §8.4). minScore는 시뮬레이션으로 보정.
  // 측정을 1회 이상 하면 최소 C(참가 보수)
  GRADES: Object.freeze([
    { grade: "S", minScore: 1100, reward: 8 },
    { grade: "A", minScore: 850,  reward: 6 },
    { grade: "B", minScore: 500,  reward: 4 },
    { grade: "C", minScore: -Infinity, reward: 2 }
  ])
});

/** 전투 공식 (PRD §8.4 "전투 공식") */
export const COMBAT = Object.freeze({
  CRIT_CHANCE: 0.10,
  CRIT_MULT: 1.5,
  SKILL_COEF: Object.freeze({ advPacket: 1.0, connectRush: 1.6 }),
  // ADV 패킷 발사 (PRD §3.2) — 광고 패킷을 쏘는 원거리 공격
  ADV_PACKET: Object.freeze({ speed: 16, range: 12, hitRadius: 0.6, cooldown: 0.8, aimConeDeg: 35 }),
  // 플레이어 HP 회복: 마지막 피격 후 REGEN_DELAY초가 지나면 초당 최대 HP의 REGEN_RATE만큼
  REGEN_DELAY: 3,
  REGEN_RATE: 0.12,
  PICKUP_RADIUS: 1.1,
  MAGNET_RADIUS: 3.0
});

/** 레벨업 필요 누적 XP: XP(n) = 50 × n^1.5 (PRD §8.4) — n레벨 → n+1레벨 */
export const XP_TO_NEXT = (n) => Math.round(50 * n ** 1.5);
export const STAT_POINTS_PER_LEVEL = 3;

/**
 * 몬스터 도감 (PRD §8.4 표, §4.3 "몬스터 도감에 실제 스펙 배경 한 줄")
 * 스펙 문구 출처: connectivityBook advertising.html (GAP 역할, 레거시 광고 PDU 표, 능동/수동 스캔)
 */
export const MONSTERS = Object.freeze({
  trainingBot: Object.freeze({
    id: "trainingBot",
    name: "훈련용 비콘 봇",
    hp: 40, atk: 6, sec: 0,
    speed: 3.0, aggro: 7, leash: 5,
    attackRange: 1.5, windup: 0.6, cooldown: 1.4,
    respawn: 12,
    xp: 10,
    drops: Object.freeze([{ item: "cr2032", count: 1, chance: 0.35 }]),
    role: "브로드캐스터 (Broadcaster)",
    pdu: "ADV_NONCONN_IND",
    scan: "능동 스캔(SCAN_REQ)을 보내도 응답하지 않는다 — ADV_NONCONN_IND는 연결도 스캔 요청도 받지 않는 순수 방송이라, 수동 스캔으로 광고 데이터만 읽었다.",
    lore: "광고만 하고 연결은 받지 않는 GAP 브로드캐스터. 광고 이벤트마다 채널 37·38·39에 같은 PDU를 외친다.",
    chapter: "advertising.html"
  })
});

/** 훈련장 (마을 남서쪽 풀밭) */
export const TRAINING_GROUND = Object.freeze({ x: -9, z: 10, spawns: Object.freeze([[-10, 9], [-8, 11.5]]) });
