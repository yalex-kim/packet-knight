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
  // 발사 — 무기마다 (Stage 12.6). fire = 검: 휙 베는 바람 + 하강 처프
  fire: (t) => { noise(t, { dur: 0.16, f: 900, to: 3200, q: 1.2, gain: 0.12 }); tone(t, { f: 1500, to: 420, dur: 0.12, type: "square", gain: 0.05 }); },
  fire_dagger: (t) => { tone(t, { f: 2400, to: 1200, dur: 0.05, type: "square", gain: 0.05 }); noise(t, { dur: 0.05, f: 5000, q: 2, gain: 0.08 }); },       // 짧고 높은 "칙"
  fire_bow: (t) => { tone(t, { f: 180, to: 140, dur: 0.18, type: "triangle", gain: 0.12 }); tone(t, { f: 360, to: 300, dur: 0.12, type: "sine", gain: 0.05 }); noise(t + 0.03, { dur: 0.22, f: 2500, to: 600, q: 1, gain: 0.07 }); },  // 시위 퉁 + 바람
  fire_fan: (t) => arp(t, [1568, 2093, 2637], 0.035, { dur: 0.12, type: "sine", gain: 0.05 }),                                                               // 세 갈래 반짝
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
  // 몬스터별 공격 예고·공격음 (Stage 12.8) — windup_<type> = 기를 모으는 소리, atk_<type> = 공격이 터지는 소리
  windup_trainingBot: (t) => arp(t, [523, 784], 0.08, { dur: 0.1, type: "square", gain: 0.04 }),                                   // 삐-삐 (훈련 봇)
  atk_trainingBot: (t) => { noise(t, { dur: 0.06, f: 700, q: 1, gain: 0.1 }); tone(t, { f: 330, to: 220, dur: 0.08, type: "square", gain: 0.05 }); },
  windup_wifiInterferer: (t) => { noise(t, { dur: 0.45, f: 400, to: 3000, q: 3, gain: 0.07 }); tone(t, { f: 120, to: 240, dur: 0.45, type: "sawtooth", gain: 0.03 }); }, // 정전기 차오름
  atk_wifiInterferer: (t) => { noise(t, { dur: 0.35, f: 2400, to: 300, q: 0.7, gain: 0.16 }); tone(t, { f: 90, to: 45, dur: 0.3, type: "sawtooth", gain: 0.08 }); },     // 광역 지지직 폭발
  windup_advFlooder: (t) => arp(t, [1760, 2093, 1760, 2349], 0.045, { dur: 0.04, type: "square", gain: 0.035 }),                    // 다다닥 처프
  atk_advFlooder: (t) => arp(t, [2637, 2349, 2093, 1760, 1568], 0.03, { dur: 0.035, type: "square", gain: 0.045 }),               // 광고 폭주 연타
  windup_microwave: (t) => { tone(t, { f: 60, dur: 0.6, type: "sawtooth", gain: 0.06, attack: 0.15 }); tone(t, { f: 120, dur: 0.6, type: "square", gain: 0.025, attack: 0.15 }); }, // 웅— (마그네트론)
  atk_microwave: (t) => { noise(t, { dur: 0.3, f: 500, to: 150, q: 0.9, gain: 0.18, type: "lowpass" }); tone(t, { f: 70, to: 40, dur: 0.3, type: "sawtooth", gain: 0.09 }); tone(t + 0.22, { f: 1568, dur: 0.5, type: "sine", gain: 0.06 }); }, // 쾅 + 땡!
  windup_sniffer: (t) => tone(t, { f: 400, to: 3200, dur: 0.75, type: "sine", gain: 0.04, attack: 0.4 }),                          // 레이저 충전
  atk_sniffer: (t) => { tone(t, { f: 3200, to: 500, dur: 0.16, type: "square", gain: 0.06 }); noise(t, { dur: 0.1, f: 6000, q: 3, gain: 0.08 }); }, // 지잉— 사격
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

// ---------- 생성형 BGM (Stage 12.6: 마을 = 평화로운 오르골, 던전 = 긴박한 드럼·베이스) ----------
// 한 마디씩 미리 예약한다. 마을은 장조 I–vi–IV–V 위에 부드러운 패드 + 오르골 아르페지오(8분음표),
// 던전은 128 BPM 단조 i–VI–VII–v, 8분음표 베이스 반복구 + 킥·스네어·하이햇 + 스타카토 아르페지오 + 가끔 긴장 화음.
const BGM = {
  village: { bar: 3.2, chords: [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]] },
  dungeon: { bar: 1.875, chords: [[110.0, 130.8, 164.8], [87.3, 110.0, 130.8], [98.0, 123.5, 146.8], [82.4, 98.0, 123.5]] }
};
let bgmMode = null;
let bgmTimer = null;
let bgmBar = 0;
let bgmNext = 0;
let bgmRng = 7;
const bgmRand = () => ((bgmRng = (bgmRng * 1103515245 + 12345) >>> 0) / 2 ** 32);
/** 드럼 (BGM 버스로) */
function kick(t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(bgmBus); o.start(t); o.stop(t + 0.2);
}
function hiss(t, { dur, f, q = 1, gain, type = "highpass" }) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(bgmBus); src.start(t); src.stop(t + dur + 0.02);
}

function villageBar(t, song) {
  const chord = song.chords[bgmBar % song.chords.length], b = song.bar;
  for (const f of chord) tone(t, { f, dur: b * 0.98, type: "sine", gain: 0.035, attack: 1.0, bus: bgmBus });       // 부드러운 패드
  tone(t, { f: chord[0] / 2, dur: b * 0.48, type: "sine", gain: 0.05, attack: 0.2, bus: bgmBus });                 // 베이스: 1·3박
  tone(t + b / 2, { f: chord[2] / 2, dur: b * 0.45, type: "sine", gain: 0.04, attack: 0.2, bus: bgmBus });
  // 오르골 아르페지오: 화음을 두 옥타브 올려 8분음표로 오르내린다 (가끔 쉰다)
  const notes = [chord[0] * 2, chord[1] * 2, chord[2] * 2, chord[0] * 4, chord[2] * 2, chord[1] * 2, chord[0] * 2, chord[1] * 2];
  notes.forEach((f, k) => { if (bgmRand() < 0.82) tone(t + (k * b) / 8, { f, dur: 0.5, type: "triangle", gain: 0.03, attack: 0.004, bus: bgmBus }); });
  if (bgmBar % 4 === 3) tone(t + b * 0.75, { f: 1568, dur: 0.9, type: "sine", gain: 0.02, bus: bgmBus });           // 반짝 (네 마디마다)
}

function dungeonBar(t, song) {
  const chord = song.chords[bgmBar % song.chords.length], b = song.bar, e = b / 8;
  tone(t, { f: chord[0] * 2, dur: b, type: "sawtooth", gain: 0.012, attack: 0.3, bus: bgmBus });                  // 어두운 패드
  tone(t, { f: chord[2] * 2, dur: b, type: "sawtooth", gain: 0.01, attack: 0.3, bus: bgmBus });
  for (let k = 0; k < 8; k++) {                                                                                     // 8분음표 베이스 반복구
    const f = k % 4 === 3 ? chord[1] / 2 : chord[0] / 2;
    tone(t + k * e, { f, dur: e * 0.8, type: "square", gain: 0.035, attack: 0.004, bus: bgmBus });
  }
  for (const k of [0, 3, 4, 6]) kick(t + k * e);                                                                   // 킥 (밀어붙이는 박)
  for (const k of [2, 6]) hiss(t + k * e, { dur: 0.12, f: 1800, q: 0.8, gain: 0.08, type: "bandpass" });          // 스네어
  for (let k = 0; k < 16; k++) hiss(t + (k * b) / 16, { dur: 0.03, f: 7000, gain: k % 2 ? 0.015 : 0.03 });          // 하이햇 16분
  const arpN = [chord[0] * 4, chord[1] * 4, chord[2] * 4, chord[1] * 4];                                          // 스타카토 아르페지오
  for (let k = 0; k < 8; k++) tone(t + k * e, { f: arpN[k % 4], dur: e * 0.45, type: "triangle", gain: 0.018, attack: 0.003, bus: bgmBus });
  if (bgmBar % 4 === 3) tone(t + b * 0.5, { f: chord[0] * 4 * 1.06, dur: b * 0.5, type: "sawtooth", gain: 0.012, bus: bgmBus });   // 반음 위 긴장 화음
}

function scheduleBgm() {
  if (!ctx || !bgmMode || ctx.state !== "running") return;
  const song = BGM[bgmMode];
  while (bgmNext < ctx.currentTime + 1.5) {
    (bgmMode === "dungeon" ? dungeonBar : villageBar)(bgmNext, song);
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
