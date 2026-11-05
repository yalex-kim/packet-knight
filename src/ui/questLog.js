// 퀘스트 트래커(HUD) · 퀘스트 로그 오버레이 — 단계 ✓, 원문 읽기, 🔮 예측해 보기, 📖 완독 배지 (PRD §6, Stage 9) (DOM)
// 교과서 문항은 textContent로만 넣는다.

import { sfx } from "./audio.js";
import { CHAPTERS } from "../core/chapters.data.js";
import { QUESTS, UPCOMING_QUESTS, questById, whatifFor, stepDone, readyForWhatif, badges, stepPlace } from "../core/quests.js";

const overlay = document.getElementById("quests");
const panel = document.getElementById("quests-panel");
const tracker = document.getElementById("quest-tracker");
const pop = document.getElementById("quest-pop");

/**
 * @type {{ getProgress: () => any, onAnswer: (questId: string, originalIndex: number) => { correct: boolean, completed: any },
 *   chapterLink: (chapter: any, section: string|null, label: string, cls?: string) => HTMLAnchorElement, guideTo: (landmarkId: string) => void, onOpenChange: (open: boolean) => void, seed?: number }}
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

/** 퀘스트 로그의 단계 한 줄 — 아직 안 한 단계에는 "📍 길 안내" */
function stepLine(qs, p, quest, step) {
  const done = step.kind === "whatif" ? Boolean(qs.done[quest.id]) : stepDone(qs, p, quest, step);
  const n = qs.progress[quest.id]?.[step.id] ?? 0;
  const count = step.kind === "event" && (step.need ?? 1) > 1 && !done ? ` (${Math.floor(n)}/${step.need})` : "";
  const place = done ? null : stepPlace(step);
  return el("li", { class: done ? "done" : "" }, `${done ? "✓" : "○"} ${step.text}${count}`,
    place ? el("button", {
      type: "button", class: "q-go", "data-place": place, textContent: "📍 길 안내",
      title: "이 단계를 하는 곳으로 걸어갑니다", on: { click: () => { closeQuestLog(); closeQuestPop(); hooks.guideTo(place); } }
    }) : null);
}

// ---------- HUD 트래커 ----------
export function refreshTracker() {
  const p = hooks.getProgress();
  const qs = p.quests;
  const quest = questById(qs.active);
  // 한 줄로 접는다 (모바일에서 화면을 가리지 않게) — 단계 전체는 눌러서 여는 퀘스트 로그에 있다
  if (!quest) {
    tracker.replaceChildren(el("span", { class: "qt-head", textContent: `📜 Q0~${QUESTS.at(-1).code} 완료` }),
      el("span", { class: "qt-next", textContent: ` · 다음 퀘스트(${UPCOMING_QUESTS[0][0]}~)는 업데이트에서` }));
    tracker.title = "";
    tracker.classList.remove("ready");
    return;
  }
  const ready = readyForWhatif(qs, p, quest);
  const steps = quest.steps.filter((s) => s.kind !== "whatif");
  const done = steps.filter((s) => stepDone(qs, p, quest, s)).length;
  const next = steps.find((s) => !stepDone(qs, p, quest, s));
  const n = next ? qs.progress[quest.id]?.[next.id] ?? 0 : 0;
  const count = next && next.kind === "event" && (next.need ?? 1) > 1 ? ` (${Math.floor(n)}/${next.need})` : "";
  const nextText = ready ? "🔮 예측해 보기 열림 — 눌러서 답하기" : `○ ${next?.text ?? ""}${count}`;
  tracker.replaceChildren(
    el("span", { class: "qt-head" }, `📜 ${quest.code} `, el("span", { class: "qt-name", textContent: `${quest.title} ` }), `${done}/${steps.length}`),
    el("span", { class: "qt-next", textContent: ` › ${nextText}` })
  );
  tracker.title = `${quest.code} ${quest.title} — ${nextText} (눌러서 펼치기)`;
  tracker.classList.toggle("ready", ready);
  if (!pop.hidden) renderPop();
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
    hooks.dailyBlock?.(el, button),   // 📅 오늘의 임무 (Stage 13.20)
    list,
    el("div", { class: "q-detail" },
      el("h3", { textContent: `${quest.code} ${quest.title}` }),
      el("div", { class: "muted", textContent: `📍 ${quest.region} · 📖 ${ch.title}` }),
      el("ul", { class: "q-steps" }, quest.steps.map((s) => stepLine(qs, p, quest, s))),
      el("div", { class: "q-reward", textContent: `🎁 보상: ${quest.reward.label}` }),
      whatifBlock,
      el("div", { class: "lib-actions" },
        hooks.chapterLink(ch, w.section, "📖 원문 읽기 (예측해 보기 절) ↗", "lib-btn q-read"))
    ),
    el("div", { class: "lib-actions" }, el("button", { type: "button", class: "lib-btn", "data-action": "tutorial", textContent: "📘 설명서·튜토리얼 다시 보기" })),
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
    sfx("wrong");
    feedback = { cls: "bad", text: "✗ 아직 아니다 — 💡 힌트를 다시 보거나 📖 원문의 그 절을 읽고 다시 예측해 보자." };
    order = shuffled(order.length);
  }
  render();
  refreshTracker();
}

// ---------- 트래커 팝오버 (Stage 11.3) ----------
// 한 줄 트래커를 누르면 진행 중인 퀘스트 하나만 트래커 바로 위로 펼친다 (전체 로그는 "퀘스트 (Q)" 버튼).
function renderPop() {
  const p = hooks.getProgress();
  const qs = p.quests;
  const quest = questById(qs.active);
  const close = el("button", { type: "button", class: "close", textContent: "×", "aria-label": "접기", on: { click: closeQuestPop } });
  const fullLog = button("📜 전체 퀘스트 로그", () => { closeQuestPop(); openQuestLog(); }, "lib-btn qp-log");
  if (!quest) {
    pop.replaceChildren(el("div", { class: "qp-head" }, el("b", { textContent: `📜 Q0~${QUESTS.at(-1).code} 모두 완료` }), close),
      el("div", { class: "muted", textContent: `다음 퀘스트(${UPCOMING_QUESTS[0][0]}~)는 다음 업데이트에서 열린다` }),
      el("div", { class: "lib-actions" }, fullLog));
    return;
  }
  const ch = chapter(quest.chapter);
  const w = whatifFor(quest);
  const ready = readyForWhatif(qs, p, quest);
  pop.replaceChildren(...[   // replaceChildren은 null을 글자로 넣으므로 걸러 낸다
    el("div", { class: "qp-head" }, el("b", { textContent: `📜 ${quest.code} ${quest.title}` }), close),
    el("div", { class: "muted", textContent: `📍 ${quest.region} · 📖 ${ch.title}` }),
    el("ul", { class: "q-steps" }, quest.steps.map((s) => stepLine(qs, p, quest, s))),
    el("div", { class: "q-reward", textContent: `🎁 보상: ${quest.reward.label}` }),
    ready ? button("🔮 예측해 보기 답하기", () => { closeQuestPop(); openQuestLog(quest.id); }, "lib-btn primary qp-whatif") : null,
    el("div", { class: "lib-actions" }, hooks.chapterLink(ch, w.section, "📖 원문 ↗", "lib-btn"), fullLog)
  ].filter(Boolean));
}
/** 트래커 바로 위에 붙인다 — 트래커 위치는 화면 크기(데스크톱/모바일)마다 다르다 */
function placePop() {
  const r = tracker.getBoundingClientRect();
  pop.style.left = `${Math.max(8, r.left)}px`;
  pop.style.bottom = `${Math.round(window.innerHeight - r.top + 8)}px`;
}
export function openQuestPop() {
  renderPop();
  placePop();
  pop.hidden = false;
  tracker.setAttribute("aria-expanded", "true");
  pop.querySelector(".qp-whatif, .close")?.focus({ preventScroll: true });
}
export function closeQuestPop() {
  if (pop.hidden) return;
  pop.hidden = true;
  tracker.setAttribute("aria-expanded", "false");
}
export const isQuestPopOpen = () => !pop.hidden;

export function openQuestLog(questId = null) {
  closeQuestPop();
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
  tracker.addEventListener("click", () => (pop.hidden ? openQuestPop() : closeQuestPop()));
  tracker.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pop.hidden ? openQuestPop() : closeQuestPop(); }
  });
  // 팝오버 바깥을 누르면 접는다 (트래커는 위의 토글이 처리)
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !tracker.contains(e.target)) closeQuestPop();
  }, { capture: true });
  window.addEventListener("resize", () => { if (!pop.hidden) placePop(); });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeQuestLog(); });
  // 캡처 단계: 다른 팝업의 Esc 처리보다 먼저 퀘스트 로그를 닫는다
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) closeQuestLog();
    else if (e.key === "Escape" && !pop.hidden) { e.stopPropagation(); closeQuestPop(); }
  }, { capture: true });
  refreshTracker();
}
