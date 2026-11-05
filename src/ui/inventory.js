// 가방 (Stage 12.4, PRD §4.7) — 🎒 버튼·I 키. 기사 미리보기 + 장착 칸(무기·옷) + 가진 무기·옷 바꿔 끼기 +
// RF 부품 단계·능력치 + 소지품(CR2032·완독 배지·도감). 경제 영향 없음 — 장착은 core/shop.js equip
import { WEAPONS, OUTFITS, equip, weaponById, outfitById } from "../core/shop.js";
import { ACHIEVEMENTS } from "../core/goals.js";
import { ITEMS } from "../core/items.js";
import { GEAR, STAT_META, MONSTERS, COMBAT } from "../core/balance.js";
import { badges } from "../core/quests.js";
import { CHAPTERS } from "../core/chapters.data.js";
import { startPreview, stopPreview } from "../render/knightPreview.js";

export const itemIcon = (id) => `./src/assets/items/item-${id}-v1.webp`;
let overlay, panel, hooks, tab = "gear";
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const img = (id, alt, cls = "inv-ico") => `<img class="${cls}" src="${itemIcon(id)}" alt="${esc(alt)}" width="256" height="256" loading="lazy" />`;

function build() {
  overlay = document.createElement("div");
  overlay.id = "inventory";
  overlay.className = "overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "가방");
  overlay.hidden = true;
  overlay.innerHTML = `<div class="panel inv-panel"></div>`;
  document.body.append(overlay);
  panel = overlay.querySelector(".panel");
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeInventory(); });
  panel.addEventListener("click", (e) => {
    const b = e.target instanceof Element ? e.target.closest("[data-act]") : null;
    if (!b) return;
    const { act, kind, id } = b.dataset;
    if (act === "close") return closeInventory();
    if (act === "tab") { tab = id; itemNote = ""; return render(); }
    if (act === "use") { itemNote = hooks.onUseItem?.(id) ?? ""; return render(); }
    if (act === "equip") { if (equip(hooks.getProgress(), kind, id)) { hooks.onChange(); render(true); } }
  });
  window.addEventListener("keydown", (e) => {
    if (!overlay.hidden && e.key === "Escape") { e.stopPropagation(); closeInventory(); }
  }, { capture: true });
}

function gearTab(p) {
  const sh = p.shop;
  const w = weaponById(sh.weapon), o = outfitById(sh.outfit);
  const card = (kind, it, on) => `<button type="button" class="inv-item${on ? " on" : ""}" data-act="equip" data-kind="${kind}" data-id="${it.id}" ${on ? "aria-pressed=\"true\"" : ""} title="${esc(it.desc)}">
      ${img(it.id, it.name)}<span>${esc(it.name)}</span>${on ? "<i>장착</i>" : ""}</button>`;
  const ownedW = WEAPONS.filter((x) => sh.weapons.includes(x.id)), ownedO = OUTFITS.filter((x) => sh.outfits.includes(x.id));
  return `
    <div class="inv-equip">
      <canvas class="inv-preview" aria-label="기사 미리보기"></canvas>
      <div class="inv-slots">
        <div class="inv-slot">${img(w.id, w.name, "inv-slot-ico")}<div><small>무기</small><b>${esc(w.name)}</b>
          <span>피해 ×${w.coef}${w.spread.length > 1 ? ` × ${w.spread.length}발` : ""} · 쿨타임 ${(COMBAT.ADV_PACKET.cooldown * w.cooldownMul).toFixed(2)}초 · 사거리 ${Math.round(COMBAT.ADV_PACKET.range * w.rangeMul)} m</span></div></div>
        <div class="inv-slot">${img(o.id, o.name, "inv-slot-ico")}<div><small>옷</small><b>${esc(o.name)}</b><span>${esc(o.desc)}</span></div></div>
      </div>
    </div>
    <h3>⚔️ 가진 무기 <small>${ownedW.length}/${WEAPONS.length} — 눌러서 바꿔 끼기</small></h3>
    <div class="inv-grid">${ownedW.map((x) => card("weapon", x, x.id === sh.weapon)).join("")}</div>
    <h3>👘 가진 옷 <small>${ownedO.length}/${OUTFITS.length}</small></h3>
    <div class="inv-grid">${ownedO.map((x) => card("outfit", x, x.id === sh.outfit)).join("")}</div>
    ${ownedW.length < WEAPONS.length || ownedO.length < OUTFITS.length ? `<p class="muted">더 많은 무기·옷은 북서쪽 상점가(⚔️ 무기점·👘 옷가게)에서.</p>` : ""}`;
}

function rfTab(p, stats) {
  const rows = Object.entries(GEAR).map(([k, g]) => {
    const lv = p.gear?.[k] ?? 0;
    return `<div class="inv-row"><span class="inv-row-ico">${g.icon}</span><div><b>${esc(g.name)} +${lv}</b><small>${esc(g.note)}</small></div>
      <div class="inv-lv">${Array.from({ length: 6 }, (_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</div></div>`;
  }).join("");
  const st = Object.entries(STAT_META).map(([k, m]) => `<span class="inv-stat">${m.icon} <b>${m.label}</b> ${stats[k]}${m.unit}</span>`).join("");
  return `<h3>🔧 RF 부품 <small>패킷 대장간 RF 랩에서 강화</small></h3>${rows}
    <h3>📊 지금 능력치</h3><div class="inv-stats">${st}</div>
    ${p.statPoints ? `<p class="inv-note">✨ 분배하지 않은 스탯 포인트 ${p.statPoints}점 — 패킷 대장간 RF 랩에서</p>` : ""}`;
}

/** 🧪 소모품 (Stage 13.22) — 가진 것만, 누르면 쓴다 */
function itemsHtml(p) {
  const bag = p.items?.bag ?? {};
  const have = ITEMS.filter((it) => bag[it.id] > 0);
  return `<h3>🧪 소모품 <small>${have.reduce((n, it) => n + bag[it.id], 0)}개</small></h3>
    ${have.length ? `<div class="inv-items">${have.map((it) => `<div class="inv-it"><span>${it.icon}</span><div><b>${esc(it.name)} ×${bag[it.id]}</b><small>${esc(it.desc)}</small></div>
      <button type="button" class="lib-btn" data-act="use" data-id="${it.id}">쓰기</button></div>`).join("")}</div>`
      : `<p class="muted">무기점의 🧪 소모품 칸에서 살 수 있어요. 🍎 사과는 비밀의 사과나무에서 하루 한 번.</p>`}
    ${itemNote ? `<p class="inv-note">${esc(itemNote)}</p>` : ""}`;
}
let itemNote = "";

/** 🏅 업적 (Stage 13.20) */
function achievementsHtml(p) {
  const got = p.goals?.ach ?? {};
  const n = ACHIEVEMENTS.filter((a) => got[a.id]).length;
  return `<h3>🏅 업적 <small>${n}/${ACHIEVEMENTS.length}</small></h3>
    <div class="inv-ach">${ACHIEVEMENTS.map((a) => `<div class="${got[a.id] ? "on" : ""}" title="${esc(a.desc)}"><span>${got[a.id] ? a.icon : "🔒"}</span><b>${esc(a.title)}</b><small>${esc(a.desc)}${got[a.id] ? ` · ${esc(got[a.id].slice(5).replace("-", "."))}` : ` · 🪙 ${a.reward}`}</small></div>`).join("")}</div>`;
}

function bagTab(p) {
  const got = new Set(badges(p.quests));
  const scanned = Object.keys(p.bestiary ?? {});
  return `
    <div class="inv-coins"><span>🪙</span><div><b>CR2032 ${p.cr2032}개</b><small>던전 입장료·RF 강화·상점에 쓴다. 등대 알바·던전에서 번다.</small></div></div>
    ${itemsHtml(p)}
    ${achievementsHtml(p)}
    <h3>📖 완독 배지 <small>${got.size}/${CHAPTERS.length}</small></h3>
    <div class="inv-badges">${CHAPTERS.map((c) => `<span class="${got.has(c.id) ? "on" : ""}" title="${esc(c.title)}">${got.has(c.id) ? "📖" : "▫️"} ${esc(c.title.split(":")[0])}</span>`).join("")}</div>
    <h3>🔍 도감 <small>${scanned.length}/${Object.keys(MONSTERS).length}</small></h3>
    <div class="inv-dex">${Object.entries(MONSTERS).map(([id, m]) => {
      const seen = scanned.includes(id);
      const face = id === "trainingBot" ? "" : `<img src="./src/assets/monsters/mon-${id}-v1.webp" alt="" width="256" height="256" loading="lazy" />`;
      return `<div class="inv-mon${seen ? "" : " unseen"}">${face || "<span class=\"inv-mon-emoji\">🤖</span>"}<b>${seen ? esc(m.name) : "???"}</b><small>${seen ? `${esc(m.role)} · 처치 ${p.bestiary[id]?.kills ?? 0}` : "아직 못 만났다"}</small></div>`;
    }).join("")}</div>`;
}

function render(keepPreview = false) {
  const p = hooks.getProgress(), stats = hooks.getStats();
  const tabs = [["gear", "🛡️ 장비"], ["rf", "🔧 RF·능력치"], ["bag", "🎒 소지품"]];
  panel.innerHTML = `
    <div class="head"><div><h2>🎒 가방</h2><div class="muted">I 키로 열고 닫기</div></div>
      <button type="button" class="close" data-act="close" aria-label="닫기">×</button></div>
    <div class="inv-tabs" role="tablist">${tabs.map(([id, l]) => `<button type="button" role="tab" class="inv-tab${tab === id ? " on" : ""}" data-act="tab" data-id="${id}" aria-selected="${tab === id}">${l}</button>`).join("")}</div>
    <div class="inv-body">${tab === "gear" ? gearTab(p) : tab === "rf" ? rfTab(p, stats) : bagTab(p)}</div>`;
  const cv = panel.querySelector(".inv-preview");
  if (cv) startPreview(cv); else stopPreview();
  void keepPreview;
}

/** @param {{ getProgress: () => any, getStats: () => any, onChange: () => void, onOpenChange: (open: boolean) => void }} h */
export function initInventory(h) {
  hooks = h;
  window.addEventListener("keydown", (e) => {
    if (e.code !== "KeyI" || e.repeat || e.target instanceof HTMLInputElement) return;
    if (overlay && !overlay.hidden) return closeInventory();
    if (document.querySelector(".overlay:not([hidden])")) return;
    openInventory();
  });
}
export function openInventory(which) {
  if (!overlay) build();
  if (which) tab = which;
  overlay.hidden = false;
  hooks.onOpenChange(true);
  render();
  panel.querySelector(".close")?.focus({ preventScroll: true });
}
export function closeInventory() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  stopPreview();
  hooks.onOpenChange(false);
}
export const isInventoryOpen = () => Boolean(overlay && !overlay.hidden);
