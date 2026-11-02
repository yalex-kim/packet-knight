// 사운드 — Web Audio API 합성 효과음 · 생성형 BGM (Stage 11, PRD §7) (브라우저 전용)
//
// 음원 파일 없이 오실레이터·노이즈로 합성한다 (무빌드·무에셋 원칙). 소리는 "패킷" 은유를 따른다:
//   발사 = 짧은 하강 처프(송신), 명중 = 짧은 클릭, 처치 = 상승 아르페지오, 손실 = 지직거리는 노이즈.
// 브라우저 자동 재생 정책: 첫 사용자 입력(포인터·키)에서 AudioContext를 깨운다.
// 설정(음소거·볼륨)은 localStorage "packetKnight.audio"에 따로 저장한다 (세이브 데이터와 분리).
// 테스트 모드에서는 재생 여부와 상관없이 호출 기록(log)을 남겨 "모든 상호작용에 음향 피드백"을 검증한다.

const SETTINGS_KEY = "packetKnight.audio";
const AC = typeof window !== "undefined" ? (window.AudioContext ?? window.webkitAudioContext) : null;

let ctx = null;
let master = null;
let sfxBus = null;
let bgmBus = null;
let noiseBuf = null;
let settings = { muted: false, volume: 0.7, bgm: true };
const log = [];
const LOG_MAX = 400;

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (raw && typeof raw === "object") settings = { ...settings, ...raw };
  } catch { /* 기본값 */ }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 저장 불가 무시 */ }
}

function ensureCtx() {
  if (ctx || !AC) return ctx;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    bgmBus = ctx.createGain();
    bgmBus.gain.value = 0.35;
    bgmBus.connect(master);
    applyVolume();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
  } catch { ctx = null; }
  return ctx;
}
function applyVolume() {
  if (master) master.gain.value = settings.muted ? 0 : settings.volume;
}

// ---------- 합성 원소 ----------
/** 톤 하나: 주파수(끝 주파수로 미끄러짐)·길이·파형·음량 */
function tone(t0, { f, to = f, dur = 0.1, type = "sine", gain = 0.2, attack = 0.005, bus = sfxBus }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (to !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(bus);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
/** 노이즈 버스트: 대역 필터 주파수(끝 주파수로 쓸림) */
function noise(t0, { dur = 0.08, f = 1200, to = f, q = 1, gain = 0.2, type = "bandpass" }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t0);
  if (to !== f) flt.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(flt).connect(g).connect(sfxBus);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}
const arp = (t0, freqs, step, opts) => freqs.forEach((f, i) => tone(t0 + i * step, { f, ...opts }));

/** 효과음 정의 — 이름 → 합성 함수 */
const SFX = {
  // UI
  click: (t) => tone(t, { f: 1400, dur: 0.035, type: "triangle", gain: 0.06 }),
  open: (t) => arp(t, [660, 990], 0.05, { dur: 0.09, type: "triangle", gain: 0.08 }),
  close: (t) => arp(t, [880, 587], 0.05, { dur: 0.08, type: "triangle", gain: 0.07 }),
  select: (t) => tone(t, { f: 1046, dur: 0.05, type: "sine", gain: 0.07 }),
  toast: (t) => arp(t, [1175, 1568], 0.06, { dur: 0.12, type: "sine", gain: 0.06 }),
  denied: (t) => tone(t, { f: 180, dur: 0.12, type: "square", gain: 0.05 }),
  // 이동
  step: (t) => noise(t, { dur: 0.05, f: 500, q: 0.7, gain: 0.05, type: "lowpass" }),
  jump: (t) => tone(t, { f: 320, to: 720, dur: 0.14, type: "sine", gain: 0.12 }),
  land: (t) => noise(t, { dur: 0.1, f: 300, to: 120, q: 0.8, gain: 0.16, type: "lowpass" }),
  dash: (t) => { noise(t, { dur: 0.2, f: 600, to: 4000, q: 1.5, gain: 0.18 }); tone(t, { f: 440, to: 1320, dur: 0.18, type: "sawtooth", gain: 0.05 }); },
  // 전투
  fire: (t) => tone(t, { f: 1500, to: 420, dur: 0.1, type: "square", gain: 0.06 }),
  hit: (t) => { tone(t, { f: 260, to: 160, dur: 0.07, type: "triangle", gain: 0.16 }); noise(t, { dur: 0.04, f: 2500, gain: 0.08 }); },
  crit: (t) => { SFX.hit(t); arp(t + 0.02, [1319, 1760], 0.04, { dur: 0.08, type: "square", gain: 0.05 }); },
  kill: (t) => arp(t, [523, 659, 784, 1047], 0.06, { dur: 0.12, type: "triangle", gain: 0.1 }),
  pickup: (t) => arp(t, [988, 1319], 0.06, { dur: 0.1, type: "square", gain: 0.06 }),
  hurt: (t) => tone(t, { f: 160, to: 70, dur: 0.18, type: "sawtooth", gain: 0.12 }),
  dodge: (t) => tone(t, { f: 900, to: 1800, dur: 0.09, type: "sine", gain: 0.07 }),
  shield: (t) => { tone(t, { f: 1760, dur: 0.12, type: "square", gain: 0.04 }); tone(t, { f: 2349, dur: 0.16, type: "sine", gain: 0.05 }); },
  packetLost: (t) => { noise(t, { dur: 0.12, f: 3000, q: 4, gain: 0.12 }); noise(t + 0.06, { dur: 0.08, f: 1800, q: 6, gain: 0.08 }); },
  outOfBand: (t) => tone(t, { f: 2093, dur: 0.06, type: "sine", gain: 0.04 }),
  windup: (t) => tone(t, { f: 220, to: 330, dur: 0.25, type: "triangle", gain: 0.05 }),
  ko: (t) => tone(t, { f: 440, to: 90, dur: 0.7, type: "sawtooth", gain: 0.12 }),
  levelUp: (t) => arp(t, [523, 659, 784, 1047, 1319], 0.07, { dur: 0.16, type: "triangle", gain: 0.1 }),
  // 학습·퀘스트
  correct: (t) => arp(t, [784, 1175], 0.07, { dur: 0.12, type: "sine", gain: 0.1 }),
  wrong: (t) => tone(t, { f: 233, to: 196, dur: 0.22, type: "square", gain: 0.06 }),
  perfect: (t) => arp(t, [523, 659, 784, 1047, 784, 1047], 0.08, { dur: 0.16, type: "triangle", gain: 0.1 }),
  questReady: (t) => arp(t, [1047, 1319, 1568, 2093], 0.07, { dur: 0.3, type: "sine", gain: 0.06 }),
  questComplete: (t) => { arp(t, [392, 523, 659, 784], 0.09, { dur: 0.2, type: "triangle", gain: 0.1 }); tone(t + 0.36, { f: 1047, dur: 0.6, type: "triangle", gain: 0.1 }); },
  coin: (t) => arp(t, [1319, 1760, 2637], 0.05, { dur: 0.12, type: "square", gain: 0.05 }),
  // 알바·강화·던전
  beacon: (t) => tone(t, { f: 2400, dur: 0.03, type: "sine", gain: 0.03 }),
  measure: (t) => arp(t, [880, 1320], 0.05, { dur: 0.08, type: "square", gain: 0.06 }),
  upgradeOk: (t) => { noise(t, { dur: 0.06, f: 3000, gain: 0.1 }); arp(t + 0.05, [659, 988, 1319], 0.06, { dur: 0.14, type: "triangle", gain: 0.1 }); },
  upgradeFail: (t) => { noise(t, { dur: 0.1, f: 900, gain: 0.12 }); tone(t + 0.04, { f: 196, to: 147, dur: 0.25, type: "triangle", gain: 0.1 }); },
  portal: (t) => { noise(t, { dur: 0.6, f: 300, to: 2400, q: 3, gain: 0.12 }); tone(t, { f: 220, to: 880, dur: 0.6, type: "sine", gain: 0.06 }); },
  afh: (t) => arp(t, [1568, 1319, 1568, 2093], 0.04, { dur: 0.06, type: "square", gain: 0.05 }),
  channelToggle: (t) => tone(t, { f: 1760, dur: 0.03, type: "square", gain: 0.04 })
};
export const SFX_NAMES = Object.freeze(Object.keys(SFX));

// 같은 소리가 한 프레임에 여러 번 겹치면 귀가 아프다 — 이름별 최소 간격
const lastAt = new Map();
const MIN_GAP = 0.03;

/**
 * 효과음 재생
 * @param {keyof typeof SFX} name
 */
export function sfx(name) {
  if (log.length >= LOG_MAX) log.shift();
  log.push(name);
  if (!SFX[name] || !ctx || ctx.state !== "running" || settings.muted) return;
  const t = ctx.currentTime;
  if (t - (lastAt.get(name) ?? -1) < MIN_GAP) return;
  lastAt.set(name, t);
  try { SFX[name](t + 0.005); } catch { /* 합성 실패는 무시 (게임 진행에 영향 없음) */ }
}

// ---------- 생성형 BGM ----------
// 4초마다 코드 하나(패드) + 오음음계 플럭을 드문드문. 마을 = 장조 진행, 던전 = 단조·저음.
const BGM = {
  village: { chords: [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]], scale: [523, 587, 659, 784, 880, 1047], bar: 4 },
  dungeon: { chords: [[110.0, 130.8, 164.8], [146.8, 174.6, 220.0], [123.5, 155.6, 185.0], [110.0, 130.8, 164.8]], scale: [220, 262, 294, 330, 392, 440], bar: 5 }
};
let bgmMode = null;
let bgmTimer = null;
let bgmBar = 0;
let bgmNext = 0;
let bgmRng = 7;
const bgmRand = () => ((bgmRng = (bgmRng * 1103515245 + 12345) >>> 0) / 2 ** 32);

function scheduleBgm() {
  if (!ctx || !bgmMode || ctx.state !== "running") return;
  const song = BGM[bgmMode];
  while (bgmNext < ctx.currentTime + 1.5) {
    const chord = song.chords[bgmBar % song.chords.length];
    for (const f of chord) tone(bgmNext, { f, dur: song.bar * 0.98, type: "triangle", gain: 0.05, attack: 0.8, bus: bgmBus });
    tone(bgmNext, { f: chord[0] / 2, dur: song.bar * 0.9, type: "sine", gain: 0.06, attack: 0.3, bus: bgmBus });
    // 플럭 2~4개
    const n = 2 + Math.floor(bgmRand() * 3);
    for (let i = 0; i < n; i++) {
      const f = song.scale[Math.floor(bgmRand() * song.scale.length)];
      tone(bgmNext + (song.bar * (i + bgmRand() * 0.5)) / n, { f, dur: 0.6, type: "sine", gain: 0.035, bus: bgmBus });
    }
    bgmNext += song.bar;
    bgmBar++;
  }
}

/** BGM 장면 전환: "village" | "dungeon" | null(정지) */
export function setBgm(mode) {
  if (mode === bgmMode) return;
  bgmMode = mode;
  log.push(`bgm:${mode}`);
  if (!ctx) return;
  bgmNext = Math.max(ctx.currentTime + 0.1, bgmNext);
  bgmBar = 0;
}

// ---------- 설정 ----------
export const isMuted = () => settings.muted;
export function setMuted(m) {
  settings.muted = Boolean(m);
  applyVolume();
  saveSettings();
  if (!settings.muted) sfx("select");
}
export const toggleMute = () => setMuted(!settings.muted);
export const audioState = () => ({ ctx: ctx?.state ?? "none", muted: settings.muted, bgm: bgmMode, volume: settings.volume });
/** 테스트 훅: 최근 효과음 이름들 (since 이후) */
export const soundLog = () => [...log];
export const clearSoundLog = () => { log.length = 0; };

/**
 * @param {{ bgm?: boolean }} opts 테스트 모드에서는 BGM 타이머를 돌리지 않는다
 */
export function initAudio({ bgm = true } = {}) {
  loadSettings();
  // 자동 재생 정책: 첫 사용자 입력에서 AudioContext 생성·재개
  const unlock = () => {
    ensureCtx();
    ctx?.resume?.().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
  // 모든 버튼·보기·강좌 클릭에 기본 클릭음 (더 구체적인 효과음은 각 기능이 따로 낸다)
  document.addEventListener("click", (e) => {
    const b = e.target instanceof Element ? e.target.closest("button, .lib-btn, .course, .opt, a[target=_blank]") : null;
    if (b && !b.disabled) sfx("click");
  }, { capture: true });
  document.addEventListener("change", (e) => { if (e.target instanceof HTMLSelectElement) sfx("select"); }, { capture: true });
  // 팝업(오버레이·정보 모달)이 열리고 닫힐 때 — 모듈마다 넣지 않고 DOM 변화로 한 곳에서
  const watch = new MutationObserver((muts) => {
    for (const m of muts) {
      const el = /** @type {HTMLElement} */ (m.target);
      if (m.attributeName === "hidden") sfx(el.hidden ? "close" : "open");
    }
  });
  for (const el of document.querySelectorAll(".overlay")) watch.observe(el, { attributes: true, attributeFilter: ["hidden"] });
  if (bgm) bgmTimer = setInterval(scheduleBgm, 400);
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend?.().catch(() => {});
    else ctx.resume?.().catch(() => {});
  });
  return () => clearInterval(bgmTimer);
}
