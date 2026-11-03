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
    splash.classList.add("leaving");
    onStart();
    setTimeout(() => splash.remove(), 800);
  };
  const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  start.addEventListener("click", go);
  window.addEventListener("keydown", onKey);
}

export const isSplashUp = () => Boolean(splash?.isConnected) && !splash.classList.contains("leaving");
