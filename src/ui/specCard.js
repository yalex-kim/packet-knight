// 🎯 문제 하나 (Stage 13.12·13.14) — 💡 주민 이야기의 맞혀 볼래, 알바 정산의 🎓 2배 받기가 같이 쓴다 (DOM)
// (13.12의 "8분마다 뜨는 스펙 카드" 창은 13.14에서 주민 이야기로 바뀌어 없앴다)

import { CHAPTERS } from "../core/chapters.data.js";
import { chapterUrl } from "../core/book.js";

const SEEN_KEY = "packetKnight.specSeen";
/** 이미 들은 스펙 카드 id (같은 이야기가 되풀이되지 않게) */
export const loadSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")); } catch { return new Set(); } };
export function markSeen(id) { const s = loadSeen(); s.add(id); try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch { /* 무시 */ } }

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const chapterTitle = (id) => CHAPTERS.find((c) => c.id === id)?.title ?? id;
/** 문제의 장 제목 = 교과서 그 장 링크 (Stage 13.19 — 틀렸을 때 바로 읽으러 가게) */
const chapterHref = (id) => { const ch = CHAPTERS.find((c) => c.id === id); return ch ? chapterUrl(ch.file) : "#"; };

/**
 * 문제 하나를 box 안에 그린다. 답을 고르면 정답·해설을 보여 주고 onDone(correct) — 한 번만 고를 수 있다.
 * @param {HTMLElement} box @param {{ q: string, options: string[], answer: number, explain: string, chapter?: string }} q
 */
export function askQuestion(box, q, onDone) {
  box.innerHTML = `<div class="sq">
    ${q.chapter ? `<a class="sq-ch" href="${esc(chapterHref(q.chapter))}" target="_blank" rel="noopener" title="교과서에서 이 장 열기 (새 탭)">📖 ${esc(chapterTitle(q.chapter))} ↗</a>` : ""}
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
