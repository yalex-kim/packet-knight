// 알바 UI — 비콘 신호 측정소 (안내 → 60초 측정 → 결과). 게임 로직은 core/rssiJob.js
// 매 시뮬레이션 스텝마다 update(job)로 그린다. 캔버스: 이번 비콘의 RSSI 샘플(점)과 누적 평균(선)

import { RSSI_JOB } from "../core/balance.js";
import { averageRssi, distanceFromRssi } from "../core/rssiJob.js";
import { chapterUrl } from "../core/book.js";

const overlay = document.getElementById("job");
const panel = document.getElementById("job-panel");
const LOCATION_URL = chapterUrl("location.html");
const Y_TOP = -40, Y_BOTTOM = -110; // 캔버스 dBm 범위
const WINDOW = 5;                    // 캔버스 가로 = 5초

/** @type {{ onStart: () => void, onConfirm: () => void, onClose: (aborted: boolean) => void, getProgress: () => any, getCharges: () => { count: number, nextInSec: number|null } }} */
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
    el("button", { type: "button", class: "close", textContent: "×", "aria-label": "측정소 나가기", on: { click: () => close() } })
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
  view = null;
  const p = hooks.getProgress();
  const c = RSSI_JOB;
  render(
    header("📡 비콘 신호 측정소", "알바 · 60초"),
    el("p", { class: "npc", textContent: "측정 기사 모집! 마을 곳곳에 설치한 비콘까지의 거리를 RSSI로 재 주게. 패킷마다 신호가 크게 출렁이니 여러 개를 평균 내야 정확하지. 다만 너무 오래 재면 60초 안에 비콘을 몇 개 못 잰다네." }),
    el("h3", { textContent: "측정 원리" }),
    el("div", { class: "formula", textContent: `추정 거리 d ≈ 10^((P₁ₘ − RSSI평균) / (10·n))     P₁ₘ = ${c.P1M} dBm, n = ${c.PATH_LOSS_N} (집 환경)` }),
    el("ul", {},
      el("li", { textContent: `비콘은 ${c.ADV_INTERVAL * 1000} ms마다 광고 패킷을 보낸다. 패킷마다 페이딩으로 RSSI가 크게(σ ≈ ${c.FADING_SIGMA} dB) 흔들린다.` }),
      el("li", { textContent: "평균이 안정됐다 싶을 때 📏 측정 확정 (스페이스바)." }),
      el("li", { textContent: `판정(배율 오차): ${c.TIERS.map((t) => `${t.label} ≤×${t.maxRatio} ${tierPts(t.points)}`).join(" · ")} · ${c.MISS.label} ${tierPts(c.MISS.points)}` }),
      el("li", { textContent: `보수(CR2032): ${c.GRADES.map((g) => `${g.grade} ${Number.isFinite(g.minScore) ? `${g.minScore}점+` : "참가"} → ${g.reward}개`).join(" · ")}` })
    ),
    el("p", { class: "muted", textContent: `🪙 보유 CR2032 ${p.cr2032}개 · 최고 기록 ${p.job.bestScore ?? "-"}점 · 중간에 나가면 보수가 없습니다.` }),
    chargeLine(),
    el("div", { class: "lib-actions" },
      button("닫기", () => close()),
      startButton("▶ 60초 측정 시작")
    )
  );
}

// ---------- 화면 2: 측정 ----------
export function showRunning() {
  const timer = el("span", { class: "job-stat" });
  const score = el("span", { class: "job-stat" });
  const round = el("span", { class: "job-stat" });
  const canvas = el("canvas", { class: "rssi-canvas", width: 540, height: 200, "aria-label": "RSSI 그래프" });
  const readout = el("div", { class: "job-readout" });
  const estimate = el("div", { class: "job-estimate", role: "status" });
  const confirm = button("📏 측정 확정 (Space)", () => hooks.onConfirm(), "lib-btn primary job-confirm");
  view = { timer, score, round, canvas, ctx: canvas.getContext("2d"), readout, estimate, confirm };
  render(
    header("📡 비콘 신호 측정소", "측정 중 — 평균이 안정되면 확정하세요"),
    el("div", { class: "job-bar" }, timer, round, score),
    canvas,
    readout,
    estimate,
    el("div", { class: "lib-actions" }, confirm)
  );
  confirm.focus({ preventScroll: true });
}

function drawCanvas(job) {
  const { ctx, canvas } = view;
  const W = canvas.width, H = canvas.height;
  const y = (dbm) => ((Y_TOP - dbm) / (Y_TOP - Y_BOTTOM)) * H;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#06101e";
  ctx.fillRect(0, 0, W, H);

  // 눈금 (10 dB 간격)
  ctx.strokeStyle = "#163252";
  ctx.fillStyle = "#5f84ab";
  ctx.font = "11px ui-monospace, monospace";
  ctx.lineWidth = 1;
  for (let d = -50; d >= -100; d -= 10) {
    ctx.beginPath(); ctx.moveTo(0, y(d)); ctx.lineTo(W, y(d)); ctx.stroke();
    ctx.fillText(`${d}`, 4, y(d) - 3);
  }

  const b = job.beacon;
  const t0 = Math.max(0, job.phase === "measure" ? job.phaseTime - WINDOW : (b.samples.at(-1)?.t ?? 0) - WINDOW);
  const x = (t) => ((t - t0) / WINDOW) * W;

  // 샘플 점 (패킷 하나 = 점 하나)
  ctx.fillStyle = "#7dd8ff";
  for (const s of b.samples) {
    if (s.t < t0) continue;
    ctx.beginPath(); ctx.arc(x(s.t), y(s.rssi), 2.6, 0, Math.PI * 2); ctx.fill();
  }
  // 누적 평균 선
  ctx.strokeStyle = "#ffd76b";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let sum = 0;
  b.samples.forEach((s, i) => {
    sum += s.rssi;
    const px = x(s.t), py = y(sum / (i + 1));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // 결과 공개 중: 실제 거리의 기대 RSSI(정답선)
  if (job.phase === "reveal") {
    const truth = RSSI_JOB.P1M - 10 * RSSI_JOB.PATH_LOSS_N * Math.log10(b.distance);
    ctx.strokeStyle = "#23d18b";
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(0, y(truth)); ctx.lineTo(W, y(truth)); ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** 매 스텝 갱신 */
export function updateJob(job) {
  if (!view || overlay.hidden) return;
  const b = job.beacon;
  view.timer.textContent = `⏱ ${Math.max(0, job.timeLeft).toFixed(1)}초`;
  view.round.textContent = `비콘 #${job.history.length + (job.phase === "measure" ? 1 : 0)}`;
  view.score.textContent = `점수 ${job.score}`;

  const n = b.samples.length;
  const avg = averageRssi(job);
  const last = b.samples.at(-1);
  view.readout.textContent = n
    ? `패킷 N=${n} · 방금 ${last.rssi.toFixed(0)} dBm · 평균 ${avg.toFixed(1)} dBm`
    : "광고 패킷 수신 대기 중…";

  if (job.phase === "measure") {
    view.estimate.className = "job-estimate";
    view.estimate.textContent = n ? `추정 거리 ≈ ${fmtD(distanceFromRssi(avg))} m` : "…";
    view.confirm.disabled = n < RSSI_JOB.MIN_SAMPLES;
  } else if (job.phase === "reveal") {
    view.estimate.className = `job-estimate tier-${b.tier.id}`;
    view.estimate.textContent = `실제 ${fmtD(b.distance)} m · 추정 ${fmtD(b.estimate)} m (×${b.ratio.toFixed(2)}) → ${b.tier.label} ${tierPts(b.tier.points)}`;
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
  const counts = {};
  for (const h of history) counts[h.points] = (counts[h.points] ?? 0) + 1;
  const tiers = [...RSSI_JOB.TIERS, RSSI_JOB.MISS].map((t) => `${t.label} ${counts[t.points] ?? 0}`).join(" · ");
  const sigmaAvg = r.avgN ? (RSSI_JOB.FADING_SIGMA / Math.sqrt(r.avgN)).toFixed(1) : "-";
  render(
    header("📡 측정 결과", "알바 정산"),
    el("div", { class: "result-big", textContent: `등급 ${r.grade} · ${r.score}점${paid.newBest ? " 🏆 최고 기록!" : ""}` }),
    el("p", { class: "reward", textContent: `🪙 CR2032 +${paid.earned}개 (보유 ${paid.balance}개)` }),
    el("p", { textContent: `측정한 비콘 ${r.rounds}개 · ${tiers}` }),
    el("p", { class: "npc", textContent: `비콘 하나에 평균 패킷 ${r.avgN.toFixed(1)}개를 썼네. 패킷 N개를 평균하면 흔들림이 σ/√N 으로 줄어 약 ${sigmaAvg} dB가 되지. 대신 그만큼 늦어진다네 — 정확도와 속도의 균형이 측정 기사의 실력일세.` }),
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
  overlay.hidden = false;
  showIntro();
}
function close() {
  const aborted = view !== null; // 측정 화면에서 닫으면 중단
  overlay.hidden = true;
  view = null;
  hooks.onClose(aborted);
  lastFocus?.focus?.({ preventScroll: true });
}
export const isJobOpen = () => !overlay.hidden;
export const isMeasuring = () => view !== null && !overlay.hidden;

export function initJobPanel(h) {
  hooks = h;
  overlay.addEventListener("click", (e) => { if (e.target === overlay && !isMeasuring()) close(); });
  window.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") { close(); return; }
    if (isMeasuring() && (e.code === "Space" || e.code === "Enter")) {
      e.preventDefault();
      hooks.onConfirm();
    }
  });
}
