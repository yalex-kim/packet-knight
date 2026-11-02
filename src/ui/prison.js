// 보안의 감옥 — 페어링 시험 UI (Stage 10, Q7) (DOM)

import { createTrial, answerTrial, explainRound, METHODS, IO_CAPS, PAIRING_TRIAL } from "../core/pairing.js";
import { chapterUrl } from "../core/book.js";

const overlay = document.getElementById("prison");
const panel = document.getElementById("prison-panel");

/** @type {{ rng: () => number, onPassed: () => void, onOpenChange: (open: boolean) => void }} */
let hooks;
let trial = null;
let last = null; // 직전 답 결과 { correct, text }
let lastFocus = null;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) node.append(c);
  return node;
}
const button = (label, onClick, cls = "lib-btn") => el("button", { type: "button", class: cls, textContent: label, on: { click: onClick } });

function head(sub) {
  return el("div", { class: "head" },
    el("div", {}, el("h2", { textContent: "🔒 보안의 감옥 — 페어링 시험" }), el("div", { class: "muted", textContent: sub })),
    el("button", { type: "button", class: "close", textContent: "×", "aria-label": "닫기", on: { click: closePrison } }));
}

function render() {
  if (!trial) {
    panel.replaceChildren(head("간수: 페어링을 제대로 아는 기사만 감옥 열쇠를 받는다"),
      el("div", { class: "npc", textContent: `간수: "두 기기가 만나면 무엇으로 서로를 확인하지? ${PAIRING_TRIAL.ROUNDS}문제 중 ${PAIRING_TRIAL.PASS}문제를 맞혀라. 숫자 비교 화면이 다르면 — 그건 중간자다."` }),
      el("ul", {},
        el("li", { textContent: "개시자·응답자의 입출력 능력(IO capability)과 Secure Connections 여부로 방식이 정해진다 (양쪽 모두 MITM 보호 요구, OOB 없음)." }),
        el("li", { textContent: "입출력이 없는 기기가 끼면 Just Works — 도청은 ECDH가 막지만 중간자는 못 막는다." })),
      el("div", { class: "lib-actions" },
        el("a", { class: "lib-btn", href: chapterUrl("security.html", "models"), target: "_blank", rel: "noopener", textContent: "📖 교과서: 입출력 능력의 조합" }),
        button("🔐 시험 시작", start, "lib-btn primary")));
    return;
  }
  const r = trial.rounds[trial.index];
  const done = !r;
  const feedback = last && el("div", { class: `lab-result ${last.correct ? "ok" : "bad"}`, role: "status", textContent: `${last.correct ? "✓ 맞았다" : "✗ 틀렸다"} — ${last.text}` });
  if (done) {
    const passed = trial.correct >= PAIRING_TRIAL.PASS;
    panel.replaceChildren(head(`${trial.correct}/${trial.rounds.length} 정답`), feedback,
      el("div", { class: "npc", textContent: passed ? "간수: \"좋다. 넌 도청자와 중간자를 구별할 줄 안다. 감옥 열쇠를 가져가라.\" 🔓" : `간수: "${PAIRING_TRIAL.PASS}문제는 맞혀야 한다. 교과서의 방식 표를 다시 보고 오너라."` }),
      el("div", { class: "lib-actions" },
        !passed && button("🔁 다시 도전", start, "lib-btn primary"),
        button("닫기", closePrison, passed ? "lib-btn primary" : "lib-btn")));
    return;
  }
  let body;
  if (r.kind === "method") {
    body = [
      el("div", { class: "pair-devices" },
        el("div", { class: "pair-dev" }, el("b", { textContent: "개시자" }), ` ${r.initiator.name}`, el("div", { class: "muted", textContent: `${r.initiator.io} · ${IO_CAPS[r.initiator.io]}` })),
        el("div", { class: "pair-arrow", textContent: "⇄" }),
        el("div", { class: "pair-dev" }, el("b", { textContent: "응답자" }), ` ${r.responder.name}`, el("div", { class: "muted", textContent: `${r.responder.io} · ${IO_CAPS[r.responder.io]}` }))),
      el("div", { class: "muted", textContent: r.sc ? "🔐 양쪽 모두 LE Secure Connections 지원" : "⚠️ 한쪽이 레거시 페어링만 지원 (4.0~4.1)" }),
      el("h3", { textContent: "어떤 방식으로 페어링될까?" }),
      el("div", { class: "opts" }, METHODS.map((m) => { const b = button(m, () => answer(m), "opt"); b.dataset.choice = m; return b; }))
    ];
  } else {
    body = [
      el("div", { class: "muted", textContent: "숫자 비교: 두 휴대폰 화면에 뜬 6자리. 같은 숫자면 \"예\", 다르면 \"아니요\"." }),
      el("div", { class: "pair-devices" },
        el("div", { class: "pair-dev" }, "📱 휴대폰 A", el("div", { class: "pair-num", textContent: r.a })),
        el("div", { class: "pair-arrow", textContent: "≟" }),
        el("div", { class: "pair-dev" }, "📱 휴대폰 B", el("div", { class: "pair-num", textContent: r.b }))),
      el("div", { class: "opts" }, ["예", "아니요"].map((m) => { const b = button(m === "예" ? "✅ 예 (같다)" : "⛔ 아니요 (다르다)", () => answer(m), "opt"); b.dataset.choice = m; return b; }))
    ];
  }
  panel.replaceChildren(head(`문제 ${trial.index + 1}/${trial.rounds.length} · 정답 ${trial.correct}`), feedback, ...body);
  panel.querySelector(".opt")?.focus({ preventScroll: true });
}

function start() {
  trial = createTrial(hooks.rng);
  last = null;
  render();
}

function answer(choice) {
  const r = trial.rounds[trial.index];
  const res = answerTrial(trial, choice);
  last = { correct: res.correct, text: explainRound(r) };
  if (res.passed) hooks.onPassed();
  render();
}

export function openPrison() {
  lastFocus = document.activeElement;
  trial = null;
  last = null;
  overlay.hidden = false;
  hooks.onOpenChange(true);
  render();
}
export function closePrison() {
  if (overlay.hidden) return;
  overlay.hidden = true;
  hooks.onOpenChange(false);
  lastFocus?.focus?.({ preventScroll: true });
}
export const isPrisonOpen = () => !overlay.hidden;
/** 테스트 훅: 현재 문제의 정답 */
export const currentAnswer = () => trial?.rounds[trial.index]?.answer ?? null;

export function initPrison(h) {
  hooks = h;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePrison(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closePrison(); });
}
