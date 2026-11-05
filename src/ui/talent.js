// 🌟 특성 고르기 (Stage 13.32) — 5레벨마다 화면 왼쪽(오늘의 임무 위)에 반짝이는 버튼, 누르면 셋 중 하나 (DOM)
// 전투를 끊지 않도록 레벨 업 때 창을 바로 띄우지 않는다 — 버튼으로 원할 때 고른다.

import { TALENTS, talentById, talentOffer, pendingTalents } from "../core/talents.js";
import { TALENT } from "../core/balance.js";

let btn, overlay, hooks;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** @param {{ getProgress: () => any, onChoose: (id: string) => any, onOpenChange: (open: boolean) => void }} h */
export function initTalent(h) {
  hooks = h;
  btn = document.createElement("button");
  btn.id = "btn-talent";
  btn.type = "button";
  btn.hidden = true;
  document.body.append(btn);
  btn.addEventListener("click", () => (isTalentOpen() ? closeTalent() : openTalent()));
  overlay = document.createElement("div");
  overlay.id = "talent";
  overlay.className = "overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "특성 고르기");
  overlay.innerHTML = `<div class="panel tl"></div>`;
  document.body.append(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) return closeTalent();
    const b = e.target instanceof Element ? e.target.closest("[data-act]") : null;
    if (!b) return;
    if (b.dataset.act === "close") return closeTalent();
    if (b.dataset.act === "pick" && hooks.onChoose(b.dataset.id)) {
      refreshTalent();
      if (pendingTalents(hooks.getProgress()) > 0) render(); else closeTalent();
    }
  });
  window.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") { e.stopPropagation(); closeTalent(); } }, { capture: true });
  refreshTalent();
}

/** 버튼 표시 (고를 것이 있을 때만) */
export function refreshTalent() {
  if (!btn) return;
  const n = pendingTalents(hooks.getProgress());
  btn.hidden = n <= 0;
  btn.innerHTML = `🌟 <span>특성 고르기${n > 1 ? ` ×${n}` : ""}</span>`;
  btn.setAttribute("aria-label", `특성 고르기 ${n}번 남음`);
}

function render() {
  const p = hooks.getProgress();
  const n = p.talents.length, offer = talentOffer(n).map(talentById);
  const mine = p.talents.map(talentById).filter(Boolean);
  const count = (id) => p.talents.filter((x) => x === id).length;
  overlay.querySelector(".panel").innerHTML = `
    <div class="head"><div><h2>🌟 특성 고르기</h2><div class="muted">Lv ${(n + 1) * TALENT.EVERY} 특성 · ${TALENT.EVERY}레벨마다 셋 중 하나 · 같은 것도 다시 고르면 쌓여요</div></div>
      <button type="button" class="close" data-act="close" aria-label="닫기">×</button></div>
    <div class="tl-cards">${offer.map((t) => `<button type="button" class="tl-card ${t.kind}" data-act="pick" data-id="${t.id}">
      <span class="tl-ico">${t.icon}</span><b>${esc(t.name)}</b><span>${esc(t.desc)}</span>${count(t.id) ? `<small>지금 ${count(t.id)}개</small>` : ""}</button>`).join("")}</div>
    ${mine.length ? `<p class="muted tl-mine">고른 특성: ${mine.map((t) => `${t.icon} ${esc(t.name)}`).join(" · ")}</p>` : ""}`;
}

export function openTalent() {
  if (pendingTalents(hooks.getProgress()) <= 0) return;
  overlay.hidden = false;
  hooks.onOpenChange(true);
  render();
}
export function closeTalent() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  hooks.onOpenChange(false);
}
export const isTalentOpen = () => Boolean(overlay && !overlay.hidden);
export { TALENTS };
