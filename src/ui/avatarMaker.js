// 🪞 나의 기사 만들기 (Stage 13.34) — 닉네임 + 남·여 기사. 처음 한 번 저절로 뜨고, 계정·설정 창에서 언제든 다시 (DOM)
// 성별을 누르면 그 기사 모델을 불러와 바로 미리보기. 닉네임은 로그인하면 랭킹·게시판 이름이 된다.

import { GENDERS, NAME_MAX, NAME_MIN, cleanName } from "../core/look.js";
import { startPreview, stopPreview } from "../render/knightPreview.js";

let overlay, hooks, picked = "m";
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** @param {{ getLook: () => { name: string, gender: string, made: boolean }, onGender: (g: string) => Promise<void>, onDone: (look: { name: string, gender: string }) => void, onOpenChange: (open: boolean) => void }} h */
export function initAvatarMaker(h) {
  hooks = h;
  overlay = document.createElement("div");
  overlay.id = "maker";
  overlay.className = "overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "나의 기사 만들기");
  overlay.innerHTML = `<div class="panel mk">
    <div class="head"><div><h2>🪞 나의 기사</h2><div class="muted">닉네임과 기사를 골라 주세요 · 나중에 👤 설정에서 바꿀 수 있어요</div></div>
      <button type="button" class="close" data-act="close" aria-label="닫기">×</button></div>
    <div class="mk-body">
      <div class="mk-stage"><canvas class="mk-knight" width="180" height="230" aria-hidden="true"></canvas><p class="mk-loading muted" hidden>기사를 부르는 중…</p></div>
      <div class="mk-form">
        <label class="mk-label" for="mk-name">닉네임 <small>(${NAME_MIN}~${NAME_MAX}자)</small></label>
        <input id="mk-name" class="mk-name" type="text" maxlength="${NAME_MAX}" autocomplete="nickname" placeholder="예) 패킷용사" />
        <p class="mk-err" aria-live="polite"></p>
        <div class="mk-label">기사</div>
        <div class="mk-genders" role="radiogroup" aria-label="기사">${GENDERS.map((g) => `<button type="button" role="radio" data-gender="${g.id}">${g.id === "f" ? "👩" : "👦"} ${esc(g.label)}</button>`).join("")}</div>
        <button type="button" class="lib-btn primary mk-done" data-act="done">✅ 이 기사로 할래요</button>
      </div>
    </div>
  </div>`;
  document.body.append(overlay);
  const input = overlay.querySelector(".mk-name");
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(); else if (e.key !== "Escape") e.stopPropagation(); });   // 입력 중 키가 게임으로 새지 않게
  overlay.addEventListener("click", (e) => {
    const b = e.target instanceof Element ? e.target.closest("button") : null;
    if (!b) return;
    if (b.dataset.act === "close") return closeAvatarMaker();
    if (b.dataset.act === "done") return done();
    if (b.dataset.gender) pick(b.dataset.gender);
  });
  window.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") { e.stopPropagation(); closeAvatarMaker(); } }, { capture: true });
}

function renderGender() {
  overlay.querySelectorAll(".mk-genders button").forEach((b) => { const on = b.dataset.gender === picked; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
}
async function pick(g) {
  picked = g === "f" ? "f" : "m";
  renderGender();
  const load = overlay.querySelector(".mk-loading");
  load.hidden = false;
  try { await hooks.onGender(picked); } catch { /* 못 불러오면 지금 모습 그대로 */ }
  load.hidden = true;
  if (!overlay.hidden) startPreview(overlay.querySelector(".mk-knight"));
}
function done() {
  const raw = overlay.querySelector(".mk-name").value;
  const name = cleanName(raw);
  const err = overlay.querySelector(".mk-err");
  if (raw.trim() && !name) { err.textContent = `닉네임은 ${NAME_MIN}~${NAME_MAX}자, 기호·나쁜 말 없이 지어 주세요.`; return; }
  hooks.onDone({ name, gender: picked });
  closeAvatarMaker(true);
}

let onClosed = null;
/** @param {() => void} [after] 창이 닫힌 뒤 (처음 만들기 → 설명서) */
export function openAvatarMaker(after = null) {
  const look = hooks.getLook();
  picked = look.gender;
  onClosed = after;
  overlay.querySelector(".mk-name").value = look.name ?? "";
  overlay.querySelector(".mk-err").textContent = "";
  renderGender();
  overlay.hidden = false;
  hooks.onOpenChange(true);
  startPreview(overlay.querySelector(".mk-knight"));
}
export function closeAvatarMaker(saved = false) {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  stopPreview();
  const cv = overlay.querySelector(".mk-knight");
  cv.replaceWith(cv.cloneNode());   // 컨텍스트를 놓아 준 캔버스는 다시 못 쓴다
  if (!saved) hooks.onDone(null);
  hooks.onOpenChange(false);
  const f = onClosed; onClosed = null; f?.();
}
export const isAvatarMakerOpen = () => Boolean(overlay && !overlay.hidden);
export const makerState = () => ({ open: isAvatarMakerOpen(), picked, name: overlay?.querySelector(".mk-name").value ?? "" });
