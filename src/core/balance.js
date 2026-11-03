// 밸런스 수치 — PRD §8.4가 원본. 표를 고치면 이 파일도 같은 커밋에서 고친다.
// 게임과 봇 시뮬레이터(Stage 6.5)가 같은 값을 읽는다. 순수 데이터 (THREE·DOM 의존 없음)

/** @typedef {"hp"|"tx"|"rx"|"hop"|"sec"|"pwr"} StatKey */

/** Lv1 기본 스탯 (PRD §8.4) */
export const PLAYER_BASE = Object.freeze({ hp: 100, tx: 10, rx: 5, hop: 6.4, sec: 0, pwr: 100, ci: 0 });

/** 스탯 표시 정보 */
export const STAT_META = Object.freeze({
  hp:  { icon: "❤️", label: "HP",  name: "연결 안정성", unit: "" },
  tx:  { icon: "⚔️", label: "TX",  name: "공격력",     unit: "" },
  rx:  { icon: "💨", label: "RX",  name: "회피율",     unit: "%" },
  hop: { icon: "🦘", label: "HOP", name: "속도",       unit: "" },
  sec: { icon: "🛡️", label: "SEC", name: "방어력",     unit: "" },
  pwr: { icon: "🔋", label: "PWR", name: "배터리 효율", unit: "" },
  ci:  { icon: "⏱️", label: "CI",  name: "연결 간격 단축", unit: "" }
});

/**
 * CI — 연결 간격 단축 (Stage 11.15, PRD §3.3). 1점마다 공격(ADV 패킷) 쿨타임과 던전 링크의 연결 이벤트 간격이 STEP씩 짧아진다.
 * 대가: 연결 이벤트가 잦을수록 전력을 더 쓴다 — 측정기 충전 시간이 1점마다 POWER씩 늘어난다(PWR가 상쇄). 교과서 connection·power 장.
 */
export const CONN_INTERVAL = Object.freeze({ STEP: 0.06, POWER: 0.05 });
/** CI 점수 → 간격 배율 (1 = 기본, 6점이면 0.64) */
export const ciIntervalMul = (ci) => Math.max(0.4, 1 - CONN_INTERVAL.STEP * (ci ?? 0));

/** 스탯이 아닌 기술 보상 (강좌 reward 키) */
export const SKILL_REWARDS = Object.freeze({
  // Stage 10: AFH는 도서관 강좌가 아니라 퀘스트 Q4(채널을 지어 날아라) 보상이다 (사용자 결정)
  afh: Object.freeze({ icon: "📶", label: "AFH 스킬", name: "간섭 채널 자동 빼기", desc: "던전 전투 중 스캔한 Wi-Fi 대역을 버튼 하나로 채널맵에서 뺀다 (적응형 주파수 도약)" })
});

/**
 * 퀴즈 만점 보너스 크기 (PRD §8.4 "퀴즈 만점 보너스" 열) — 강좌 하나 = 장비 강화 1단계와 같은 가치.
 * (Stage 6.5 시뮬레이션: 원안 HP+5·TX+1·RX+1·PWR+5로는 퀴즈를 건너뛰고 알바한 쪽이 더 빨리 성장했다 — PRD §8.7)
 */
export const QUIZ_BONUS = Object.freeze({ hp: 15, tx: 5, rx: 3, hop: 0.3, sec: 3, pwr: 10 });

export const QUIZ = Object.freeze({
  QUESTIONS_PER_QUIZ: 3,   // PRD §4.1 "레슨 후 3문제 퀴즈"
  BASE_SKILL_SLOTS: 1,     // 기본 슬롯 (ADV 패킷)
  MAX_SKILL_SLOTS: 4
});

/**
 * 도서관 강좌 (PRD §4.1 표). 챕터를 처음 만점 통과하면 reward 스탯이 영구 상승하고 스킬 슬롯이 1개 열린다.
 * 같은 챕터 재통과는 보상이 없다(파밍 방지 — 학습 동기는 "다시 읽고 도전"에 둔다).
 * 순서 = 퀘스트 순서(PRD §6 Q0~Q8). Stage 10에서 Q4~Q8 챕터를 열었다.
 * (Stage 8~9에는 호핑 강좌 보상이 AFH 스킬이었다 — Stage 10에서 Q4 퀘스트 보상으로 옮기고 강좌는 HOP 스탯)
 * @type {ReadonlyArray<{ chapter: string, reward: StatKey }>}
 */
export const LIBRARY_COURSES = Object.freeze([
  { chapter: "intro",       reward: "hp"  }, // 블루투스의 큰 그림 → 연결 안정성
  { chapter: "radio",       reward: "tx"  }, // 전파·데시벨 → 송신 출력
  { chapter: "phy",         reward: "rx"  }, // PHY·변조 → 수신 감도(회피)
  { chapter: "advertising", reward: "sec" }, // 광고 채널 3개로 간섭을 견딘다 → 간섭 내성(방어)
  { chapter: "hopping",     reward: "hop" }, // 주파수 도약 → 속도
  { chapter: "connection",  reward: "hp"  }, // 연결 유지·감독 타임아웃 → 연결 안정성
  { chapter: "gatt",        reward: "tx"  }, // 데이터 교환 → 공격(보낼 수 있는 데이터)
  { chapter: "security",    reward: "sec" }, // 페어링·암호화 → 방어
  { chapter: "power",       reward: "pwr" }  // 전력 → 배터리 효율 (측정기 충전이 빨라진다)
]);

/**
 * 알바: 비콘 찾기 (PRD §4.2, §8.4 — Stage 11.2에서 측정소 → 비콘 찾기로 바꿈). 모델 상수는 connectivityBook location.html 시뮬레이터 값.
 * 판정·등급 문턱은 scripts/simulate.mjs --game=rssi 봇 시뮬레이션으로 보정한다.
 */
export const RSSI_JOB = Object.freeze({
  DURATION: 60,            // 초 (PRD §7 Stage 5 DoD "60초 플레이")
  P1M: -59,                // 1 m 수신 세기 dBm
  PATH_LOSS_N: 2.7,        // 경로 손실 지수 (집 환경)
  FADING_SIGMA: 8,         // 패킷마다의 페이딩 흔들림 σ (dB) — 교과서 radio.html "패킷마다 ±10 dB 이상"
  ADV_INTERVAL: 0.1,       // 광고 간격 100 ms
  ADV_DELAY_MAX: 0.01,     // advDelay 0~10 ms
  MIN_D: 0.5,              // 비콘 바로 위에서의 최소 거리 (m) — log10(0) 방지
  // 비콘 찾기: 정해진 측정 구역(반경 AREA_R m 원, 위치는 layout.js JOB_AREA) 안에 숨긴다 (Stage 11.4 — 마을 전체는 너무 어려웠다)
  AREA_R: 5, SPAWN_MIN: 2, SPAWN_TRIES: 80,   // SPAWN_MIN: 기사에게서 최소 거리 (m)
  PROBE_MIN: 5,            // 한 자리에서 패킷 이만큼 모이면 미니맵에 "추정 거리 원"을 그린다
  PROBES_KEEP: 4,          // 미니맵에 남기는 지난 측정 자리 수
  STILL_RADIUS: 0.3,       // 이만큼 움직이면 "다른 자리" — 평균을 새로 모은다 (m)
  LIVE_WINDOW: 5,          // 측정기 그래프 가로 폭 (초)
  REVEAL_TIME: 2.0,        // 정답 공개 + 다음 비콘 설치 시간 (초)
  // 측정기 배터리 — 알바 1판에 1칸, RECHARGE_SEC마다 1칸 충전 (PRD §4.2·§8.7).
  // 횟수 제한이 없으면 알바가 늘 최고 효율이라 공부 시간이 손해가 된다 (Stage 6.5 시뮬레이션)
  CHARGES_MAX: 3,
  RECHARGE_SEC: 300,
  // 판정: "여기다!"를 누른 자리와 실제 비콘 사이 거리(m). 틀린 신고는 감점 — 감점이 없으면
  // "대충 찍고 다음"이 최적이 되어 학습 목표(멈춰서 평균을 내야 정확하다)와 반대가 된다 (PRD §4.2)
  TIERS: Object.freeze([
    { id: "precise", label: "정밀", maxErr: 1.0, points: 100 },
    { id: "good",    label: "양호", maxErr: 2.0, points: 40 },
    { id: "near",    label: "근처", maxErr: 3.5, points: -40 }
  ]),
  MISS: Object.freeze({ id: "miss", label: "빗나감", maxErr: Infinity, points: -100 }),
  // 세션 점수 → 등급 → CR2032 보수 (보수 8/6/4/2는 PRD §8.4). minScore는 시뮬레이션으로 보정.
  // 비콘을 1개 이상 신고하면 최소 C(참가 보수)
  GRADES: Object.freeze([
    { grade: "S", minScore: 520, reward: 8 },   // Stage 11.4 측정 구역(등대 둘레) 기준 — 60초에 비콘 약 6개 (§8.5)
    { grade: "A", minScore: 380, reward: 6 },
    { grade: "B", minScore: 240, reward: 4 },
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
// 레벨업 1회 = 스탯 포인트 1점 = 장비 강화 1단계만큼 (Stage 7.5 시뮬레이션: 원안 레벨당 3점·SEC +2/점은 장비보다 6배 강해 던전이 무의미해졌다)
export const STAT_POINTS_PER_LEVEL = 1;

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
    drops: Object.freeze([{ item: "cr2032", count: 1, chance: 0.1 }]),
    role: "브로드캐스터 (Broadcaster)",
    pdu: "ADV_NONCONN_IND",
    scan: "능동 스캔(SCAN_REQ)을 보내도 응답하지 않는다 — ADV_NONCONN_IND는 연결도 스캔 요청도 받지 않는 순수 방송이라, 수동 스캔으로 광고 데이터만 읽었다.",
    lore: "광고만 하고 연결은 받지 않는 GAP 브로드캐스터. 광고 이벤트마다 채널 37·38·39에 같은 PDU를 외친다.",
    chapter: "advertising.html"
  }),
  // Wi-Fi 간섭 몬스터 (PRD §4.3) — Stage 7 던전용. 광역(aoe) 공격은 회피(RX) 불가.
  // (Stage 8에서 "간섭 채널 밖이면 피해 0" 채널맵 메커니즘을 더한다)
  wifiInterferer: Object.freeze({
    id: "wifiInterferer",
    name: "Wi-Fi 간섭 몬스터",
    hp: 90, atk: 32, sec: 2,
    speed: 2.6, aggro: 14, leash: 30,
    attackRange: 3.0, aoe: true, windup: 0.8, cooldown: 1.8,
    respawn: Infinity,
    xp: 25,
    drops: Object.freeze([{ item: "cr2032", count: 2, chance: 0.6 }]),
    role: "간섭원 (Interferer)",
    pdu: "802.11 OFDM (20 MHz)",
    scan: "블루투스 패킷이 아니라 응답이 없다 — 2.4 GHz를 20 MHz 폭으로 넓게 덮는 Wi-Fi 신호다.",
    lore: "Wi-Fi 채널 1·6·11(20 MHz 폭)은 BLE 데이터 채널 여러 개를 한꺼번에 덮는다.",
    chapter: "coexistence.html"
  })
});

/** 훈련장 (마을 남서쪽 풀밭) */
/**
 * 퀘스트 보상 스킬 (Stage 10, PRD §6)
 *   DASH: Q5 "Connect Request 돌진" — CONNECT_IND처럼 짧고 빠르게 파고든다. 돌진 중에는 공격이 스친다(무적).
 *   AES_SHIELD: Q7 "AES 암호화 실드" — AES-CCM의 MIC 검사가 위조 패킷을 버리듯, 몬스터 공격의 일부를 무효화한다.
 *   PWR: 측정기 배터리 충전 시간 = RECHARGE_SEC × 100 / PWR (Q8·전력 강좌, 기본 PWR 100)
 */
export const QUEST_SKILLS = Object.freeze({
  DASH: Object.freeze({ time: 0.18, speedMul: 3.2, cooldown: 3.0 }),
  AES_SHIELD: Object.freeze({ blockChance: 0.2 })
});

export const TRAINING_GROUND = Object.freeze({ x: -9, z: 10, spawns: Object.freeze([[-10, 9], [-8, 11.5]]) });

/**
 * 장비 (PRD §3.3 "장비는 모두 RF 부품 은유") — 강화 1단계당 스탯 상승. 강화 UI는 RF 랩 단계에서 구현한다.
 */
export const GEAR = Object.freeze({
  antenna: Object.freeze({ name: "안테나", icon: "📡", stat: "tx", per: 2, note: "안테나 이득 → 송신 세기(공격력)",
    lore: "링크 버짓: 수신 세기 = 송신 전력 + 안테나 이득 − 경로 손실 − 장애물 손실. 이득이 오르면 같은 전력으로 더 세게 닿는다.", chapter: "radio.html" }),
  crystal: Object.freeze({ name: "크리스털", icon: "💎", stat: "rx", per: 2, note: "기준 주파수 정밀도 → 수신 여유(회피)",
    lore: "LE 칩은 32 MHz·32.768 kHz 수정 발진기로 시간을 잰다. 사양의 시계 정확도는 활성 ±50 ppm, 수면 ±500 ppm — 정확할수록 수신 창을 덜 넓혀도 된다.", chapter: "power.html" }),
  battery: Object.freeze({ name: "배터리", icon: "🔋", stat: "hp", per: 10, note: "용량 → 연결 유지력(HP)",
    lore: "CR2032 한 알은 약 220 mAh. 송신 전류는 수 mA라 계속 켜 두면 이틀도 못 가지만, 거의 항상 자기 때문에 몇 년을 간다.", chapter: "power.html" }),
  shield:  Object.freeze({ name: "쉴드 캐패시터", icon: "🛡️", stat: "sec", per: 1, note: "전원 안정화 → 간섭 내성(방어)",
    lore: "게임 속 은유 장비 — 전원 잡음을 걸러 무선부를 안정시킨다는 뜻으로, 간섭(Wi-Fi 광역 공격) 피해를 줄인다.", chapter: "coexistence.html" })
});

/**
 * 레벨업 스탯 포인트 1점당 상승량과 상한 (PRD §8.4 "레벨업 시 분배 포인트" 열).
 * PWR는 스킬 배터리가 생기기 전까지 효과가 없어 분배를 막는다 (헛투자 방지).
 */
export const STAT_POINT_GAIN = Object.freeze({ hp: 10, tx: 2, rx: 2, hop: 0.2, sec: 1, pwr: 5, ci: 1 });
export const STAT_CAPS = Object.freeze({ rx: 40, hop: 9.0, ci: 6 });
export const ALLOCATABLE_STATS = Object.freeze(["hp", "tx", "rx", "hop", "sec", "ci"]);

/** 강화 (PRD §8.4): 비용 = round(UPGRADE_BASE × 1.4^n), 성공률 = max(30%, 95% − 10%p × n), 실패 시 재료만 소실 */
export const UPGRADE = Object.freeze({ BASE: 7, GROWTH: 1.3, MAX_LEVEL: 8 });
export const upgradeCost = (n) => Math.round(UPGRADE.BASE * UPGRADE.GROWTH ** n);
export const upgradeSuccess = (n) => Math.max(0.3, 0.95 - 0.1 * n);

/** Connection Timeout 페널티: 보유 CR2032의 10% (내림) (PRD §5, §8.4) */
export const TIMEOUT_PENALTY = 0.1;

/**
 * 던전 (Stage 7 구현 전 시뮬레이션용 가정치 — PRD §8.7). 수치를 바꾸면 PRD 표도 같이 고친다.
 * k층 = Wi-Fi 간섭 몬스터 FLOOR_MONSTERS마리(체력 ×(1 + FLOOR_HP_SCALE·(k−1)))를 모두 쓰러뜨리면 클리어,
 * HP 0이면 실패(타임아웃). 클리어하면 다음 층이 열린다 (PRD §7 Stage 7 DoD). 입장 1회 = 한 층 도전.
 * (층마다 몬스터 +1마리는 장비 1단계로 메울 수 없는 절벽이었다 — PRD §8.7)
 */
export const DUNGEON = Object.freeze({ ENTRY_FEE: 3, FLOOR_MONSTERS: 3, FLOOR_HP_SCALE: 0.15, FLOOR_ATK_SCALE: 0.18, TIME_LIMIT: 180 });
export const floorHpScale = (floor) => 1 + DUNGEON.FLOOR_HP_SCALE * (floor - 1);
/** 층마다 공격력도 오른다 — 체력만 오르면 방어(SEC)만 올려 깊은 층이 무의미해진다 (Stage 7.5 시뮬레이션) */
export const floorAtkScale = (floor) => 1 + DUNGEON.FLOOR_ATK_SCALE * (floor - 1);

/**
 * 경제 목표 (PRD §8.3·§8.7): 플레이 1시간 = 루프 4회. 중간 전략 플레이어가 1시간에
 * 장비 강화 TARGET_UPGRADES회 성공 + 던전 LOOPS회 입장하는 데 드는 CR2032가 "목표 소모"다.
 * (수급 − 목표 소모) / 목표 소모 가 +5%~+15%면 합격.
 */
export const ECONOMY = Object.freeze({ HOUR: 3600, LOOPS: 4, TARGET_UPGRADES: 8, SURPLUS_MIN: 0.05, SURPLUS_MAX: 0.15 });
