// 상점 창 (Stage 12.2) — 무기점·옷가게 공용 (DOM). 규칙은 core/shop.js
import { WEAPONS, OUTFITS, buy, equip, weaponById } from "../core/shop.js";
import { COMBAT } from "../core/balance.js";
import { chapterUrl } from "../core/book.js";

let overlay, panel, hooks, kind = "weapon", note = null;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function build() {
  overlay = document.createElement("div");
  overlay.id = "shop";
  overlay.className = "overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.hidden = true;
  overlay.innerHTML = `<div class="panel shop-panel"></div>`;
  document.body.append(overlay);
  panel = overlay.querySelector(".panel");
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeShop(); });
  panel.addEventListener("click", (e) => {
    const b = e.target instanceof Element ? e.target.closest("button[data-act]") : null;
    if (!b) return;
    const { act, id } = b.dataset;
    if (act === "close") return closeShop();
    const p = hooks.getProgress();
    if (act === "buy") {
      const r = buy(p, kind, id);
      note = r.ok ? { ok: true, text: "구매 완료 — 바로 장착했어요!" } : { ok: false, text: r.reason === "funds" ? "🪙 CR2032가 모자라요. 등대 알바·던전에서 모아 오세요." : "이미 가지고 있어요." };
      if (r.ok) hooks.onChange(kind);
    } else if (act === "equip") {
      equip(p, kind, id);
      note = { ok: true, text: "장착했어요." };
      hooks.onChange(kind);
    }
    render();
  });
  window.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") { e.stopPropagation(); closeShop(); } }, { capture: true });
}

function weaponStats(w) {
  const cd = (COMBAT.ADV_PACKET.cooldown * w.cooldownMul).toFixed(2);
  const range = Math.round(COMBAT.ADV_PACKET.range * w.rangeMul);
  return `피해 ×${w.coef}${w.spread.length > 1 ? ` × ${w.spread.length}발` : ""} · 쿨타임 ${cd}초 · 사거리 ${range} m`;
}

function render() {
  const p = hooks.getProgress();
  const shop = p.shop;
  const isW = kind === "weapon";
  const list = isW ? WEAPONS : OUTFITS;
  const owned = isW ? shop.weapons : shop.outfits;
  const current = isW ? shop.weapon : shop.outfit;
  panel.innerHTML = `
    <div class="head"><div><h2>${isW ? "⚔️ 패킷 무기점" : "👘 스펙트럼 옷가게"}</h2>
      <div class="muted">보유 🪙 CR2032 <b>${p.cr2032}</b>개 · ${isW ? "무기는 쏘는 방식이 달라요" : "옷은 외형만 바뀌어요 (능력치 그대로)"}</div></div>
      <button type="button" class="close" data-act="close" aria-label="닫기">×</button></div>
    ${note ? `<p class="shop-note ${note.ok ? "ok" : "bad"}">${esc(note.text)}</p>` : ""}
    <div class="shop-grid">${list.map((it) => {
      const have = owned.includes(it.id), on = current === it.id;
      const btn = on ? `<button type="button" class="lib-btn" disabled>✓ 장착 중</button>`
        : have ? `<button type="button" class="lib-btn" data-act="equip" data-id="${it.id}">장착</button>`
        : `<button type="button" class="lib-btn primary" data-act="buy" data-id="${it.id}" ${p.cr2032 < it.price ? "disabled" : ""}>🪙 ${it.price} 사기</button>`;
      const swatch = isW ? "" : `<span class="shop-swatch" style="background:#${it.tabard.toString(16).padStart(6, "0")};border-color:#${it.plume.toString(16).padStart(6, "0")}"></span>`;
      return `<div class="shop-item${on ? " on" : ""}" data-id="${it.id}">
        <div class="shop-top"><img class="shop-item-ico" src="./src/assets/items/item-${it.id}-v1.webp" alt="" width="256" height="256" loading="lazy" />${swatch}<b>${esc(it.name)}</b></div>
        <p>${esc(it.desc)}</p>
        ${isW ? `<p class="shop-stats">${weaponStats(it)}</p><p class="shop-lore">📖 ${esc(it.lore)} <a href="${chapterUrl(it.chapter)}" target="_blank" rel="noopener">교과서 ↗</a></p>` : ""}
        <div class="shop-buy">${btn}</div></div>`;
    }).join("")}</div>`;
}

/** @param {{ getProgress: () => any, onChange: (kind: string) => void, onOpenChange: (open: boolean) => void }} h */
export function initShop(h) { hooks = h; }
export function openShop(which) {
  if (!overlay) build();
  kind = which;
  note = null;
  overlay.hidden = false;
  hooks.onOpenChange(true);
  render();
  panel.querySelector(".close")?.focus({ preventScroll: true });
}
export function closeShop() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  hooks.onOpenChange(false);
}
export const isShopOpen = () => Boolean(overlay && !overlay.hidden);
export { weaponById };
