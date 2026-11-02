// 퀘스트 트래커(HUD) · 퀘스트 로그 오버레이 — 단계 ✓, 원문 읽기, 🔮 예측해 보기, 📖 완독 배지 (PRD §6, Stage 9) (DOM)
// 교과서 문항은 textContent로만 넣는다.

import { CHAPTERS } from "../core/chapters.data.js";
import { QUESTS, UPCOMING_QUESTS, questById, whatifFor, stepDone, readyForWhatif, badges } from "../core/quests.js";

const overlay = document.getElementById("quests");
const panel = document.getElementById("quests-panel");
const tracker = document.getElementById("quest-tracker");

/**
 * @type {{ getProgress: () => any, onAnswer: (questId: string, originalIndex: number) => { correct: boolean, completed: any },
 *   openReader: (chapter: any, section: string|null) => void, isReaderOpen: () => boolean, onOpenChange: (open: boolean) => void, seed?: number }}
 */
let hooks;
let lastFocus = null;
/** 지금 보고 있는 퀘스트 · 섞은 보기 순서 · 직전 답 결과 */
let viewId = null;
let order = null;
let feedback = null;
let rngState = 1;
const rand = () => ((rngState = (rngState * 1103515245 + 12345) >>> 0) / 2 ** 32);

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
const chapter = (id) => CHAPTERS.find((c) => c.id === id);

/** 원문 순서 인덱스를 섞는다 — 교과서 원문은 정답이 늘 두 번째라서 그대로 보이면 외워진다 */
function shuffled(n) {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function stepLine(qs, p, quest, step) {
  const done = step.kind === "whatif" ? Boolean(qs.done[quest.id]) : stepDone(qs, p, quest, step);
  const n = qs.progress[quest.id]?.[step.id] ?? 0;
  const count = step.kind === "event" && (step.need ?? 1) > 1 && !done ? ` (${Math.floor(n)}/${step.need})` : "";
  return el("li", { class: done ? "done" : "" }, `${done ? "✓" : "○"} ${step.text}${count}`);
}

// ---------- HUD 트래커 ----------
export function refreshTracker() {
  const p = hooks.getProgress();
  const qs = p.quests;
  const quest = questById(qs.active);
  const title = qs.title ? el("span", { class: "qt-title", textContent: `🏅 ${qs.title}` }) : null;
  if (!quest) {
    tracker.replaceChildren(el("div", { class: "qt-head" }, "📜 퀘스트 Q0~Q3 완료 ", title), el("div", { class: "muted", textContent: "다음 퀘스트(Q4~)는 다음 업데이트에서 열린다" }));
    return;
  }
  const ready = readyForWhatif(qs, p, quest);
  tracker.replaceChildren(
    el("div", { class: "qt-head" }, `📜 ${quest.code} ${quest.title} `, title),
    el("ul", {}, quest.steps.map((s) => stepLine(qs, p, quest, s))),
    ready && el("div", { class: "qt-ready", textContent: "🔮 예측해 보기가 열렸다 — 눌러서 답하기 (Q)" })
  );
  tracker.classList.toggle("ready", ready);
}

// ---------- 퀘스트 로그 ----------
function render() {
  const p = hooks.getProgress();
  const qs = p.quests;
  const earned = new Set(badges(qs));
  const list = el("div", { class: "q-list" },
    QUESTS.map((q) => {
      const state = qs.done[q.id] ? "✅" : q.id === qs.active ? "▶" : "🔒";
      const b = button(`${state} ${q.code} ${q.title}`, () => { viewId = q.id; order = null; feedback = null; render(); }, `q-item${q.id === viewId ? " on" : ""}`);
      b.disabled = state === "🔒";
      b.dataset.quest = q.id;
      return b;
    }),
    UPCOMING_QUESTS.map(([code, title]) => el("button", { type: "button", class: "q-item", disabled: true, textContent: `🔒 ${code} ${title}` }))
  );
  const quest = questById(viewId) ?? questById(qs.active) ?? QUESTS.at(-1);
  viewId = quest.id;
  const ch = chapter(quest.chapter);
  const w = whatifFor(quest);
  const isDone = Boolean(qs.done[quest.id]);
  const ready = !isDone && qs.active === quest.id && readyForWhatif(qs, p, quest);

  let whatifBlock;
  if (isDone) {
    whatifBlock = el("div", { class: "q-whatif solved" },
      el("b", { textContent: `🔮 ${w.q}` }),
      el("div", { class: "q-explain", textContent: `✓ ${w.options[w.answer]} — ${w.explain}` }));
  } else if (!ready) {
    whatifBlock = el("div", { class: "q-whatif locked muted", textContent: "🔮 예측해 보기는 위 단계를 모두 마치면 열린다." });
  } else {
    order ??= shuffled(w.options.length);
    whatifBlock = el("div", { class: "q-whatif" },
      el("b", { textContent: `🔮 예측해 보기 — ${w.q}` }),
      w.hint && el("div", { class: "muted", textContent: `💡 ${w.hint}` }),
      el("div", { class: "opts" }, order.map((orig) => {
        const b = button(w.options[orig], () => answer(quest.id, orig), "opt");
        b.dataset.orig = String(orig);
        return b;
      })),
      feedback && el("div", { class: `q-feedback ${feedback.cls}`, role: "status", textContent: feedback.text })
    );
  }

  panel.replaceChildren(
    el("div", { class: "head" },
      el("div", {}, el("h2", { id: "quests-title", textContent: "📜 퀘스트 로그" }),
        el("div", { class: "muted", textContent: `${qs.title ? `🏅 칭호: ${qs.title} · ` : ""}완료 ${Object.keys(qs.done).length}/${QUESTS.length}` })),
      el("button", { type: "button", class: "close", textContent: "×", "aria-label": "닫기", on: { click: closeQuestLog } })
    ),
    list,
    el("div", { class: "q-detail" },
      el("h3", { textContent: `${quest.code} ${quest.title}` }),
      el("div", { class: "muted", textContent: `📍 ${quest.region} · 📖 ${ch.title}` }),
      el("ul", { class: "q-steps" }, quest.steps.map((s) => stepLine(qs, p, quest, s))),
      el("div", { class: "q-reward", textContent: `🎁 보상: ${quest.reward.label}` }),
      whatifBlock,
      el("div", { class: "lib-actions" },
        button("📖 원문 읽기 (예측해 보기 절)", () => hooks.openReader(ch, w.section), "lib-btn q-read"))
    ),
    el("h3", { textContent: "📖 완독 배지" }),
    el("div", { class: "q-badges" }, CHAPTERS.map((c) => el("span", {
      class: `q-badge${earned.has(c.id) ? " on" : ""}`, title: c.title, "data-chapter": c.id,
      textContent: `${earned.has(c.id) ? "📖" : "▫️"} ${c.title.split(":")[0]}`
    })))
  );
  panel.querySelector(".opt, .q-item.on, .close")?.focus({ preventScroll: true });
}

function answer(questId, orig) {
  const r = hooks.onAnswer(questId, orig);
  if (r.completed) {
    feedback = null;
    order = null;
  } else {
    // 틀리면 보기를 다시 섞고, 원문을 다시 읽어 보라고 권한다 (해설은 맞힌 뒤에 보여 준다)
    feedback = { cls: "bad", text: "✗ 아직 아니다 — 💡 힌트를 다시 보거나 📖 원문의 그 절을 읽고 다시 예측해 보자." };
    order = shuffled(order.length);
  }
  render();
  refreshTracker();
}

export function openQuestLog(questId = null) {
  lastFocus = document.activeElement;
  viewId = questId ?? hooks.getProgress().quests.active;
  order = null;
  feedback = null;
  overlay.hidden = false;
  hooks.onOpenChange(true);
  render();
}
export function closeQuestLog() {
  if (overlay.hidden) return;
  overlay.hidden = true;
  hooks.onOpenChange(false);
  lastFocus?.focus?.({ preventScroll: true });
}
export const isQuestLogOpen = () => !overlay.hidden;
/** 테스트 훅: 화면에 보이는 보기 순서(원문 인덱스) */
export const shownOrder = () => (order ? [...order] : null);

export function initQuestLog(h) {
  hooks = h;
  rngState = (h.seed ?? Date.now()) >>> 0 || 1;
  tracker.addEventListener("click", () => openQuestLog());
  document.getElementById("btn-quests").addEventListener("click", () => openQuestLog());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeQuestLog(); });
  // 캡처 단계: 원문 리더가 위에 떠 있으면 리더만 닫히게 둔다
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden && !hooks.isReaderOpen()) closeQuestLog();
  }, { capture: true });
  refreshTracker();
}
