// 📅 오늘의 임무 창 (Stage 13.23) — 퀘스트 트래커 바로 위 버튼으로 연다 (DOM)
// 버튼에 진행도(📅 1/3), 셋 다 하면 🎁로 바뀌어 반짝. 창: 임무 3줄 + 🎁 상자 열기.

import { missionById, missionDone, dailyDone, DAILY_REWARD } from "../core/goals.js";

let btn, overlay, hooks;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** @param {{ getDaily: () => any, onClaim: () => number, onOpenChange: (open: boolean) => void }} h */
export function initDaily(h) {
  hooks = h;
  btn = document.createElement("button");
  btn.id = "btn-daily";
  btn.type = "button";
  document.body.append(btn);
  btn.addEventListener("click", () => (isDailyOpen() ? closeDaily() : openDaily()));
  overlay = document.createElement("div");
  overlay.id = "daily";
  overlay.className = "overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "오늘의 임무");
  overlay.innerHTML = `<div class="panel dl"></div>`;
  document.body.append(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) return closeDaily();
    const b = e.target instanceof Element ? e.target.closest("button[data-act]") : null;
    if (!b) return;
    if (b.dataset.act === "close") closeDaily();
    if (b.dataset.act === "claim" && hooks.onClaim() > 0) render();
  });
  window.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") { e.stopPropagation(); closeDaily(); } }, { capture: true });
  refreshDaily();
  setInterval(refreshDaily, 60000);   // 자정이 지나면 새 임무로
}

/** 버튼 표시 갱신 (진행도·상자) */
export function refreshDaily() {
  if (!btn) return;
  const d = hooks.getDaily();
  const n = d.ids.filter((id) => missionDone(d, id)).length;
  const ready = dailyDone(d) && !d.claimed;
  btn.classList.toggle("ready", ready);
  btn.classList.toggle("claimed", d.claimed);
  btn.innerHTML = ready ? `🎁 <span>상자 받기</span>` : `📅 <span>오늘의 임무 ${d.claimed ? "완료" : `${n}/${d.ids.length}`}</span>`;
  btn.setAttribute("aria-label", ready ? "오늘의 임무 완료 — 상자 받기" : `오늘의 임무 ${n}/${d.ids.length}`);
  if (overlay && !overlay.hidden) render();
}

function render() {
  const d = hooks.getDaily();
  const all = dailyDone(d);
  overlay.querySelector(".panel").innerHTML = `
    <div class="head"><div><h2>📅 오늘의 임무</h2><div class="muted">매일 새 임무 3개 · 셋 다 하면 🎁 상자 🪙 ${DAILY_REWARD}</div></div>
      <button type="button" class="close" data-act="close" aria-label="닫기">×</button></div>
    <ul class="daily-list">${d.ids.map((id) => {
      const m = missionById(id), done = missionDone(d, id), k = Math.min(d.prog[id] ?? 0, m.need);
      return `<li class="${done ? "done" : ""}"><span>${done ? "✅" : "⬜"}</span><b>${esc(m.text)}</b><small>${k}/${m.need}</small>
        <i class="daily-bar"><i style="width:${(k / m.need) * 100}%"></i></i></li>`;
    }).join("")}</ul>
    ${d.claimed ? `<p class="muted daily-done">🎁 오늘 상자는 받았어요 — 내일 새 임무가 와요</p>`
      : `<button type="button" class="lib-btn${all ? " primary" : ""} daily-chest" data-act="claim" ${all ? "" : "disabled"}>${all ? `🎁 상자 열기 (🪙 ${DAILY_REWARD})` : `🎁 셋 다 하면 상자 (🪙 ${DAILY_REWARD})`}</button>`}`;
}

export function openDaily() {
  overlay.hidden = false;
  hooks.onOpenChange(true);
  render();
  overlay.querySelector(".close")?.focus({ preventScroll: true });
}
export function closeDaily() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  hooks.onOpenChange(false);
}
export const isDailyOpen = () => Boolean(overlay && !overlay.hidden);
