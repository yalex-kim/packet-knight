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

/**
 * 시작을 누르면 가운데 큰 엠블럼이 작아지며 왼쪽 위 자리(모바일: #corner-emblem, 데스크톱: 조작법 상자 머리)로 날아가 앉는다 (Stage 13.5).
 * 복제본을 띄워 날리고, HUD가 나타날 즈음 겹쳐 사라진다 (진짜 엠블럼이 그 자리에서 이어받는다).
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
  const k = b.width / a.width, dx = b.left - a.left, dy = b.top - a.top;
  const anim = fly.animate([
    { transform: "translate(0, 0) scale(1) rotate(0deg)", offset: 0 },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.2 - 30}px) scale(${1 - (1 - k) * 0.35}) rotate(-8deg)`, offset: 0.35 },
    { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(0deg)`, offset: 1 }
  ], { duration: 950, easing: "cubic-bezier(.55,.05,.3,1)", fill: "forwards" });
  anim.finished.then(() => fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, delay: 150, fill: "forwards" }).finished).then(() => fly.remove()).catch(() => fly.remove());
}

export const isSplashUp = () => Boolean(splash?.isConnected) && !splash.classList.contains("leaving");
