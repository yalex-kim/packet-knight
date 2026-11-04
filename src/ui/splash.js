// 로딩·타이틀 화면 (Stage 11.5) — 마크업·CSS는 index.html에 있어 JS보다 먼저 뜬다.
// main.js가 세계를 다 지으면 ready()로 타이틀(시작 버튼)로 바꾸고, 시작을 누르면 걷어 내며 onStart를 부른다.

const splash = document.getElementById("splash");

/** 로딩 단계 문구 */
export function setStatus(text) {
  const st = document.getElementById("splash-status");
  if (st) st.textContent = text;
}

/**
 * 타이틀로 바꾼다.
 * @param {{ save: string|null, onStart: () => void }} opts save: 이어하기 요약 (없으면 새 게임)
 */
export function ready({ save, onStart }) {
  if (!splash) { onStart(); return; }
  clearTimeout(window.__pkSplashTimer);
  splash.classList.remove("failed");
  splash.classList.add("ready");
  const start = document.getElementById("splash-start");
  start.textContent = save ? "▶ 이어하기" : "▶ 시작하기";
  document.getElementById("splash-save").textContent = save ?? "처음이라면 — 광장에서 퀘스트 Q0부터";
  start.focus({ preventScroll: true });
  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    window.removeEventListener("keydown", onKey);
    flyEmblem();
    splash.classList.add("leaving");
    onStart();
    setTimeout(() => splash.remove(), 800);
  };
  const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  start.addEventListener("click", go);
  window.addEventListener("keydown", onKey);
}

/** 엠블럼 연출 길이(ms) — main.js 가 HUD를 이 뒤에 드러낸다 */
export const EMBLEM_FLY_MS = 1900;
/**
 * 시작을 누르면 (Stage 13.6) ① 엠블럼이 화면 가운데에서 크게 커지며 "두둥" 두 번 고동치고 ② 작아지며 왼쪽 위 자리
 * (모바일: #corner-emblem, 데스크톱: 조작법 상자 머리)로 날아가 앉는다. 복제본을 띄워 날리고, HUD가 나타날 때 겹쳐 사라진다.
 */
function flyEmblem() {
  const src = splash.querySelector(".pk-emblem");
  const corner = document.getElementById("corner-emblem");
  const target = corner && getComputedStyle(corner).display !== "none" ? corner : document.querySelector("#hud .hud-emblem");
  if (!src || !target || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const a = src.getBoundingClientRect(), b = target.getBoundingClientRect();
  if (!a.width || !b.width) return;
  const fly = src.cloneNode();
  fly.removeAttribute("class");
  Object.assign(fly.style, { position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: "0",
    zIndex: "120", pointerEvents: "none", transformOrigin: "0 0", filter: "drop-shadow(0 10px 24px rgba(0,0,0,.35)) drop-shadow(0 0 20px rgba(57,208,255,.4))" });
  document.body.append(fly);
  src.style.visibility = "hidden";
  // 가운데 크게: 화면 짧은 변의 70% (최대 420px)
  const big = Math.min(innerWidth, innerHeight) * 0.7, K = Math.min(420, big) / a.width;
  const cx = (innerWidth - a.width * K) / 2 - a.left, cy = (innerHeight - a.height * K) / 2 - a.top;
  const at = (x, y, k, r = 0) => `translate(${x}px, ${y}px) scale(${k}) rotate(${r}deg)`;
  // scale 의 기준점이 왼쪽 위라, 가운데 기준으로 고동치게 위치를 보정한다
  const pulse = (k) => at(cx - (a.width * (k - K)) / 2, cy - (a.height * (k - K)) / 2, k);
  const k = b.width / a.width;
  const glow = (n) => `drop-shadow(0 10px 24px rgba(0,0,0,.35)) drop-shadow(0 0 ${n}px rgba(57,208,255,${Math.min(1, n / 60)}))`;
  const anim = fly.animate([
    { transform: at(0, 0, 1), filter: glow(20), offset: 0 },
    { transform: pulse(K), filter: glow(30), offset: 0.2, easing: "cubic-bezier(.2,.9,.3,1)" },
    { transform: pulse(K * 1.12), filter: glow(70), offset: 0.26 },                          // 두
    { transform: pulse(K * 0.98), filter: glow(30), offset: 0.33 },
    { transform: pulse(K * 1.16), filter: glow(90), offset: 0.4 },                           // 둥
    { transform: pulse(K), filter: glow(40), offset: 0.5 },
    { transform: pulse(K), filter: glow(40), offset: 0.6, easing: "ease-in-out" },   // 날아갈 때는 기울거나 튀지 않고 얌전히
    { transform: at(b.left - a.left, b.top - a.top, k), filter: glow(16), offset: 1 }
  ], { duration: EMBLEM_FLY_MS, fill: "forwards" });
  // 자리에 앉으면 한 번 반짝 — 밝게 번쩍 + 오른쪽 위에 별빛 하나 (Stage 13.6)
  anim.finished
    .then(() => {
      sparkle(b);
      return fly.animate([
        { filter: `brightness(1) ${glow(16)}` },
        { filter: `brightness(1.9) ${glow(60)}`, offset: 0.35 },
        { filter: `brightness(1) ${glow(16)}` }
      ], { duration: 520, easing: "ease-out" }).finished;
    })
    .then(() => fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: "forwards" }).finished)
    .then(() => fly.remove()).catch(() => fly.remove());
}

/** 별빛 하나가 커졌다 사라진다 */
function sparkle(r) {
  const st = document.createElement("span");
  st.textContent = "✦";
  const size = Math.max(18, r.width * 0.42);
  Object.assign(st.style, { position: "fixed", left: `${r.right - size * 0.7}px`, top: `${r.top - size * 0.2}px`, fontSize: `${size}px`, lineHeight: "1",
    color: "#fff", textShadow: "0 0 8px #7de3ff, 0 0 18px #39d0ff", zIndex: "121", pointerEvents: "none" });
  document.body.append(st);
  st.animate([
    { transform: "scale(0) rotate(0deg)", opacity: 0 },
    { transform: "scale(1.25) rotate(60deg)", opacity: 1, offset: 0.4 },
    { transform: "scale(0) rotate(120deg)", opacity: 0 }
  ], { duration: 650, easing: "ease-out", fill: "forwards" }).finished.then(() => st.remove(), () => st.remove());
}

export const isSplashUp = () => Boolean(splash?.isConnected) && !splash.classList.contains("leaving");
