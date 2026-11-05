// 👤 계정·설정 버튼 (Stage 13.1) — 예전 🔊 자리. 누르면 계정(로그인 상태·구글 로그인·로그아웃) + 소리 설정 + 설명서 | 🎒 가방 (Stage 13.5)
// 버튼 모양이 곧 로그인 상태: 로그인 = 이름 첫 글자 + 초록 점, 게스트 = 👤. 음소거면 작은 🔇 표시.

import * as audio from "./audio.js";
import { fillAccount, onCloudChange, accountInfo, avatarHtml } from "./cloud.js";
import { openInventory } from "./inventory.js";

let btn, pop;

function renderButton() {
  const a = accountInfo();
  const m = audio.isMuted();
  btn.classList.toggle("on", Boolean(a.name));
  btn.innerHTML = (a.name ? `${avatarHtml()}<i class="acc-dot"></i>` : `<span class="me-guest">👤</span>`)
    + (m ? `<i class="me-mute" aria-hidden="true">🔇</i>` : "");
  btn.setAttribute("aria-label", `${a.name ? `${a.name} 님 로그인됨` : "게스트 (로그인 안 됨)"} — 계정·설정${m ? " · 소리 꺼짐" : ""}`);
  btn.title = a.name ? `☁️ ${a.name} · 계정·설정` : "계정·설정 (로그인·소리)";
  btn.dataset.muted = String(m);
  if (pop && !pop.hidden) fillSound();
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function build() {
  pop = document.createElement("div");
  pop.id = "settings-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "계정·설정");
  pop.hidden = true;
  pop.innerHTML = `
    <div class="set-sec set-acc"></div>
    <div class="set-sec set-sound">
      <label class="set-row"><span>🔊 소리 <small>(M)</small></span><input type="checkbox" class="set-mute" role="switch" /></label>
      <label class="set-row"><span>🎚️ 전체</span><input type="range" class="set-vol" min="0" max="100" step="5" /></label>
      <label class="set-row"><span>🎵 음악</span><input type="range" class="set-music" min="0" max="100" step="5" /></label>
      <label class="set-row"><span>🔔 효과음</span><input type="range" class="set-fx" min="0" max="100" step="5" /></label>
    </div>
    <div class="set-btns">
      <button type="button" class="set-guide" data-action="tutorial">📘 설명서 다시 보기</button>
      <button type="button" class="set-bag">🎒 가방 보기 <small>(I)</small></button>
    </div>`;
  document.body.append(pop);
  pop.querySelector(".set-mute").addEventListener("change", (e) => { audio.setMuted(!e.target.checked); renderButton(); });
  pop.querySelector(".set-vol").addEventListener("input", (e) => audio.setVolume(e.target.value / 100));
  pop.querySelector(".set-music").addEventListener("input", (e) => audio.setMix("music", e.target.value / 100));
  pop.querySelector(".set-fx").addEventListener("input", (e) => audio.setMix("effects", e.target.value / 100));
  pop.querySelector(".set-guide").addEventListener("click", closeSettings);
  pop.querySelector(".set-bag").addEventListener("click", () => { closeSettings(); openInventory(); });
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) closeSettings();
  }, { capture: true });
  window.addEventListener("keydown", (e) => { if (!pop.hidden && e.key === "Escape") { e.stopPropagation(); closeSettings(); } }, { capture: true });
}
function fillSound() {
  pop.querySelector(".set-mute").checked = !audio.isMuted();
  const st = audio.audioState();
  pop.querySelector(".set-vol").value = Math.round(st.volume * 100);
  pop.querySelector(".set-music").value = Math.round(st.music * 100);
  pop.querySelector(".set-fx").value = Math.round(st.effects * 100);
}

export function openSettings() {
  if (!pop) build();
  pop.hidden = false;
  fillAccount(pop.querySelector(".set-acc"));
  fillSound();
}
export function closeSettings() { if (pop) pop.hidden = true; }
export const isSettingsOpen = () => Boolean(pop && !pop.hidden);

export function initSettings() {
  btn = document.getElementById("btn-me");
  btn.addEventListener("click", () => { (isSettingsOpen() ? closeSettings : openSettings)(); btn.blur(); });
  onCloudChange(renderButton);
  window.addEventListener("keydown", (e) => {
    if (e.code !== "KeyM" || e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    audio.toggleMute();
    renderButton();
  });
  renderButton();
}
