// 입력 — 키보드(KeyboardEvent.code 기준, 한글 IME 대응), 가상 조이스틱, 포인터(탭·드래그 회전·핀치/휠 줌)
// DOM 이벤트만 다루고 게임 상태는 콜백으로 넘긴다.

const MOVE_CODES = {
  right:   ["KeyD", "ArrowRight"],
  left:    ["KeyA", "ArrowLeft"],
  forward: ["KeyW", "ArrowUp"],
  back:    ["KeyS", "ArrowDown"]
};
const ALL_MOVE_CODES = new Set(Object.values(MOVE_CODES).flat());

const keys = new Set();
const joystick = { right: 0, forward: 0, active: false };
let enabled = true;

/** 오버레이(강의실 등)가 열려 있는 동안 게임 조작을 멈춘다. 키 입력은 오버레이 버튼에 양보한다. */
export function setInputEnabled(on) {
  enabled = on;
  keys.clear();
}

/**
 * @param {{
 *   surface: HTMLElement,
 *   onJump: () => void,
 *   onMoveKey: () => void,
 *   onTap: (clientX: number, clientY: number) => void,
 *   onOrbit: (dYaw: number, dPitch: number) => void,
 *   onZoom: (apply: (d: number) => number) => void,
 *   getZoom: () => number
 * }} h
 */
export function initInput(h) {
  // ---------- 키보드 ----------
  window.addEventListener("keydown", (e) => {
    if (!enabled) return;
    if (e.code === "Space") {
      e.preventDefault();
      h.onJump();
      return;
    }
    if (!ALL_MOVE_CODES.has(e.code)) return;
    e.preventDefault();
    keys.add(e.code);
    h.onMoveKey();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  // 포커스를 잃으면 keyup이 오지 않으므로 눌린 키를 비운다 (Alt+Tab 후 혼자 걷는 문제)
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", () => { if (document.hidden) keys.clear(); });

  // ---------- 점프 버튼 ----------
  document.getElementById("btn-jump").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (enabled) h.onJump();
  });

  initJoystick();
  initPointer(h);
}

/** 현재 이동 입력 (카메라 기준 right/forward, -1~1). 조이스틱이 키보드보다 우선 */
export function readMoveInput() {
  if (!enabled) return { right: 0, forward: 0, joystick: false };
  if (joystick.active) return { right: joystick.right, forward: joystick.forward, joystick: true };
  let right = 0, forward = 0;
  const pressed = (codes) => codes.some((c) => keys.has(c));
  if (pressed(MOVE_CODES.right)) right += 1;
  if (pressed(MOVE_CODES.left)) right -= 1;
  if (pressed(MOVE_CODES.forward)) forward += 1;
  if (pressed(MOVE_CODES.back)) forward -= 1;
  return { right, forward, joystick: false };
}

// ---------- 가상 조이스틱 ----------
function initJoystick() {
  const zone = document.getElementById("joystick-zone");
  const base = document.getElementById("joystick-base");
  const thumb = document.getElementById("joystick-thumb");
  const MAX_DIST = 38;
  let pointerId = null;
  let center = { x: 0, y: 0 };

  function update(clientX, clientY) {
    const dx = clientX - center.x;
    const dy = clientY - center.y;
    const clamped = Math.min(Math.hypot(dx, dy), MAX_DIST);
    const angle = Math.atan2(dy, dx);
    const tx = Math.cos(angle) * clamped;
    const ty = Math.sin(angle) * clamped;
    thumb.style.transform = `translate(${tx}px, ${ty}px)`;
    const norm = clamped / MAX_DIST;
    joystick.right = (tx / MAX_DIST) * norm;
    joystick.forward = -(ty / MAX_DIST) * norm;
  }

  zone.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    pointerId = e.pointerId;
    zone.setPointerCapture(pointerId);
    const rect = base.getBoundingClientRect();
    center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    joystick.active = true;
    update(e.clientX, e.clientY);
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    update(e.clientX, e.clientY);
  });
  const end = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    joystick.active = false;
    joystick.right = 0;
    joystick.forward = 0;
    thumb.style.transform = "translate(0px, 0px)";
  };
  zone.addEventListener("pointerup", end);
  zone.addEventListener("pointercancel", end);
}

// ---------- 포인터: 탭 / 드래그 회전 / 핀치·휠 줌 ----------
function initPointer(h) {
  const active = new Map();
  let pinchStartDist = 0;
  let pinchStartZoom = 15;
  let isPinching = false;
  let downPos = { x: 0, y: 0 };
  let isDragging = false;
  let isDown = false;
  let primaryId = null;

  // UI 오버레이는 surface 바깥 형제 요소이므로 여기로 이벤트가 오지 않는다
  h.surface.addEventListener("pointerdown", (e) => {
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size === 1) {
      isDown = true;
      primaryId = e.pointerId;
      downPos = { x: e.clientX, y: e.clientY };
      if (e.button === 2) isDragging = true;
    } else if (active.size === 2) {
      isPinching = true;
      isDragging = false;
      isDown = false;
      const [a, b] = [...active.values()];
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartZoom = h.getZoom();
    }
  });

  window.addEventListener("pointermove", (e) => {
    if (active.has(e.pointerId)) active.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (isPinching && active.size >= 2) {
      const [a, b] = [...active.values()];
      const cur = Math.hypot(a.x - b.x, a.y - b.y);
      if (cur > 10 && pinchStartDist > 10) h.onZoom(() => pinchStartZoom * (pinchStartDist / cur));
      return;
    }
    if (!isDown || e.pointerId !== primaryId) return;

    const dx = e.clientX - downPos.x;
    const dy = e.clientY - downPos.y;
    if (Math.hypot(dx, dy) > 8 || isDragging) {
      isDragging = true;
      h.onOrbit(-dx * 0.006, dy * 0.005);
      downPos = { x: e.clientX, y: e.clientY };
    }
  });

  const end = (e) => {
    active.delete(e.pointerId);
    if (active.size < 2) isPinching = false;
    if (e.pointerId === primaryId) {
      if (isDown && !isDragging && !isPinching && e.button !== 2) h.onTap(e.clientX, e.clientY);
      isDown = false;
      isDragging = false;
      primaryId = null;
    }
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);

  window.addEventListener("wheel", (e) => h.onZoom((d) => d + e.deltaY * 0.015), { passive: true });
  window.addEventListener("contextmenu", (e) => e.preventDefault());
}
