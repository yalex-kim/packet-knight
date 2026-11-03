// HUD — 상태 배지, 스탯 패널, 랜드마크 정보 모달 (DOM)

import { STAT_META, QUIZ } from "../core/balance.js";
import { levelFromXp } from "../core/combat.js";

const badge = document.getElementById("badge");
const modal = document.getElementById("info-modal");
const modalTitle = document.getElementById("modal-title");
const modalSub = document.getElementById("modal-sub");
const modalDesc = document.getElementById("modal-desc");
const modalLore = document.getElementById("modal-lore");
const modalLink = document.getElementById("modal-link");
const modalAction = document.getElementById("modal-action");
const statsPanel = document.getElementById("stats");
// 모바일: 스탯은 한 줄 요약(.st-sum)으로 접혀 있고, 누르면 펼친다 (데스크톱은 요약을 숨기고 늘 펼침)
statsPanel.addEventListener("click", () => {
  const open = statsPanel.classList.toggle("open");
  statsPanel.querySelector(".st-sum")?.setAttribute("aria-expanded", String(open));
});


document.getElementById("modal-close").addEventListener("click", hideModal);

// 조작법 접기/펼치기 (Stage 11.8) — 버튼 또는 H 키
const hudBox = document.getElementById("hud");
const helpBtn = document.getElementById("btn-help");
const helpBody = document.getElementById("hud-controls");
export function toggleHelp(open = helpBody.hidden) {
  helpBody.hidden = !open;
  hudBox.classList.toggle("open", open);
  helpBtn.setAttribute("aria-expanded", String(open));
  helpBtn.textContent = open ? "✕ 접기" : "❔ 조작법";
}
helpBtn.addEventListener("click", () => toggleHelp());
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyH" || e.repeat || e.target instanceof HTMLInputElement) return;
  if (document.querySelector(".overlay:not([hidden])")) return;
  toggleHelp();
});

let onAction = () => {};
let onLink = () => {};
modalAction.addEventListener("click", () => onAction(modalAction.dataset.action));
modalLink.addEventListener("click", () => onLink(modalLink.href));

/** 모달 액션 버튼(예: 강의실 입장)·교과서 링크 클릭 콜백 등록 */
export function setModalHandlers({ action, link }) {
  if (action) onAction = action;
  if (link) onLink = link;
}

export function setBadge(text) {
  badge.textContent = text;
}
export function getBadge() {
  return badge.textContent;
}

/** @param {import("../core/layout.js").LandmarkInfo} info */
export function showModal(info) {
  modalTitle.textContent = info.title;
  modalSub.textContent = info.sub;
  modalDesc.textContent = info.desc;
  modalLore.textContent = "📶 RF 이론: " + info.lore;
  modalLink.href = info.link;
  modalAction.hidden = !info.action;
  if (info.action) {
    modalAction.textContent = info.action.label;
    modalAction.dataset.action = info.action.id;
  }
  modal.style.display = "block";
}
export function hideModal() {
  modal.style.display = "none";
}
/** 열려 있는 모달 제목 (없으면 null) */
export function openModalTitle() {
  return modal.style.display === "block" ? modalTitle.textContent : null;
}

/**
 * 스탯 패널 갱신. changed에 든 항목("hp"…, "slots", "cr2032")은 잠깐 반짝인다.
 * @param {Record<string, number>} stats @param {{ skillSlots: number, cr2032: number, xp: number, statPoints: number }} wallet
 * @param {string[]} [changed]
 */
export function renderStats(stats, { skillSlots, cr2032, xp, statPoints }, changed = []) {
  const cells = Object.entries(STAT_META).map(([k, m]) => {
    const div = document.createElement("div");
    div.className = `stat${changed.includes(k) ? " up" : ""}`;
    div.dataset.stat = k;
    div.title = m.name;
    const b = document.createElement("b");
    b.textContent = m.label;
    div.append(`${m.icon} `, b, ` ${stats[k]}${m.unit}`);
    return div;
  });
  const slots = document.createElement("div");
  slots.className = `slots${changed.includes("slots") ? " up" : ""}`;
  slots.textContent = `🧩 스킬 슬롯 ${skillSlots}/${QUIZ.MAX_SKILL_SLOTS}`;
  const coins = document.createElement("div");
  coins.className = `slots coins${changed.includes("cr2032") ? " up" : ""}`;
  coins.dataset.stat = "cr2032";
  coins.textContent = `🪙 CR2032 ${cr2032}`;
  const lv = levelFromXp(xp);
  const level = document.createElement("div");
  level.className = `slots level${changed.includes("xp") ? " up" : ""}`;
  level.dataset.stat = "level";
  level.textContent = `⭐ Lv ${lv.level} · XP ${lv.intoLevel}/${lv.toNext}${statPoints ? ` · 포인트 ${statPoints}` : ""}`;
  const sum = document.createElement("button");
  sum.type = "button";
  sum.className = `st-sum${changed.length ? " up" : ""}`;
  sum.setAttribute("aria-expanded", String(statsPanel.classList.contains("open")));
  sum.setAttribute("aria-label", "스탯 펼치기/접기");
  sum.textContent = `${STAT_META.tx.icon} ${stats.tx} · ${STAT_META.rx.icon} ${stats.rx}${STAT_META.rx.unit} · 🪙 ${cr2032} · ⭐ Lv ${lv.level}${statPoints ? ` · ✨${statPoints}` : ""}`;
  statsPanel.replaceChildren(sum, ...cells, slots, coins, level);
}
