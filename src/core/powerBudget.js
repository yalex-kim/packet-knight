// 전력 잃은 지하묘지 — CR2032 배터리 계약 (Stage 10, PRD §6 Q8) · 순수 로직
//
// 모델 (connectivityBook power.html "배터리 수명 계산기"·"창 넓히기"):
//   깨어나는 간격 T = 연결 간격 × (페리페럴 지연 + 1)            — 지연(latency): 그만큼 이벤트를 건너뛰고 잔다
//   창 넓히기 W = (상대 수면 시계 오차 ppm ÷ 10⁶) × T + 16 µs      — [Vol 6] Part B §4.2.4 (한쪽)
//   이벤트 한 번 전하량 Q = Q_BASE + I_RX × 2W                    — 앞뒤로 W씩 더 듣는다
//   평균 전류 = I_수면 + Q ÷ T,   수명 = 용량 ÷ 평균 전류
// 대표값: 이벤트 15 µC(책의 예), 수신 5.4 mA, 수면 2 µA, CR2032 220 mAh (책의 예). 반응 시간 = T (최악의 경우).

export const POWER_MODEL = Object.freeze({
  Q_BASE_UC: 15,        // 이벤트 한 번 기본 전하량 (µC) — 창 넓히기 제외
  I_RX_MA: 5.4,         // 수신 전류 (mA)
  I_SLEEP_UA: 2,        // 수면 전류 (µA)
  CAPACITY_MAH: 220,    // CR2032
  WIDEN_FIXED_US: 16    // 창 넓히기 고정분 (수면 시계 기준)
});

/** 수면 시계: 32.768 kHz 수정 발진기 vs 저렴한 RC 발진기 (사양 한도 ±500 ppm) */
export const CLOCKS = Object.freeze({
  crystal: { label: "32.768 kHz 수정 발진기 (±50 ppm)", ppm: 50 },
  rc: { label: "RC 발진기 (±500 ppm)", ppm: 500 }
});

export const INTERVALS_MS = Object.freeze([100, 250, 500, 1000, 2000, 4000]);
export const MAX_LATENCY = 4;

/**
 * @param {{ intervalMs: number, latency: number, clock: keyof typeof CLOCKS }} s
 * @returns {{ wakeS: number, widenUs: number, chargeUc: number, avgUa: number, lifeYears: number }}
 */
export function powerBudget({ intervalMs, latency, clock }, m = POWER_MODEL) {
  const wakeS = (intervalMs / 1000) * (latency + 1);
  const widenUs = (CLOCKS[clock].ppm / 1e6) * wakeS * 1e6 + m.WIDEN_FIXED_US;
  const chargeUc = m.Q_BASE_UC + m.I_RX_MA * 1000 * (2 * widenUs / 1e6); // mA→µA × s = µC
  const avgUa = m.I_SLEEP_UA + chargeUc / wakeS;
  const lifeYears = (m.CAPACITY_MAH * 1000 / avgUa) / (24 * 365);
  return { wakeS, widenUs, chargeUc, avgUa, lifeYears };
}

/**
 * 계약: 요구 수명·최대 반응 시간. fixedInterval이 있으면 센트럴이 연결 간격을 정해 둔 것 (페리페럴은 지연만 고를 수 있다)
 * @typedef {{ id: string, title: string, desc: string, minYears: number, maxResponseS: number, fixedIntervalMs?: number, lesson: string }} Contract
 * @type {Contract[]}
 */
export const CONTRACTS = Object.freeze([
  { id: "heart", title: "💓 심박 센서", desc: "1초마다 심박을 알림으로 보낸다", minYears: 1, maxResponseS: 1,
    lesson: "평균 전류 = 수면 + 이벤트 전하 ÷ 간격. 간격을 반응 한도(1 s)까지 늘리는 것이 첫 손잡이다." },
  { id: "door", title: "🚪 문 열림 센서", desc: "4초 안에만 알리면 된다, 대신 3년은 가야 한다", minYears: 3, maxResponseS: 4,
    lesson: "간격이 길면 창 넓히기가 커진다 — 4 s·±500 ppm이면 앞뒤 각 2 ms를 더 들어야 한다. 수정 발진기가 몇 년을 벌어 준다." },
  { id: "env", title: "🌡️ 환경 센서 (게이트웨이가 간격 500 ms 고정)", desc: "센트럴이 연결 간격을 500 ms로 정했다. 반응 2초 이내, 수명 2년", minYears: 2, maxResponseS: 2, fixedIntervalMs: 500,
    lesson: "간격을 못 바꿔도 페리페럴 지연으로 이벤트를 건너뛰면 된다 — 반응 속도는 지연까지 포함한 T로 정해진다." }
]);

/** 계약 판정 */
export function judgeContract(contract, setting) {
  const b = powerBudget(setting);
  const intervalOk = !contract.fixedIntervalMs || setting.intervalMs === contract.fixedIntervalMs;
  const responseOk = b.wakeS <= contract.maxResponseS + 1e-9;
  const lifeOk = b.lifeYears >= contract.minYears;
  return { ...b, intervalOk, responseOk, lifeOk, pass: intervalOk && responseOk && lifeOk };
}

/** 계약마다 통과하는 설정이 있는지 (테스트·문서용) */
export function solutions(contract) {
  const out = [];
  for (const intervalMs of INTERVALS_MS) for (let latency = 0; latency <= MAX_LATENCY; latency++) for (const clock of Object.keys(CLOCKS)) {
    if (judgeContract(contract, { intervalMs, latency, clock }).pass) out.push({ intervalMs, latency, clock });
  }
  return out;
}
