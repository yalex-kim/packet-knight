// 던전 메커니즘 설명 (Stage 11.12) — 호핑과 Wi-Fi 간섭을 3장면 루프 애니메이션으로 보여 준다 (DOM + 캔버스)
// 던전에 처음 들어가면 자동으로, 이후엔 던전 상태 바의 ❔로 다시 본다. 열려 있는 동안 게임은 멈춘다(main.js).
// 도약은 게임과 같은 core/hopping.js의 CSA #1, 대역도 같은 wifiBlockedChannels — 그림과 실제 규칙이 어긋나지 않게.

import { csa1Sequence, allChannelsMap, wifiBlockedChannels, DATA_CHANNELS, dataChannelFreq } from "../core/hopping.js";

const SEEN_KEY = "packetKnight.tips.hopGuide";
const HOP = 7;                          // 예시 hopIncrement
const WIFI = 6;                         // 예시 Wi-Fi 채널
const BAND = wifiBlockedChannels([WIFI]);
const EVENT_SEC = 0.9;                  // 예시는 실제(0.5초)보다 천천히
const INSTANT_DELAY = 6;
const SCENES = [
  { from: 0, to: 6, text: "① 기사의 BLE 링크는 연결 이벤트마다 다음 채널로 건너뛴다 — 채널 선택 알고리즘 #1 (hopIncrement 7)" },
  { from: 6, to: 16, text: "② 지금 채널이 Wi-Fi 대역(빨강) 안이면 ✗ 내 패킷은 손실, 몬스터의 광역 공격은 맞는다 · 밖이면 ✓ 명중, 광역 공격 피해 0" },
  { from: 16, to: 30, text: `③ 대역 칸을 채널맵에서 빼면(칸 누르기·📶 AFH) ${INSTANT_DELAY} 이벤트 뒤(instant)부터 대역 밖으로만 도약한다 — 빠진 칸으로 갈 차례면 다른 채널로 재매핑` }
];
const LOOP = SCENES.at(-1).to;
const MAP_REQ_EVENT = 17;               // 장면 ③에서 채널맵 갱신을 보내는 이벤트

let overlay, canvas, ctx, caption, raf = 0, t0 = 0, onClose = () => {};

function build() {
  overlay = document.createElement("div");
  overlay.id = "hop-guide";
  overlay.className = "overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "호핑과 간섭 설명");
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="panel hg-panel">
      <div class="head"><div><h2>📡 던전에서 싸우는 법 — 호핑과 간섭</h2><div class="muted">게임은 잠시 멈춰 있어요</div></div>
        <button type="button" class="close" aria-label="닫기">×</button></div>
      <canvas class="hg-canvas" width="640" height="300" aria-label="호핑·간섭 예시 애니메이션"></canvas>
      <p class="hg-caption" aria-live="polite"></p>
      <ul class="hg-points">
        <li>화면의 <b>채널맵</b> 37칸 — 초록 테두리가 지금 채널, 빨강이 스캔된 Wi-Fi 대역</li>
        <li>몬스터를 맞히거나 그 대역에서 패킷이 깨지면 대역이 드러난다(스캔)</li>
        <li>빨간 칸을 눌러 빼거나 📶 AFH(Q4 보상)로 한 번에 빼면, 공격이 닿고 광역 공격도 피한다</li>
        <li>3층부터 몬스터가 Wi-Fi 채널을 옮긴다(ACS) — 대역이 바뀌면 다시 빼자</li>
      </ul>
      <div class="lib-actions"><button type="button" class="lib-btn hg-replay">↺ 처음부터</button><button type="button" class="lib-btn primary hg-ok">알겠어요, 싸우러 가기</button></div>
    </div>`;
  document.body.append(overlay);
  canvas = overlay.querySelector("canvas");
  ctx = canvas.getContext("2d");
  caption = overlay.querySelector(".hg-caption");
  overlay.querySelector(".close").addEventListener("click", close);
  overlay.querySelector(".hg-ok").addEventListener("click", close);
  overlay.querySelector(".hg-replay").addEventListener("click", () => { t0 = performance.now(); });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  window.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") { e.stopPropagation(); close(); } }, { capture: true });
}

/** 예시 링크 상태: 이벤트 e의 채널·재매핑 여부, 그때의 맵(빠진 칸)과 대기 중인 맵 */
function linkAt(e) {
  const full = allChannelsMap();
  const reduced = full.map((on, c) => on && !BAND.has(c));
  const applied = e >= MAP_REQ_EVENT + INSTANT_DELAY;
  const map = applied ? reduced : full;
  const [hop] = csa1Sequence(HOP, map, 1, e);
  return { ...hop, map, pending: e >= MAP_REQ_EVENT && !applied, applied };
}

function draw(now) {
  const W = canvas.width, H = canvas.height;
  const time = Math.max(0, (now - t0) / 1000);   // rAF 타임스탬프가 연 시각보다 살짝 앞설 수 있다
  const ev = Math.floor(time / EVENT_SEC) % LOOP;
  const k = (time / EVENT_SEC) % 1;                         // 이번 이벤트 안에서 진행도
  const scene = SCENES.find((s) => ev >= s.from && ev < s.to);
  if (caption.textContent !== scene.text) caption.textContent = scene.text;
  const cur = linkAt(ev), prev = linkAt((ev + LOOP - 1) % LOOP);
  const inBand = BAND.has(cur.channel);
  const showFight = ev >= SCENES[1].from;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#081426"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  // ---- 위: 기사 ↔ 몬스터 ----
  const KX = 110, MX = 530, Y = 78;
  ctx.font = "44px system-ui, sans-serif";
  ctx.fillText("🛡️", KX, Y);
  ctx.fillText("👾", MX, Y);
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillStyle = "#cfe8ff"; ctx.fillText("기사", KX, Y + 36);
  ctx.fillStyle = "#ffb3a8"; ctx.fillText(`Wi-Fi ${WIFI} 간섭 몬스터`, MX, Y + 36);
  if (showFight) {
    const px = KX + 40 + (MX - KX - 80) * Math.min(1, k * 1.6);
    if (inBand) {
      // 패킷이 가운데서 깨지고, 광역 공격(빨간 파동)이 기사를 덮친다
      if (k < 0.32) { ctx.fillStyle = "#7dfcff"; ctx.fillRect(px - 7, Y - 7, 14, 14); }
      else {
        ctx.fillStyle = "#ff5a4e"; ctx.font = "bold 22px system-ui, sans-serif"; ctx.fillText("✗", (KX + MX) / 2, Y);
        ctx.font = "bold 15px system-ui, sans-serif"; ctx.fillText(`패킷 손실 — ch${cur.channel}`, (KX + MX) / 2, Y - 30);
        const r = (k - 0.32) * 520;
        ctx.strokeStyle = `rgba(255, 90, 78, ${Math.max(0, 0.8 - (k - 0.32))})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(MX, Y, r, Math.PI * 0.75, Math.PI * 1.25); ctx.stroke();
        if (k > 0.75) { ctx.fillStyle = "#ff7a70"; ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillText("광역 공격 맞음 −HP", KX, Y - 42); }
      }
    } else {
      if (k < 0.62) { ctx.fillStyle = "#7dfcff"; ctx.fillRect(px - 7, Y - 7, 14, 14); }
      else {
        ctx.fillStyle = "#7dffb5"; ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillText("✓ 명중!", MX, Y - 42);
        ctx.fillStyle = "#9fd0ff"; ctx.font = "bold 13px system-ui, sans-serif"; ctx.fillText("광역 공격 피해 0", KX, Y - 42);
      }
    }
  }

  // ---- 아래: 채널 37칸 ----
  const X0 = 22, CW = (W - 44) / DATA_CHANNELS, CY = 196, CH = 30;
  const cx = (c) => X0 + c * CW + CW / 2;
  // 도약 화살(이전 → 지금)
  const a = cx(prev.channel), b = cx(cur.channel), lift = 34 + Math.abs(b - a) * 0.12;
  ctx.strokeStyle = "rgba(125, 255, 181, .75)"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(a, CY - 4); ctx.quadraticCurveTo((a + b) / 2, CY - 4 - lift, b, CY - 4); ctx.stroke(); ctx.setLineDash([]);
  for (let c = 0; c < DATA_CHANNELS; c++) {
    const x = X0 + c * CW;
    const band = BAND.has(c), off = !cur.map[c];
    ctx.fillStyle = off ? "#0d1117" : band ? "#a8261d" : "#1b4777";
    ctx.fillRect(x + 1, CY, CW - 2, CH);
    if (cur.pending && band) {            // 대기 중(instant 전): 줄무늬
      ctx.save(); ctx.beginPath(); ctx.rect(x + 1, CY, CW - 2, CH); ctx.clip();
      ctx.strokeStyle = "rgba(255, 215, 107, .8)"; ctx.lineWidth = 2;
      for (let s = -CH; s < CW + CH; s += 6) { ctx.beginPath(); ctx.moveTo(x + s, CY + CH); ctx.lineTo(x + s + CH, CY); ctx.stroke(); }
      ctx.restore();
    }
  }
  ctx.strokeStyle = "#7dffb5"; ctx.lineWidth = 3;
  ctx.strokeRect(X0 + cur.channel * CW, CY - 2, CW, CH + 4);
  ctx.fillStyle = "#ffb3a8"; ctx.font = "12px system-ui, sans-serif";
  const bandMin = Math.min(...BAND), bandMax = Math.max(...BAND);
  ctx.fillText(`Wi-Fi ${WIFI} 대역 (ch${bandMin}~${bandMax})`, (cx(bandMin) + cx(bandMax)) / 2, CY + CH + 14);
  ctx.fillStyle = "#7fa6cc";
  ctx.fillText("ch0", cx(0), CY + CH + 14); ctx.fillText("ch36", cx(36), CY + CH + 14);

  // ---- 상태 줄 ----
  ctx.textAlign = "left"; ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillStyle = "#e2f1ff";
  ctx.fillText(`연결 이벤트 #${ev} → ch${cur.channel} (${dataChannelFreq(cur.channel)} MHz)${cur.remapped ? " ↪ 재매핑" : ""}`, X0, 150);
  ctx.textAlign = "right";
  ctx.fillStyle = cur.applied ? "#7dffb5" : cur.pending ? "#ffd76b" : "#7fa6cc";
  ctx.fillText(cur.applied ? "새 채널맵 적용 — 대역 밖으로만" : cur.pending ? `LL_CHANNEL_MAP_IND → instant #${MAP_REQ_EVENT + INSTANT_DELAY}` : showFight ? (inBand ? "대역 안 ✗" : "대역 밖 ✓") : "", W - X0, 150);

  raf = requestAnimationFrame(draw);
}

export function openHopGuide(close = () => {}) {
  if (!overlay) build();
  onClose = close;
  overlay.hidden = false;
  t0 = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
  overlay.querySelector(".hg-ok").focus({ preventScroll: true });
}
function close() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  cancelAnimationFrame(raf);
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* 저장 불가 — 다음에 또 보일 뿐 */ }
  onClose();
}
export const isHopGuideOpen = () => Boolean(overlay && !overlay.hidden);
export function hopGuideSeen() {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; }
}
/** 테스트 훅: 예시의 이벤트 e 상태 */
export const hopGuideExample = (e) => { const l = linkAt(e); return { channel: l.channel, inBand: BAND.has(l.channel), applied: l.applied, remapped: l.remapped }; };
