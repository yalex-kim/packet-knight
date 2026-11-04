// 📮 마을 게시판 (Stage 13.15) — 광고판을 누르면: 📢 공지·이벤트 + 💬 의견·제안 보내기 (+ 관리자는 받은 의견) (DOM)
// 만든 사람(y.AI.ex) 정보는 맨 아래 한 줄로 작게. 공지는 core/notices.js, 의견은 /api/feedback (D1).

import { NOTICES, activeEvent } from "../core/notices.js";
import { accountInfo } from "./cloud.js";

const CATS = [["bug", "🐞 버그"], ["idea", "💡 제안"], ["praise", "👍 칭찬"], ["etc", "💬 기타"]];
const MAX = 500;
const TAG = { event: "🎉 이벤트", update: "🆕 업데이트", notice: "📌 공지" };
let overlay, onClose = () => {}, cat = "idea";
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function build() {
  overlay = document.createElement("div");
  overlay.id = "board";
  overlay.className = "overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "마을 게시판");
  overlay.innerHTML = `<div class="panel bd">
    <div class="bd-head"><span class="bd-pin">📮</span><div><b>마을 게시판</b><span>새 소식과 이벤트 · 의견을 남겨 주세요</span></div>
      <button type="button" class="bd-close" aria-label="닫기">×</button></div>
    <div class="bd-scroll">
      <div class="bd-hot"></div>
      <section class="bd-sec bd-fb">
        <h3>💬 의견 · 제안</h3>
        <p class="bd-hint">불편한 점, 버그, 이런 게 있으면 좋겠다는 생각 무엇이든 좋아요. 개발자에게만 보여요.</p>
        <div class="bd-cats" role="radiogroup" aria-label="종류">${CATS.map(([k, l]) => `<button type="button" role="radio" data-cat="${k}">${l}</button>`).join("")}</div>
        <textarea class="bd-text" maxlength="${MAX}" rows="4" placeholder="예) 던전 3층 전자레인지가 너무 세요 / 옷이 더 많았으면 좋겠어요"></textarea>
        <div class="bd-row"><span class="bd-who"></span><span class="bd-count">0/${MAX}</span><button type="button" class="bd-send">보내기</button></div>
        <p class="bd-status" aria-live="polite"></p>
      </section>
      <section class="bd-sec"><h3>📢 공지 · 이벤트</h3><div class="bd-notices"></div></section>
      <section class="bd-sec bd-admin" hidden><h3>🔒 받은 의견 (관리자)</h3><div class="bd-inbox"></div></section>
    </div>
    <a class="bd-credit" href="https://home.yalex-k.com/" target="_blank" rel="noopener">
      <img src="./src/assets/yalex-mark-v1.webp" alt="" width="20" height="20" />만든 사람 <b>y.AI.ex</b> · home.yalex-k.com ↗</a>
  </div>`;
  document.body.append(overlay);
  overlay.querySelector(".bd-close").addEventListener("click", closeBoard);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeBoard(); });
  window.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") { e.stopPropagation(); closeBoard(); } }, { capture: true });
  overlay.querySelectorAll(".bd-cats button").forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; renderCats(); }));
  const ta = overlay.querySelector(".bd-text");
  ta.addEventListener("input", () => { overlay.querySelector(".bd-count").textContent = `${[...ta.value].length}/${MAX}`; });
  // 입력 중 키(WASD·M·I 등)가 게임으로 새지 않게
  ta.addEventListener("keydown", (e) => { if (e.key !== "Escape") e.stopPropagation(); });
  overlay.querySelector(".bd-send").addEventListener("click", send);
}
function renderCats() {
  overlay.querySelectorAll(".bd-cats button").forEach((b) => { const on = b.dataset.cat === cat; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
}
const noteHtml = (n, hot) => `<article class="bd-note ${n.tag}${hot ? " hot open" : ""}" tabindex="0">
    <div class="bd-note-head"><span class="bd-tag">${TAG[n.tag] ?? ""}</span><b>${esc(n.title)}</b><time>${esc(n.date.slice(5).replace("-", "."))}</time></div>
    <p>${esc(n.body)}</p></article>`;
/** 진행 중인 이벤트는 맨 위(의견 칸보다 위)에 펼쳐서, 나머지 소식은 의견 칸 아래에 두 줄로 접어서 (누르면 펼침) */
function renderNotices() {
  const ev = activeEvent();
  overlay.querySelector(".bd-hot").innerHTML = ev ? noteHtml(ev, true) : "";
  overlay.querySelector(".bd-notices").innerHTML = NOTICES.filter((n) => n !== ev).map((n) => noteHtml(n, false)).join("");
  overlay.querySelectorAll(".bd-note:not(.hot)").forEach((a) => a.addEventListener("click", () => a.classList.toggle("open")));
}
async function send() {
  const ta = overlay.querySelector(".bd-text"), st = overlay.querySelector(".bd-status"), btn = overlay.querySelector(".bd-send");
  const body = ta.value.trim();
  if (!body) { st.textContent = "내용을 적어 주세요."; return; }
  btn.disabled = true;
  st.textContent = "보내는 중…";
  try {
    const r = await fetch("/api/feedback", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: cat, body }) });
    if (r.status === 429) st.textContent = "조금 뒤에 다시 보내 주세요 (한 시간에 다섯 번까지).";
    else if (!r.ok) throw new Error(r.status);
    else { ta.value = ""; overlay.querySelector(".bd-count").textContent = `0/${MAX}`; st.textContent = "고마워요! 잘 받았어요 📮"; refreshInbox(); }
  } catch {
    st.textContent = "지금은 보낼 수 없어요. 잠시 뒤에 다시 해 주세요.";
  } finally { btn.disabled = false; }
}
async function refreshInbox() {
  const sec = overlay.querySelector(".bd-admin");
  if (!accountInfo().admin) { sec.hidden = true; return; }
  sec.hidden = false;
  const box = overlay.querySelector(".bd-inbox");
  try {
    const r = await fetch("/api/feedback", { credentials: "same-origin" });
    if (!r.ok) throw new Error(r.status);
    const { items } = await r.json();
    const label = Object.fromEntries(CATS);
    box.innerHTML = items.length ? items.map((f) => `<div class="bd-fbi"><span>${label[f.category] ?? f.category}</span><time>${new Date(f.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><b>${esc(f.name ?? "익명")}</b><p>${esc(f.body)}</p></div>`).join("") : `<p class="bd-hint">아직 받은 의견이 없어요.</p>`;
  } catch { box.innerHTML = `<p class="bd-hint">불러오지 못했어요.</p>`; }
}

export function openBoard(close = () => {}) {
  if (!overlay) build();
  onClose = close;
  renderCats();
  renderNotices();
  const a = accountInfo();
  overlay.querySelector(".bd-who").textContent = a.name ? `${a.name} 님 이름으로 보내져요` : "익명으로 보내져요";
  overlay.querySelector(".bd-status").textContent = "";
  overlay.hidden = false;
  overlay.querySelector(".bd-scroll").scrollTop = 0;
  refreshInbox();
}
export function closeBoard() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  onClose();
}
export const isBoardOpen = () => Boolean(overlay && !overlay.hidden);
