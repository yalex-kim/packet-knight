// 호핑 던전 UI — 입장 패널, 링크 정비 콘솔(채널맵 퍼즐), 던전 상단 바 (DOM)

import { DUNGEON } from "../core/balance.js";
import { DATA_CHANNELS, MIN_USED_CHANNELS, usedChannels, dataChannelFreq } from "../core/hopping.js";
import { LINK, wifiCountFor, interferenceSummary } from "../core/dungeon.js";
import { chapterUrl } from "../core/book.js";

const overlay = document.getElementById("dungeon");
const panel = document.getElementById("dungeon-panel");
const hudBar = document.getElementById("dungeon-hud");
const HOPPING_URL = chapterUrl("hopping.html");

/**
 * @type {{
 *   onEnter: () => void, onLeave: () => void, onClose: () => void,
 *   onToggle: (ch: number) => void, onReset: () => void, onTest: () => void, onObserve: (on: boolean) => void, onRollback: () => void,
 *   getProgress: () => any
 * }}
 */
let hooks;
let mode = null; // "entry" | "console" | "portal" | "timeout"
let consoleView = null;

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

function render(...nodes) {
  panel.replaceChildren(...nodes.flat(Infinity).filter((n) => n != null && n !== false));
  panel.scrollTop = 0;
  (panel.querySelector(".lib-btn.primary:not(:disabled)") ?? panel.querySelector(".lib-btn"))?.focus({ preventScroll: true });
}
function header(title, sub) {
  return el("div", { class: "head" },
    el("div", {}, el("h2", { textContent: title }), sub && el("div", { class: "muted", textContent: sub })),
    el("button", { type: "button", class: "close", textContent: "×", "aria-label": "닫기", on: { click: close } })
  );
}

// ---------- 입장 패널 (마을 관문 / 층 클리어 후 포털) ----------
/** @param {{ floor: number, fromPortal: boolean }} opts */
export function openEntry({ floor, fromPortal }) {
  mode = fromPortal ? "portal" : "entry";
  overlay.hidden = false;
  const p = hooks.getProgress();
  const canPay = p.cr2032 >= DUNGEON.ENTRY_FEE;
  const best = p.dungeon.maxFloor;
  const stars = p.dungeon.stars[String(floor)] ?? 0;
  const enter = button(canPay ? `⚔️ ${floor}층 도전 (CR2032 ${DUNGEON.ENTRY_FEE}개)` : `🪙 CR2032가 모자랍니다 (${p.cr2032}/${DUNGEON.ENTRY_FEE})`, () => hooks.onEnter(), "lib-btn primary dungeon-enter");
  enter.disabled = !canPay;
  render(
    header(fromPortal ? "🌀 다음 층 포털" : "⚔️ 37채널 호핑 던전", fromPortal ? `${floor - 1}층 클리어!` : `최고 기록 ${best}층`),
    el("p", { class: "npc", textContent: fromPortal
      ? "링크가 안정됐다! 더 깊은 층의 Wi-Fi 간섭은 더 질기다네. 계속 내려가겠나, 마을로 돌아가 장비를 손보겠나?"
      : "이 아래는 37개 데이터 채널로 이어진 지하. 층마다 Wi-Fi 간섭 몬스터를 쓰러뜨리고, 링크 콘솔에서 채널맵을 고쳐 연결을 안정시켜야 다음 층이 열린다네." }),
    el("ul", {},
      el("li", { textContent: `${floor}층: Wi-Fi 간섭 몬스터 ${DUNGEON.FLOOR_MONSTERS}마리 (체력 ×${(1 + DUNGEON.FLOOR_HP_SCALE * (floor - 1)).toFixed(2)}), 숨은 Wi-Fi 공유기 ${wifiCountFor(floor)}대` }),
      el("li", { textContent: "광역 공격 예고: 바닥에 빨간 원이 차오르면 원 밖으로! (광역은 회피율(RX)로 못 피한다)" }),
      el("li", { textContent: "쓰러지면 Connection Timeout — 마을로 재연결되고 보유 CR2032의 10%를 잃는다." }),
      el("li", { textContent: `입장료 CR2032 ${DUNGEON.ENTRY_FEE}개 · 보유 ${p.cr2032}개${stars ? ` · 이 층 최고 ★${stars}` : ""}` })
    ),
    el("div", { class: "lib-actions" },
      button(fromPortal ? "🏃 마을로 귀환" : "닫기", fromPortal ? () => { close(); hooks.onLeave(); } : close),
      enter
    )
  );
}

// ---------- Connection Timeout (Stage 8) ----------
/** @param {{ floor: number, lost: number, rollbacks: number }} info */
export function openTimeout({ floor, lost, rollbacks }) {
  mode = "timeout";
  overlay.hidden = false;
  render(
    el("div", { class: "head" }, el("div", {}, el("h2", { textContent: "📶 Connection Timeout" }), el("div", { class: "muted", textContent: "supervision timeout — 연결 감독 시간 안에 패킷이 오가지 않았다" }))),
    el("p", { class: "npc", textContent: `${floor}층에서 연결이 끊겼네. 게임오버는 없다 — 마지막으로 연결이 안정적이던 순간(층 시작 체크포인트)으로 재연결할 수 있지. 전력 누수로 CR2032 ${lost}개를 잃었다네.` }),
    el("p", { class: "muted", textContent: `BLE에서도 감독 타임아웃(100 ms ~ 32 s) 동안 응답이 없으면 연결이 끊긴 것으로 보고 다시 연결한다. 이번 층 롤백 ${rollbacks}회.` }),
    el("div", { class: "lib-actions" },
      button("🏃 마을로", () => { close(); }),
      button("🔁 체크포인트에서 재연결", () => hooks.onRollback(), "lib-btn primary timeout-rollback")
    )
  );
}

// ---------- 링크 정비 콘솔 (채널맵 퍼즐) ----------
/** @param {{ floor: number, puzzle: any }} run */
export function openConsole(run) {
  mode = "console";
  overlay.hidden = false;
  const p = run.puzzle;
  const grid = el("div", { class: "ch-grid", role: "group", "aria-label": "채널맵 (눌러서 넣고 빼기)" });
  const cells = [];
  for (let c = 0; c < DATA_CHANNELS; c++) {
    const cell = el("button", {
      type: "button", class: "ch", title: `채널 ${c} · ${dataChannelFreq(c)} MHz`, "data-ch": String(c),
      on: { click: () => hooks.onToggle(c) }
    }, el("span", { class: "ch-n", textContent: String(c) }), el("span", { class: "ch-bar" }));
    cells.push(cell);
    grid.append(cell);
  }
  const ticker = el("div", { class: "ch-ticker", "aria-live": "off" });
  const status = el("div", { class: "ch-status", role: "status" });
  const used = el("span", { class: "muted" });
  const observeBtn = button("⏸ 관찰 멈춤", () => hooks.onObserve(!consoleView.observing));
  const testBtn = button(`🧪 링크 테스트 (연결 이벤트 ${LINK.TEST_EVENTS}회)`, () => hooks.onTest(), "lib-btn primary link-test");
  consoleView = { cells, ticker, status, used, observeBtn, testBtn, observing: true };
  render(
    header(`📡 링크 정비 콘솔 — ${run.floor}층`, `hopIncrement = ${p.hopIncrement} (CONNECT_IND에 실려 온 값) · 채널 선택 알고리즘 #1`),
    el("p", { class: "npc", textContent: `이 층 벽 속에 Wi-Fi 공유기가 숨어 있다네. 연결 이벤트마다 (이전 채널 + ${p.hopIncrement}) mod 37로 도약하는데, 공유기가 덮는 채널에 걸리면 패킷이 깨지지. 관찰로 손실이 나는 채널을 찾아 채널맵에서 빼고(최소 ${MIN_USED_CHANNELS}채널), 연결 이벤트 ${LINK.TEST_EVENTS}번을 연속으로 성공시키게. 이게 적응형 주파수 도약(AFH)일세.` }),
    el("div", { class: "ch-legend", textContent: "칸 = LE 데이터 채널 0~36 (2404~2478 MHz) · 아래 막대 = 관찰한 패킷 손실률 · 눌러서 채널맵에서 빼기/넣기 · ↺ = 안 쓰는 채널이라 다시 매핑됨" }),
    grid,
    el("div", { class: "ch-row" }, used, el("span", {}, button("↩ 모두 사용", () => hooks.onReset()), " ", observeBtn)),
    ticker,
    status,
    el("div", { class: "lib-actions" }, button("닫기", close), testBtn),
    el("p", { class: "source" }, "원리: ", el("a", { href: HOPPING_URL, target: "_blank", rel: "noopener", textContent: "BluetoothBook · 주파수 도약과 공존" }), " · [Vol 6] Part B §4.5.8")
  );
  updateConsole(run);
}

/** 콘솔 갱신 (매 스텝) */
export function updateConsole(run) {
  if (mode !== "console" || !consoleView) return;
  const p = run.puzzle;
  const recent = p.log.at(-1);
  p.map.forEach((on, c) => {
    const s = p.stats[c];
    const cell = consoleView.cells[c];
    const loss = s.tx ? s.lost / s.tx : 0;
    cell.classList.toggle("off", !on);
    cell.classList.toggle("bad", s.tx > 0 && loss > 0.5);
    cell.classList.toggle("now", Boolean(recent && recent.channel === c && p.sinceEvent < 0.12));
    cell.querySelector(".ch-bar").style.height = `${Math.round(loss * 100)}%`;
    cell.setAttribute("aria-pressed", String(!on));
    cell.title = `채널 ${c} · ${dataChannelFreq(c)} MHz · ${on ? "사용" : "제외"} · 관찰 ${s.tx}회 중 손실 ${s.lost}`;
  });
  const n = usedChannels(p.map).length;
  consoleView.used.textContent = `채널맵: ${n}/${DATA_CHANNELS}채널 사용`;
  consoleView.ticker.replaceChildren(...p.log.slice(-14).map((e) =>
    el("span", { class: `tk ${e.lost ? "lost" : "ok"}`, textContent: `#${e.event}→${e.channel}${e.remapped ? "↺" : ""}${e.lost ? "✗" : "✓"}` })));
  consoleView.observeBtn.textContent = consoleView.observing ? "⏸ 관찰 멈춤" : "▶ 관찰 계속";
  if (p.solved) consoleView.testBtn.disabled = true;
}

export function setObserving(on) {
  if (consoleView) consoleView.observing = on;
}

/** 링크 테스트 결과 표시 */
export function showTestResult(result, run) {
  if (!consoleView) return;
  const s = consoleView.status;
  if (result.ok) {
    const sum = interferenceSummary(run.layout).map((w) => `Wi-Fi ${w.wifi}번(${w.mhz} MHz) → LE 채널 ${w.from}~${w.to}`).join(", ");
    s.className = "ch-status ok";
    s.textContent = `✅ 링크 안정! ${"★".repeat(result.stars)}${"☆".repeat(3 - result.stars)} (사용 ${result.used}채널 / 막힌 채널만 빼면 ${result.best}채널) — 숨은 간섭원: ${sum}. 남쪽 포털이 열렸다!`;
  } else {
    s.className = "ch-status bad";
    s.textContent = `❌ ${LINK.TEST_EVENTS}회 중 패킷 손실 — 깨진 채널: ${result.lostChannels.join(", ")}. 관찰 막대가 높은 채널을 빼 보자.`;
  }
  updateConsole(run);
}

// ---------- 던전 상단 바 ----------
export function updateHud(run) {
  hudBar.hidden = !run;
  if (!run) return;
  const alive = run.battle.monsters.filter((m) => m.state !== "dead").length;
  const step = run.phase === "combat" ? `간섭 몬스터 ${alive}/${run.battle.monsters.length}${run.rollbacks ? ` · 롤백 ${run.rollbacks}` : ""}`
    : run.phase === "timeout" ? "📶 Connection Timeout"
    : run.phase === "link" ? "📡 북쪽 링크 콘솔에서 채널맵 정비" : "🌀 남쪽 포털 열림";
  hudBar.querySelector(".dh-text").textContent = `⚔️ 호핑 던전 ${run.floor}층 · ${step}`;
}

// ---------- 열기/닫기 ----------
export const isDungeonPanelOpen = () => !overlay.hidden;
export const dungeonPanelMode = () => (overlay.hidden ? null : mode);
function close() {
  overlay.hidden = true;
  const was = mode;
  mode = null;
  consoleView = null;
  hooks.onClose(was);
}
export { close as closeDungeonPanel };

export function initDungeonPanel(h) {
  hooks = h;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  window.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") close(); });
  hudBar.querySelector(".dh-leave").addEventListener("click", () => hooks.onLeave());
  hudBar.querySelector(".dh-help").addEventListener("click", () => hooks.onHelp?.());
}
