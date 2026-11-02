// 화면 연출 — 떠오르는 숫자(데미지·획득), 토스트(도감 등록·레벨업·연결 끊김), 플레이어 HP 바 (DOM)

const layer = document.getElementById("fx");
const toast = document.getElementById("toast");
const hpFill = document.getElementById("hp-fill");
const hpText = document.getElementById("hp-text");
const hpBox = document.getElementById("hp");

/** @type {Array<{ el: HTMLElement, x: number, y: number, z: number, t: number }>} */
const floats = [];
const FLOAT_TIME = 0.9;

/** 월드 좌표에 떠오르는 글자 */
export function floatText(x, y, z, text, cls = "") {
  const el = document.createElement("div");
  el.className = `float ${cls}`;
  el.textContent = text;
  layer.append(el);
  floats.push({ el, x, y, z, t: 0 });
}

/** @param {(x:number,y:number,z:number) => {x:number,y:number,behind:boolean}} project */
export function updateFx(project, dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    const k = f.t / FLOAT_TIME;
    const s = project(f.x, f.y + 0.6 + k * 0.9, f.z);
    f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
    f.el.style.opacity = s.behind ? "0" : String(Math.max(0, 1 - k * k));
    if (k >= 1) { f.el.remove(); floats.splice(i, 1); }
  }
}

let toastTimer = 0;
export function showToast(text, seconds = 2.6) {
  toast.textContent = text;
  toast.hidden = false;
  toastTimer = seconds;
}
export function updateToast(dt) {
  if (toastTimer <= 0) return;
  toastTimer -= dt;
  if (toastTimer <= 0) toast.hidden = true;
}

let lastHp = null;
export function setPlayerHp(hp, max) {
  const shown = Math.ceil(hp);
  hpFill.style.width = `${Math.max(0, Math.min(100, (hp / max) * 100))}%`;
  hpText.textContent = `❤️ ${shown} / ${max}`;
  hpBox.classList.toggle("low", hp / max < 0.3);
  if (lastHp !== null && shown < lastHp) {
    hpBox.classList.remove("hurt");
    void hpBox.offsetWidth; // 애니메이션 재시작
    hpBox.classList.add("hurt");
  }
  lastHp = shown;
}
