// RF 랩 UI — 장비 강화 (PRD §4.4) · 레벨업 스탯 포인트 분배 (§3.3) (DOM)
// 성공률은 "링크 마진(SNR)" 막대로 보여 준다: 마진이 넉넉할수록 강화가 잘 붙는다. 실패해도 장비는 사라지지 않는다.

import { GEAR, UPGRADE, upgradeCost, upgradeSuccess, STAT_META, STAT_POINT_GAIN, STAT_CAPS, ALLOCATABLE_STATS } from "../core/balance.js";

const overlay = document.getElementById("rflab");
const panel = document.getElementById("rflab-panel");
const CHAPTER_URL = (file) => `https://yalex-kim.github.io/connectivityBook/bluetooth/chapters/${file}`;

/** @type {{ getProgress: () => any, getStats: () => Record<string, number>, onUpgrade: (piece: string) => any, onAllocate: (stat: string) => boolean, onClose: () => void }} */
let hooks;
let tab = "gear";
let lastResult = null;
let lastFocus = null;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) node.append(c);
  return node;
}
const button = (label, onClick, cls = "lib-btn") => el("button", { type: "button", class: cls, textContent: label, on: { click: onClick } });
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** 성공률 → 링크 마진 막대 (5칸) */
function marginBar(p) {
  const cells = Math.max(1, Math.round(p * 5));
  return el("span", { class: "margin", title: `성공률 ${Math.round(p * 100)}%` },
    el("span", { class: "margin-cells", textContent: "▮".repeat(cells) + "▯".repeat(5 - cells) }),
    ` 링크 마진 ${p >= 0.8 ? "넉넉" : p >= 0.5 ? "보통" : "빠듯"} · 성공률 ${Math.round(p * 100)}%`);
}

function render() {
  const p = hooks.getProgress();
  const stats = hooks.getStats();
  const tabs = el("div", { class: "lab-tabs", role: "tablist" },
    el("button", { type: "button", role: "tab", class: `lab-tab${tab === "gear" ? " on" : ""}`, "aria-selected": String(tab === "gear"), textContent: "🔧 장비 강화", on: { click: () => { tab = "gear"; lastResult = null; render(); } } }),
    el("button", { type: "button", role: "tab", class: `lab-tab${tab === "stats" ? " on" : ""}`, "aria-selected": String(tab === "stats"), textContent: `⭐ 스탯 분배${p.statPoints ? ` (${p.statPoints})` : ""}`, on: { click: () => { tab = "stats"; lastResult = null; render(); } } })
  );
  const body = tab === "gear" ? gearTab(p, stats) : statsTab(p, stats);
  panel.replaceChildren(...[
    el("div", { class: "head" },
      el("div", {}, el("h2", { textContent: "🔨 패킷 대장간 · RF 랩" }), el("div", { class: "muted", textContent: `보유 🪙 CR2032 ${p.cr2032}개 · 강화 ${p.lab.success}/${p.lab.tries}회 성공` })),
      el("button", { type: "button", class: "close", textContent: "×", "aria-label": "닫기", on: { click: close } })
    ),
    tabs,
    lastResult && el("div", { class: `lab-result ${lastResult.cls}`, role: "status", textContent: lastResult.text }),
    body
  ].flat(Infinity).filter(Boolean));
}

function gearTab(p, stats) {
  const cards = Object.entries(GEAR).map(([key, g]) => {
    const lv = p.gear[key];
    const max = lv >= UPGRADE.MAX_LEVEL;
    const cost = max ? null : upgradeCost(lv);
    const chance = max ? 0 : upgradeSuccess(lv);
    const meta = STAT_META[g.stat];
    const btn = button(max ? "최대 강화" : `강화 (🪙 ${cost})`, () => hooks.onUpgrade(key), "lib-btn primary lab-up");
    btn.dataset.piece = key;
    btn.disabled = max || p.cr2032 < cost;
    return el("div", { class: "gear-card" },
      el("div", { class: "gear-top" },
        el("div", {},
          el("b", { textContent: `${g.icon} ${g.name} +${lv}` }),
          el("div", { class: "muted", textContent: `${g.note} · ${meta.label} +${g.per}${meta.unit}/단계 (현재 ${meta.label} ${fmt(stats[g.stat])}${meta.unit})` })
        ),
        btn
      ),
      !max && marginBar(chance),
      el("div", { class: "gear-lore" }, g.lore, " ", el("a", { href: CHAPTER_URL(g.chapter), target: "_blank", rel: "noopener", textContent: "📖" }))
    );
  });
  return [
    el("p", { class: "npc", textContent: "어서 오게! CR2032를 재료로 RF 부품을 다듬어 주지. 단계가 오를수록 링크 마진이 빠듯해져 실패할 수 있지만, 실패해도 부품은 멀쩡하다네 — 재료만 날아갈 뿐." }),
    cards
  ];
}

function statsTab(p, stats) {
  const rows = ALLOCATABLE_STATS.map((k) => {
    const m = STAT_META[k];
    const gain = STAT_POINT_GAIN[k];
    const cap = STAT_CAPS[k];
    const capped = cap !== undefined && stats[k] >= cap;
    const btn = button(capped ? "상한" : `+1점 → ${m.label} +${fmt(gain)}${m.unit}`, () => hooks.onAllocate(k), "lib-btn lab-alloc");
    btn.dataset.stat = k;
    btn.disabled = p.statPoints <= 0 || capped;
    return el("div", { class: "alloc-row" },
      el("span", { textContent: `${m.icon} ${m.label} (${m.name}) ${fmt(stats[k])}${m.unit}${cap !== undefined ? ` / 상한 ${cap}${m.unit}` : ""} · 투자 ${p.alloc[k]}점` }),
      btn
    );
  });
  return [
    el("p", { class: "npc", textContent: `레벨이 오를 때마다 스탯 포인트 1점 — 장비 한 단계만큼의 힘일세. 남은 포인트: ${p.statPoints}점. 한 번 정하면 되돌릴 수 없으니 신중히!` }),
    rows,
    el("p", { class: "muted", textContent: "🔋 PWR(배터리 효율)은 스킬 배터리가 생기면 열립니다. HOP는 이동 속도(m/s)입니다." })
  ];
}

/** 강화 결과를 화면에 반영 */
export function showUpgradeResult(piece, r, before, after) {
  const g = GEAR[piece];
  const m = STAT_META[g.stat];
  if (!r.ok) lastResult = { cls: "bad", text: r.reason === "funds" ? "🪙 CR2032가 모자랍니다." : "이미 최대 강화입니다." };
  else if (r.success) lastResult = { cls: "ok", text: `✨ 성공! ${g.name} +${r.level} — ${m.label} ${fmt(before[g.stat])} → ${fmt(after[g.stat])}${m.unit} (🪙 −${r.cost})` };
  else lastResult = { cls: "bad", text: `💨 실패… 링크 마진이 모자랐다. ${g.name}은 +${r.level} 그대로, 재료 🪙 ${r.cost}개만 소모.` };
  render();
}

export function showAllocResult(stat, ok, before, after) {
  const m = STAT_META[stat];
  lastResult = ok ? { cls: "ok", text: `⭐ ${m.label} ${fmt(before[stat])} → ${fmt(after[stat])}${m.unit}` } : { cls: "bad", text: "분배할 수 없습니다." };
  render();
}

export function openRfLab() {
  lastFocus = document.activeElement;
  tab = "gear";
  lastResult = null;
  overlay.hidden = false;
  render();
  panel.querySelector(".lab-up:not(:disabled), .close")?.focus({ preventScroll: true });
}
function close() {
  overlay.hidden = true;
  hooks.onClose();
  lastFocus?.focus?.({ preventScroll: true });
}
export const isRfLabOpen = () => !overlay.hidden;

export function initRfLab(h) {
  hooks = h;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  window.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") close(); });
}
