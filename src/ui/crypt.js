// 전력 잃은 지하묘지 — CR2032 배터리 계약 UI (Stage 10, Q8) (DOM)

import { CONTRACTS, CLOCKS, INTERVALS_MS, MAX_LATENCY, judgeContract, POWER_MODEL } from "../core/powerBudget.js";
import { chapterUrl } from "../core/book.js";

const overlay = document.getElementById("crypt");
const panel = document.getElementById("crypt-panel");

/** @type {{ onAllDone: () => void, onOpenChange: (open: boolean) => void }} */
let hooks;
let index = 0;
let setting = null;
let done = [];
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
const fmtMs = (ms) => (ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`);
const fmtLife = (y) => (y >= 1 ? `${y.toFixed(2)}년` : `${(y * 12).toFixed(1)}개월`);

function freshSetting(c) {
  return { intervalMs: c.fixedIntervalMs ?? 100, latency: 0, clock: "rc" };
}

function select(label, value, options, onChange, disabled = false) {
  const s = el("select", { class: "crypt-sel", disabled, on: { change: (e) => onChange(e.target.value) } },
    options.map(([v, t]) => el("option", { value: String(v), textContent: t, selected: String(v) === String(value) })));
  s.dataset.field = label;
  return el("label", { class: "crypt-field" }, el("span", { textContent: label }), s);
}

function render() {
  const head = el("div", { class: "head" },
    el("div", {}, el("h2", { textContent: "🪫 전력 잃은 지하묘지 — 배터리 계약" }),
      el("div", { class: "muted", textContent: `완수 ${done.length}/${CONTRACTS.length} · CR2032 ${POWER_MODEL.CAPACITY_MAH} mAh · 수면 ${POWER_MODEL.I_SLEEP_UA} µA · 이벤트 ${POWER_MODEL.Q_BASE_UC} µC` })),
    el("button", { type: "button", class: "close", textContent: "×", "aria-label": "닫기", on: { click: closeCrypt } }));
  if (index >= CONTRACTS.length) {
    panel.replaceChildren(head,
      el("div", { class: "npc", textContent: "묘지기: \"세 센서가 다시 깨어났군. 간격·지연·시계 — 전력의 손잡이를 아는 기사여, 지하묘지의 불을 켜 주어 고맙다.\" 🔋" }),
      el("div", { class: "lib-actions" }, button("닫기", closeCrypt, "lib-btn primary")));
    return;
  }
  const c = CONTRACTS[index];
  setting ??= freshSetting(c);
  const j = judgeContract(c, setting);
  const row = (ok, text) => el("li", { class: ok ? "ok" : "bad", textContent: `${ok ? "✓" : "✗"} ${text}` });
  panel.replaceChildren(head,
    el("h3", { textContent: `${c.title}` }),
    el("div", { class: "npc", textContent: `계약: ${c.desc}. 요구 — 반응 ≤ ${c.maxResponseS} s, 수명 ≥ ${c.minYears}년.` }),
    el("div", { class: "crypt-knobs" },
      select("연결 간격", setting.intervalMs, INTERVALS_MS.map((ms) => [ms, fmtMs(ms)]), (v) => { setting.intervalMs = Number(v); render(); }, Boolean(c.fixedIntervalMs)),
      select("페리페럴 지연", setting.latency, [...Array(MAX_LATENCY + 1).keys()].map((n) => [n, `${n} (이벤트 ${n}번 건너뜀)`]), (v) => { setting.latency = Number(v); render(); }),
      select("수면 시계", setting.clock, Object.entries(CLOCKS).map(([k, v]) => [k, v.label]), (v) => { setting.clock = v; render(); })),
    el("div", { class: "crypt-calc" },
      el("div", { textContent: `깨어나는 간격 T = ${fmtMs(setting.intervalMs)} × (${setting.latency} + 1) = ${j.wakeS} s` }),
      el("div", { textContent: `창 넓히기 W = ${CLOCKS[setting.clock].ppm} ppm × T + 16 µs = ${j.widenUs.toFixed(0)} µs (앞뒤 각각)` }),
      el("div", { textContent: `이벤트 전하 = ${POWER_MODEL.Q_BASE_UC} + ${POWER_MODEL.I_RX_MA} mA × 2W = ${j.chargeUc.toFixed(1)} µC` }),
      el("div", { class: "crypt-big", textContent: `평균 ${j.avgUa.toFixed(1)} µA → 수명 ${fmtLife(j.lifeYears)}` })),
    el("ul", { class: "crypt-check" },
      c.fixedIntervalMs && row(j.intervalOk, `연결 간격은 게이트웨이가 정한 ${fmtMs(c.fixedIntervalMs)}`),
      row(j.responseOk, `반응 시간 ${j.wakeS} s ≤ ${c.maxResponseS} s`),
      row(j.lifeOk, `수명 ${fmtLife(j.lifeYears)} ≥ ${c.minYears}년`)),
    el("div", { class: "muted", textContent: `💡 ${c.lesson}` }),
    el("div", { class: "lib-actions" },
      el("a", { class: "lib-btn", href: chapterUrl("power.html", "widening"), target: "_blank", rel: "noopener", textContent: "📖 교과서: 창 넓히기" }),
      (() => { const b = button(j.pass ? "✅ 계약 체결" : "조건을 맞춰라", submit, "lib-btn primary crypt-submit"); b.disabled = !j.pass; return b; })()));
}

function submit() {
  const c = CONTRACTS[index];
  if (!judgeContract(c, setting).pass) return;
  done.push(c.id);
  index++;
  setting = null;
  if (index >= CONTRACTS.length) hooks.onAllDone();
  render();
}

export function openCrypt() {
  lastFocus = document.activeElement;
  index = 0;
  setting = null;
  done = [];
  overlay.hidden = false;
  hooks.onOpenChange(true);
  render();
}
export function closeCrypt() {
  if (overlay.hidden) return;
  overlay.hidden = true;
  hooks.onOpenChange(false);
  lastFocus?.focus?.({ preventScroll: true });
}
export const isCryptOpen = () => !overlay.hidden;
/** 테스트 훅 */
export const cryptState = () => ({ index, done: [...done], setting: setting && { ...setting } });

export function initCrypt(h) {
  hooks = h;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeCrypt(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCrypt(); });
}
