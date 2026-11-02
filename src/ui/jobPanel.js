// 알바 UI — 비콘 찾기 (안내 모달 → 60초 동안 걸어 다니며 보는 측정기 창 #hunt → 결과 모달). 게임 로직은 core/rssiJob.js
// 매 시뮬레이션 스텝마다 updateJob(job)로 그린다. 캔버스: 최근 5초의 RSSI 샘플(점)과 지금 자리의 누적 평균(선)

import { RSSI_JOB } from "../core/balance.js";
import { averageRssi, distanceFromRssi } from "../core/rssiJob.js";
import { chapterUrl } from "../core/book.js";

const overlay = document.getElementById("job");
const panel = document.getElementById("job-panel");
const hunt = document.getElementById("hunt");
const LOCATION_URL = chapterUrl("location.html");
const Y_TOP = -40, Y_BOTTOM = -110; // 캔버스 dBm 범위

/** @type {{ onStart: () => void, onMark: () => void, onAbort: () => void, onClose: () => void, getProgress: () => any, getCharges: () => { count: number, nextInSec: number|null }, getRechargeSec?: () => number }} */
let hooks;
let view = null; // 측정 화면 DOM 참조
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

function render(...nodes) {
  panel.replaceChildren(...nodes.flat(Infinity).filter((n) => n != null && n !== false));
  panel.scrollTop = 0;
  (panel.querySelector(".lib-btn.primary") ?? panel.querySelector(".lib-btn"))?.focus({ preventScroll: true });
}

function header(title, sub) {
  return el("div", { class: "head" },
    el("div", {}, el("h2", { textContent: title }), sub && el("div", { class: "muted", textContent: sub })),
    el("button", { type: "button", class: "close", textContent: "×", "aria-label": "닫기", on: { click: () => close() } })
  );
}

const fmtD = (d) => (d >= 10 ? d.toFixed(0) : d.toFixed(1));
const tierPts = (p) => (p > 0 ? `+${p}` : `${p}`);

// ---------- 측정기 배터리 (알바 횟수 제한, PRD §4.2) ----------
const fmtWait = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
function chargeLine() {
  const c = hooks.getCharges();
  const cells = "🔋".repeat(c.count) + "▫️".repeat(RSSI_JOB.CHARGES_MAX - c.count);
  const wait = c.nextInSec === null ? "가득 참" : `다음 충전 ${fmtWait(c.nextInSec)}`;
  return el("p", { class: "charge-line", "data-charges": String(c.count),
    textContent: `측정기 배터리 ${cells} ${c.count}/${RSSI_JOB.CHARGES_MAX} · ${wait} (한 판에 1칸, ${fmtWait(hooks.getRechargeSec?.() ?? RSSI_JOB.RECHARGE_SEC)}마다 1칸 충전 · 🔋 PWR가 높을수록 빠르다)` });
}
function startButton(label) {
  const c = hooks.getCharges();
  const b = button(c.count > 0 ? label : `🔋 충전 중 (${fmtWait(c.nextInSec)})`, () => hooks.onStart(), "lib-btn primary job-start");
  b.disabled = c.count <= 0;
  return b;
}

// ---------- 화면 1: 안내 ----------
function showIntro() {
  const p = hooks.getProgress();
  const c = RSSI_JOB;
  render(
    header("📡 비콘 찾기", "알바 · 60초"),
    el("p", { class: "npc", textContent: "비콘 찾기 기사 모집! 마을 어딘가에 비콘을 숨겨 두었네. 측정기를 들고 걸어 다니며 RSSI로 찾아 주게. 다만 패킷마다 신호가 크게 출렁이니, 멈춰 서서 여러 개를 평균 내야 거리를 믿을 수 있지. 너무 오래 서 있으면 60초 안에 몇 개 못 찾는다네." }),
    el("h3", { textContent: "찾는 법" }),
    el("div", { class: "formula", textContent: `추정 거리 d ≈ 10^((P₁ₘ − RSSI평균) / (10·n))     P₁ₘ = ${c.P1M} dBm, n = ${c.PATH_LOSS_N} (집 환경)` }),
    el("ul", {},
      el("li", { textContent: `비콘은 ${c.ADV_INTERVAL * 1000} ms마다 광고 패킷을 보낸다. 패킷 하나의 RSSI는 페이딩으로 크게(σ ≈ ${c.FADING_SIGMA} dB) 흔들린다 — 걸으면서 보는 숫자는 믿기 어렵다.` }),
      el("li", { textContent: "🧍 멈춰 서면 그 자리의 평균과 추정 거리가 나온다. 움직이면 평균은 새로 시작된다." }),
      el("li", { textContent: "두세 자리에서 잰 거리를 겹쳐 보면 비콘 위치가 좁혀진다(삼변측량). 가까워질수록 RSSI가 커진다." }),
      el("li", { textContent: "여기다 싶으면 📍 여기다! (B 키·Enter·버튼). 내 자리와 실제 비콘 사이 거리로 판정한다." }),
      el("li", { textContent: `판정: ${c.TIERS.map((t) => `${t.label} ≤${t.maxErr} m ${tierPts(t.points)}`).join(" · ")} · ${c.MISS.label} ${tierPts(c.MISS.points)}` }),
      el("li", { textContent: `보수(CR2032): ${c.GRADES.map((g) => `${g.grade} ${Number.isFinite(g.minScore) ? `${g.minScore}점+` : "참가"} → ${g.reward}개`).join(" · ")}` })
    ),
    el("p", { class: "muted", textContent: `🪙 보유 CR2032 ${p.cr2032}개 · 최고 기록 ${p.job.bestScore ?? "-"}점 · 그만두면(✖ 또는 Esc) 보수가 없습니다.` }),
    chargeLine(),
    el("div", { class: "lib-actions" },
      button("닫기", () => close()),
      startButton("▶ 60초 비콘 찾기 시작")
    )
  );
}

// ---------- 화면 2: 찾는 중 — 모달을 닫고 걸어 다니며 보는 측정기 창 (#hunt) ----------
export function showRunning() {
  overlay.hidden = true;
  hunt.hidden = false;
  const timer = el("span", { class: "job-stat" });
  const score = el("span", { class: "job-stat" });
  const round = el("span", { class: "job-stat" });
  const canvas = el("canvas", { class: "rssi-canvas", width: 360, height: 90, "aria-label": "RSSI 그래프" });
  const readout = el("div", { class: "job-readout" });
  const estimate = el("div", { class: "job-estimate", role: "status" });
  const mark = button("📍 여기다! (B)", () => hooks.onMark(), "lib-btn primary job-confirm");
  const quit = button("✖", () => abort(), "lib-btn job-quit");
  quit.setAttribute("aria-label", "알바 그만두기 (보수 없음)");
  view = { timer, score, round, canvas, ctx: canvas.getContext("2d"), readout, estimate, confirm: mark };
  hunt.replaceChildren(
    el("div", { class: "job-bar" }, timer, round, score, quit),
    canvas, readout, estimate,
    el("div", { class: "lib-actions" }, mark)
  );
}

function drawCanvas(job) {
  const { ctx, canvas } = view;
  const W = canvas.width, H = canvas.height;
  const y = (dbm) => ((Y_TOP - dbm) / (Y_TOP - Y_BOTTOM)) * H;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#06101e";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#163252";
  ctx.fillStyle = "#5f84ab";
  ctx.font = "10px ui-monospace, monospace";
  ctx.lineWidth = 1;
  for (let d = -50; d >= -100; d -= 25) {
    ctx.beginPath(); ctx.moveTo(0, y(d)); ctx.lineTo(W, y(d)); ctx.stroke();
    ctx.fillText(`${d}`, 3, y(d) - 2);
  }
  const t0 = job.clock - RSSI_JOB.LIVE_WINDOW;
  const x = (t) => ((t - t0) / RSSI_JOB.LIVE_WINDOW) * W;
  // 패킷 하나 = 점 하나 (걸으면서 받은 것도)
  ctx.fillStyle = "#7dd8ff";
  for (const s of job.live) { ctx.beginPath(); ctx.arc(x(s.t), y(s.rssi), 2.2, 0, Math.PI * 2); ctx.fill(); }
  // 지금 자리의 누적 평균 선 (멈춰 있을 때만 길어진다)
  const b = job.beacon;
  if (b.samples.length > 1) {
    ctx.strokeStyle = "#ffd76b";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let sum = 0;
    b.samples.forEach((s, i) => {
      sum += s.rssi;
      const px = Math.max(0, x(s.t)), py = y(sum / (i + 1));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
}

/** 매 스텝 갱신 */
export function updateJob(job) {
  if (!view || hunt.hidden) return;
  const b = job.beacon;
  view.timer.textContent = `⏱ ${Math.max(0, job.timeLeft).toFixed(1)}초`;
  view.round.textContent = `비콘 #${job.history.length + (job.phase === "search" ? 1 : 0)}`;
  view.score.textContent = `점수 ${job.score}`;

  const n = b.samples.length;
  const avg = averageRssi(job);
  const last = job.live.at(-1);
  if (job.phase === "search") {
    view.readout.textContent = !last ? "광고 패킷 수신 대기 중…"
      : n < 3 ? `🚶 방금 ${last.rssi.toFixed(0)} dBm — 멈춰 서면 평균을 냅니다`
      : `🧍 이 자리 N=${n} · 평균 ${avg.toFixed(1)} dBm`;
    view.estimate.className = "job-estimate";
    view.estimate.textContent = n >= 3 ? `추정 거리 ≈ ${fmtD(distanceFromRssi(avg))} m` : "…";
    view.confirm.disabled = false;
  } else if (job.phase === "reveal") {
    view.readout.textContent = "📍 비콘 위치 공개 — 곧 다른 곳에 새 비콘이 숨겨집니다";
    view.estimate.className = `job-estimate tier-${b.tier.id}`;
    view.estimate.textContent = `실제 비콘까지 ${fmtD(b.err)} m → ${b.tier.label} ${tierPts(b.tier.points)}`;
    view.confirm.disabled = true;
  }
  drawCanvas(job);
}

// ---------- 화면 3: 결과 ----------
/**
 * @param {{ score: number, rounds: number, grade: string, reward: number, avgN: number }} r
 * @param {{ earned: number, balance: number, newBest: boolean }} paid
 */
export function showResult(r, paid, history) {
  view = null;
  hunt.hidden = true;
  lastFocus = document.activeElement;
  overlay.hidden = false;
  const counts = {};
  for (const h of history) counts[h.points] = (counts[h.points] ?? 0) + 1;
  const tiers = [...RSSI_JOB.TIERS, RSSI_JOB.MISS].map((t) => `${t.label} ${counts[t.points] ?? 0}`).join(" · ");
  const sigmaAvg = r.avgN ? (RSSI_JOB.FADING_SIGMA / Math.sqrt(r.avgN)).toFixed(1) : "-";
  render(
    header("📡 비콘 찾기 결과", "알바 정산"),
    el("div", { class: "result-big", textContent: `등급 ${r.grade} · ${r.score}점${paid.newBest ? " 🏆 최고 기록!" : ""}` }),
    el("p", { class: "reward", textContent: `🪙 CR2032 +${paid.earned}개 (보유 ${paid.balance}개)` }),
    el("p", { textContent: `찾은 비콘 ${r.rounds}개 · ${tiers}` }),
    el("p", { class: "npc", textContent: `신고한 자리에서 평균 패킷 ${r.avgN.toFixed(1)}개를 보고 있었네. 패킷 N개를 평균하면 흔들림이 σ/√N 으로 줄어 약 ${sigmaAvg} dB가 되지. 걸으면서 본 숫자 하나는 거리를 두 배쯤 틀리게 말한다네 — 멈춰서 재고, 여러 자리를 겹쳐 보는 게 비콘 찾기의 요령일세.` }),
    chargeLine(),
    el("p", { class: "muted" }, "더 알아보기: ", el("a", { href: LOCATION_URL, target: "_blank", rel: "noopener", textContent: "BluetoothBook · 위치 찾기: RSSI에서 채널 사운딩까지" })),
    el("div", { class: "lib-actions" },
      button("닫기", () => close()),
      startButton("🔁 한 번 더 (60초)")
    )
  );
}

// ---------- 열기 / 닫기 ----------
export function openJob() {
  lastFocus = document.activeElement;
  view = null;
  hunt.hidden = true;
  overlay.hidden = false;
  showIntro();
}
/** 안내·결과 창 닫기 */
function close() {
  overlay.hidden = true;
  hooks.onClose();
  lastFocus?.focus?.({ preventScroll: true });
}
/** 찾는 도중 그만두기 — 보수 없음 */
export function abort() {
  if (hunt.hidden) return;
  hunt.hidden = true;
  view = null;
  hooks.onAbort();
}
export const isJobOpen = () => !overlay.hidden || !hunt.hidden;
export const isMeasuring = () => view !== null && !hunt.hidden;

export function initJobPanel(h) {
  hooks = h;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  window.addEventListener("keydown", (e) => {
    if (!overlay.hidden) { if (e.key === "Escape") close(); return; }
    if (!isMeasuring()) return;
    // 다른 팝업(도서관 등)이 떠 있으면 그 팝업의 키가 먼저다
    if (document.querySelector(".overlay:not([hidden])")) return;
    if (e.key === "Escape") { abort(); return; }
    if (e.code === "KeyB" || e.code === "Enter") { e.preventDefault(); hooks.onMark(); }
  });
}
