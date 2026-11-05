// 호핑 던전 UI — 입장 패널, 링크 정비 콘솔(채널맵 퍼즐), 던전 상단 바 (DOM)

import { DUNGEON, MONSTERS, floorPlan, floorHpScale, floorAtkScale } from "../core/balance.js";
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
  const replay = floor <= best;
  const enter = button(canPay ? `⚔️ 확인 — ${floor}층 ${replay ? "다시 도전" : "전투 시작"} (CR2032 ${DUNGEON.ENTRY_FEE})` : `🪙 CR2032가 모자랍니다 (${p.cr2032}/${DUNGEON.ENTRY_FEE})`, () => hooks.onEnter(floor), "lib-btn primary dungeon-enter");
  // 층 고르기 (Stage 13.24): 입구에서만 — 1층 ~ 최고 기록 + 1층, 보스 층 👑, 깬 층 ★
  const picker = fromPortal ? null : el("div", { class: "dg-floors", role: "radiogroup", "aria-label": "층 고르기" },
    Array.from({ length: best + 1 }, (_, i) => i + 1).map((f) => {
      const st = p.dungeon.stars[String(f)] ?? 0, boss = floorPlan(f).boss;
      const b = button(`${boss ? "👑 " : ""}${f}층${st ? ` ★${st}` : f === best + 1 ? " 🆕" : ""}`, () => openEntry({ floor: f, fromPortal: false }), `dg-floor${f === floor ? " on" : ""}${boss ? " boss" : ""}`);
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(f === floor));
      return b;
    }));
  enter.disabled = !canPay;
  // 몬스터 브리핑 (Stage 12.3): 이번 층에 나오는 종류·마릿수·레벨(= 층)·체력·공격·대처법
  const plan = floorPlan(floor);
  const counts = new Map();
  for (const t of plan.roster) counts.set(t, (counts.get(t) ?? 0) + 1);
  const TIPS = {
    wifiInterferer: "광역 — 바닥 빨간 원 밖으로. 대역 채널을 채널맵에서 빼면 피해 0",
    advFlooder: "빠른 근접 떼 — 회피(RX)로 피할 수 있다. 채널과 상관없이 맞는다",
    microwave: "켜졌다 꺼졌다 하는 잡음 — 켜진 동안 그 대역에서 패킷이 깨진다. 광역 공격도 대역 밖이면 피해 0",
    sniffer: "원거리 6 m — 빨간 조준선이 차오르면 사거리 밖으로 빠지거나 회피",
    ovenBoss: "👑 보스 — 광역 4.5 m·근접 블로킹. 체력 절반 아래면 잡음 대역이 넓어진다: 채널맵을 다시 짜자"
  };
  const hpMul = floorHpScale(floor), atkMul = floorAtkScale(floor);
  const brief = el("div", { class: "dg-brief" }, [...counts].map(([t, n]) => {
    const d = MONSTERS[t];
    return el("div", { class: "dg-mon", "data-type": t },
      el("img", { class: "dg-mon-face", src: `./src/assets/monsters/mon-${t}-v1.webp`, alt: d.name, width: 256, height: 256 }),   // Gemini로 생성한 도감 그림
      el("div", { class: "dg-mon-head" },
        el("b", { textContent: `${d.name} ×${n}` }),
        el("span", { class: "dg-lv", textContent: `Lv ${floor}` })),
      el("div", { class: "dg-mon-stats", textContent: `❤️ ${Math.round(d.hp * hpMul)} · ⚔️ ${Math.round(d.atk * atkMul)} · 🛡️ ${d.sec}${d.aoe ? " · 광역" : ""}` }),
      el("div", { class: "dg-mon-tip", textContent: TIPS[t] ?? d.lore }));
  }));
  render(
    header(fromPortal ? "🌀 다음 층 포털" : "⚔️ 37채널 호핑 던전", `${floor}층 · ${plan.name}${fromPortal ? ` — ${floor - 1}층 클리어!` : ` · 최고 기록 ${best}층`}`),
    picker && el("h3", { class: "dg-brief-title", textContent: "🗺️ 층 고르기 — 깬 층은 다시 도전할 수 있어요 (상자 없음 · 보스 동전 적게) · 🆕 새 층을 처음 깨면 🎁 소모품 상자" }),
    picker,
    el("h3", { class: "dg-brief-title", textContent: `📋 몬스터 브리핑 — ${plan.roster.length}마리${replay ? " · 다시 도전" : ""}` }),
    brief,
    el("ul", { class: "dg-rules" },
      el("li", { textContent: `숨은 Wi-Fi 공유기 ${wifiCountFor(floor)}대 · 다 쓰러뜨리면 링크 콘솔에서 채널맵을 고쳐 다음 층으로` }),
      el("li", { textContent: "쓰러지면 Connection Timeout — 보유 CR2032의 10%를 잃고 마을 또는 체크포인트로." }),
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
