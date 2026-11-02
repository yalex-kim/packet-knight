// 보안의 감옥 — 페어링 시험 (Stage 10, PRD §6 Q7) · 순수 로직
//
// 판정 근거: [Vol 3] Part H §2.3.5.1 Table 2.6~2.8 — connectivityBook security.html의 "페어링 방식 판정기"와 같은 표.
// 시험은 두 종류 문제를 섞는다.
//   ① 방식 맞히기: 두 기기의 입출력 능력(IO capability)과 Secure Connections 여부를 보고 Just Works / 숫자 비교 / 패스키 입력
//   ② 숫자 비교 확인: 양쪽 화면의 6자리를 보고 같으면 "예", 다르면 "아니요"(중간자가 공개 키를 바꿔치기한 경우)
// 단순화: 양쪽 모두 MITM 보호를 요구하고 OOB 데이터는 없다고 가정한다.

export const IO_CAPS = Object.freeze({
  DisplayOnly: "화면만",
  DisplayYesNo: "화면 + 예/아니요",
  KeyboardOnly: "숫자 키보드",
  NoInputNoOutput: "입출력 없음",
  KeyboardDisplay: "키보드 + 화면"
});

/** 시험에 나오는 기기 */
export const DEVICES = Object.freeze([
  { name: "📱 휴대폰", io: "DisplayYesNo" },
  { name: "🎧 무선 이어폰", io: "NoInputNoOutput" },
  { name: "💻 노트북", io: "KeyboardDisplay" },
  { name: "⌨️ 블루투스 키보드", io: "KeyboardOnly" },
  { name: "⌚ 단순 시계", io: "DisplayOnly" },
  { name: "🌡️ 온도 센서", io: "NoInputNoOutput" }
]);

export const METHODS = Object.freeze(["Just Works", "숫자 비교", "패스키 입력"]);

/**
 * 페어링 방식 (양쪽 MITM 요구, OOB 없음) — Table 2.8
 * @param {string} ini 개시자 IO @param {string} res 응답자 IO @param {boolean} sc 양쪽 모두 LE Secure Connections
 * @returns {{ method: string, who?: string, auth: string }}
 */
export function pairingMethod(ini, res, sc) {
  if (ini === "NoInputNoOutput" || res === "NoInputNoOutput") return { method: "Just Works", auth: "미인증" };
  const PK = (who) => ({ method: "패스키 입력", who, auth: sc ? "인증" : "미인증 (레거시)" });
  const NC = { method: "숫자 비교", auth: "인증" };
  const JW = { method: "Just Works", auth: "미인증" };
  switch (`${ini}/${res}`) {
    case "DisplayOnly/DisplayOnly": case "DisplayOnly/DisplayYesNo": case "DisplayYesNo/DisplayOnly": return JW;
    case "DisplayYesNo/DisplayYesNo": return sc ? NC : JW;
    case "KeyboardOnly/DisplayOnly": case "KeyboardDisplay/DisplayOnly": case "KeyboardOnly/DisplayYesNo": case "KeyboardOnly/KeyboardDisplay": return PK("응답자가 보여 주고 개시자가 입력");
    case "KeyboardDisplay/DisplayYesNo": return sc ? NC : PK("응답자가 보여 주고 개시자가 입력");
    case "DisplayOnly/KeyboardOnly": case "DisplayYesNo/KeyboardOnly": case "KeyboardDisplay/KeyboardOnly": case "DisplayOnly/KeyboardDisplay": return PK("개시자가 보여 주고 응답자가 입력");
    case "DisplayYesNo/KeyboardDisplay": case "KeyboardDisplay/KeyboardDisplay": return sc ? NC : PK("개시자가 보여 주고 응답자가 입력");
    case "KeyboardOnly/KeyboardOnly": return PK("사용자가 같은 숫자를 양쪽에 입력");
  }
  return JW;
}

export const PAIRING_TRIAL = Object.freeze({ ROUNDS: 6, PASS: 5, COMPARE_ROUNDS: 2 });

const six = (rng) => String(Math.floor(rng() * 1e6)).padStart(6, "0"); // 000000~999999, 0도 6자리로 (§2.3.5.3)

function methodRound(rng) {
  // 같은 기기끼리는 휴대폰↔휴대폰만 (숫자 비교 vs 레거시 Just Works를 보여 주는 대표 예)
  for (;;) {
    const a = DEVICES[Math.floor(rng() * DEVICES.length)];
    const b = DEVICES[Math.floor(rng() * DEVICES.length)];
    if (a === b && a.io !== "DisplayYesNo") continue;
    const sc = rng() < 0.75;
    const answer = pairingMethod(a.io, b.io, sc);
    return { kind: "method", initiator: a, responder: b, sc, answer: answer.method, detail: answer };
  }
}

function compareRound(rng) {
  // 숫자 비교: 양쪽이 g2(…) mod 10⁶을 표시. 중간자가 키를 바꿔치기하면 0.999999 확률로 다르다 (§2.3.5.6.2)
  const mitm = rng() < 0.5;
  const a = six(rng);
  let b = a;
  if (mitm) while (b === a) b = six(rng);
  return { kind: "compare", a, b, mitm, answer: mitm ? "아니요" : "예" };
}

/** 시험 문제 세트: 방식 맞히기 + 숫자 비교 확인을 섞는다 */
export function createTrial(rng) {
  const rounds = [];
  for (let i = 0; i < PAIRING_TRIAL.ROUNDS - PAIRING_TRIAL.COMPARE_ROUNDS; i++) rounds.push(methodRound(rng));
  for (let i = 0; i < PAIRING_TRIAL.COMPARE_ROUNDS; i++) rounds.splice(1 + i * 2 + Math.floor(rng() * 2), 0, compareRound(rng));
  return { rounds, index: 0, correct: 0, log: [] };
}

/** 현재 문제에 답한다 → { correct, done, passed } */
export function answerTrial(trial, choice) {
  const r = trial.rounds[trial.index];
  const correct = choice === r.answer;
  if (correct) trial.correct++;
  trial.log.push({ round: r, choice, correct });
  trial.index++;
  const done = trial.index >= trial.rounds.length;
  return { correct, done, passed: done && trial.correct >= PAIRING_TRIAL.PASS };
}

/** 문제 해설 (교과서 표현) */
export function explainRound(r) {
  if (r.kind === "compare") {
    return r.mitm
      ? `두 화면의 숫자가 다르다 — 중간자가 양쪽에 자기 공개 키를 끼워 넣어 서로 다른 DHKey가 만들어졌다. "아니요"로 거부해야 한다.`
      : `두 화면의 숫자가 같다 — 같은 공개 키·난수로 계산한 g2 값의 하위 6자리. "예"를 누르면 인증된 키가 된다.`;
  }
  const { initiator: a, responder: b, sc, detail } = r;
  const why = a.io === "NoInputNoOutput" || b.io === "NoInputNoOutput"
    ? "한쪽에 입출력이 없어 사람이 확인할 수단이 없다"
    : detail.method === "숫자 비교" ? "양쪽에 화면과 예/아니요가 있고 Secure Connections라 숫자 비교"
    : detail.method === "패스키 입력" ? `${detail.who}` + (sc ? "" : " (레거시라 6.2부터 '미인증'으로 분류)")
    : sc ? "숫자를 입력할 키보드가 없고, 숫자 비교는 양쪽 모두 예/아니요가 있어야 한다" : "레거시 페어링에는 숫자 비교가 없다";
  return `${a.name}(${a.io}) → ${b.name}(${b.io}), ${sc ? "Secure Connections" : "레거시"}: ${detail.method} — ${why}. 키는 ${detail.auth}.`;
}
