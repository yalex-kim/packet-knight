// 📡 스펙 한 장 + 🎯 맞혀 보기 (Stage 13.12) — 광고처럼 잠깐 뜨는 블루투스 사양 카드 (DOM)
// 10초 동안 보이고(진행 막대), 3초 뒤 건너뛰기. "🎯 맞혀 보기"를 누르면 그 장 문제 1개 → 맞히면 🪙 보상.
// 문제 화면(askQuestion)은 알바 정산의 🎓 2배 받기도 같이 쓴다.

import { SPEC_CARD } from "../core/balance.js";
import { CHAPTERS } from "../core/chapters.data.js";
import { chapterUrl } from "../core/book.js";

const SEEN_KEY = "packetKnight.specSeen";
let overlay = null, hooks = null, timer = 0, open = false;

export const loadSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")); } catch { return new Set(); } };
const saveSeen = (seen) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch { /* 무시 */ } };

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const chapterTitle = (id) => CHAPTERS.find((c) => c.id === id)?.title ?? id;

/**
 * 문제 하나를 box 안에 그린다. 답을 고르면 정답·해설을 보여 주고 onDone(correct) — 한 번만 고를 수 있다.
 * @param {HTMLElement} box @param {{ q: string, options: string[], answer: number, explain: string, chapter?: string }} q
 */
export function askQuestion(box, q, onDone) {
  box.innerHTML = `<div class="sq">
    ${q.chapter ? `<span class="sq-ch">📖 ${esc(chapterTitle(q.chapter))}</span>` : ""}
    <p class="sq-q">${esc(q.q)}</p>
    <div class="sq-opts">${q.options.map((o, i) => `<button type="button" class="sq-opt" data-i="${i}">${esc(o)}</button>`).join("")}</div>
    <p class="sq-explain" hidden></p>
  </div>`;
  box.__q = q;   // 테스트 훅용 (스모크가 정답 보기를 고른다)
  let done = false;
  box.querySelectorAll(".sq-opt").forEach((b) => b.addEventListener("click", () => {
    if (done) return;
    done = true;
    const pick = Number(b.dataset.i), ok = pick === q.answer;
    box.querySelectorAll(".sq-opt").forEach((x, i) => { x.disabled = true; if (i === q.answer) x.classList.add("right"); else if (i === pick) x.classList.add("wrong"); });
    const ex = box.querySelector(".sq-explain");
    ex.hidden = false;
    ex.textContent = `${ok ? "⭕ 정답!" : "❌ 아쉬워요."} ${q.explain}`;
    onDone(ok);
  }));
}

function build() {
  overlay = document.createElement("div");
  overlay.id = "spec-card";
  overlay.className = "overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "블루투스 스펙 한 장");
  overlay.innerHTML = `<div class="panel spc">
    <div class="spc-head"><span class="spc-tag">📡 블루투스 스펙 한 장</span><span class="spc-ch"></span></div>
    <div class="spc-body"></div>
    <div class="spc-bar"><i></i></div>
    <div class="spc-actions"></div>
  </div>`;
  document.body.append(overlay);
  window.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") { const s = overlay.querySelector(".spc-skip:not([disabled]), .spc-close"); if (s) { e.stopPropagation(); s.click(); } }
  }, { capture: true });
}

/** @param {{ onOpen?: () => void, onClose?: () => void, drawQuestion: (chapter: string) => any, onReward: (n: number) => void, sfx?: (n: string) => void }} h */
export function initSpecCard(h) { hooks = h; }
export const isSpecCardOpen = () => open;

/** 카드 한 장 띄우기 @param {{ id: string, chapter: string, title: string, text: string }} card */
export function showSpecCard(card) {
  if (!overlay) build();
  if (open) return;
  open = true;
  const seen = loadSeen(); seen.add(card.id); saveSeen(seen);
  const ch = CHAPTERS.find((c) => c.id === card.chapter);
  overlay.querySelector(".spc-ch").textContent = card.title;
  overlay.querySelector(".spc-body").innerHTML = `<p class="spc-text">${esc(card.text)}</p>
    ${ch ? `<a class="spc-book" href="${esc(chapterUrl(ch.file))}" target="_blank" rel="noopener">📖 교과서 「${esc(ch.title)}」 ↗</a>` : ""}`;
  const bar = overlay.querySelector(".spc-bar"), fill = bar.querySelector("i");
  bar.hidden = false;
  fill.style.transition = "none"; fill.style.width = "100%";
  void fill.offsetWidth;
  fill.style.transition = `width ${SPEC_CARD.SHOW_SEC}s linear`; fill.style.width = "0%";
  const acts = overlay.querySelector(".spc-actions");
  acts.innerHTML = `<button type="button" class="spc-quiz">🎯 맞혀 보기 <b>🪙 +${SPEC_CARD.QUIZ_REWARD}</b></button>
    <button type="button" class="spc-skip" disabled>건너뛰기 (${SPEC_CARD.SKIP_AFTER_SEC})</button>`;
  const skip = acts.querySelector(".spc-skip");
  let left = SPEC_CARD.SKIP_AFTER_SEC;
  const tick = setInterval(() => {
    left--;
    if (left > 0) skip.textContent = `건너뛰기 (${left})`;
    else { skip.disabled = false; skip.textContent = "건너뛰기"; clearInterval(tick); }
  }, 1000);
  clearTimeout(timer);
  timer = setTimeout(() => close(), SPEC_CARD.SHOW_SEC * 1000);   // 10초 뒤 저절로 (맞혀 보기를 누르면 멈춘다)
  skip.addEventListener("click", () => { clearInterval(tick); close(); });
  acts.querySelector(".spc-quiz").addEventListener("click", () => {
    clearTimeout(timer); clearInterval(tick);
    bar.hidden = true;
    const body = overlay.querySelector(".spc-body");
    askQuestion(body, { ...hooks.drawQuestion(card.chapter), chapter: card.chapter }, (ok) => {
      if (ok) { hooks.onReward(SPEC_CARD.QUIZ_REWARD); hooks.sfx?.("correct"); } else hooks.sfx?.("wrong");
      acts.innerHTML = `<span class="spc-result">${ok ? `🪙 CR2032 +${SPEC_CARD.QUIZ_REWARD}` : "다음 카드에서 다시 도전!"}</span><button type="button" class="spc-close">닫기</button>`;
      acts.querySelector(".spc-close").addEventListener("click", close);
    });
    acts.innerHTML = "";
  });
  overlay.hidden = false;
  hooks.onOpen?.();
}

function close() {
  if (!overlay || overlay.hidden) return;
  clearTimeout(timer);
  overlay.hidden = true;
  open = false;
  hooks.onClose?.();
}
export const closeSpecCard = close;
