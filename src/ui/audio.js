// 사운드 — Web Audio API 합성 효과음 · BGM 음원 재생 (Stage 11·12.9, PRD §7) (브라우저 전용)
//
// 효과음은 음원 파일 없이 오실레이터·노이즈로 합성한다. 배경음악만 CC0 음원 파일을 쓴다 (Stage 12.9). 소리는 "패킷" 은유를 따른다:
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
    bgmBus.gain.value = 0.3;
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
  // 발사 — 무기별 타격감 고도화 (Stage 13.9)
  fire: (t) => {
    noise(t, { dur: 0.12, f: 3200, to: 600, q: 1.5, gain: 0.18 });
    tone(t, { f: 180, to: 60, dur: 0.14, type: "sine", gain: 0.15 });
    tone(t + 0.02, { f: 880, to: 1760, dur: 0.08, type: "triangle", gain: 0.07 });
  }, // ADV 패킷 검: 베는 풍절음 + 단일 반송파 신호음
  fire_dagger: (t) => {
    noise(t, { dur: 0.045, f: 4500, to: 1600, q: 2, gain: 0.12 });
    tone(t, { f: 2000, to: 900, dur: 0.04, type: "triangle", gain: 0.06 });
    noise(t + 0.045, { dur: 0.05, f: 5500, to: 2000, q: 2.2, gain: 0.14 });
    tone(t + 0.045, { f: 2400, to: 1100, dur: 0.045, type: "triangle", gain: 0.07 });
  }, // 2M PHY 쌍단검: 0.045초 간격의 쾌속 2단 베기
  fire_bow: (t) => {
    tone(t, { f: 340, to: 80, dur: 0.12, type: "triangle", gain: 0.2 });
    noise(t, { dur: 0.06, f: 1200, to: 300, q: 1.8, gain: 0.15, type: "lowpass" });
    tone(t + 0.02, { f: 320, to: 1960, dur: 0.22, type: "sine", gain: 0.12 });
    noise(t + 0.04, { dur: 0.18, f: 2800, to: 900, q: 1.2, gain: 0.08 });
  }, // Coded S=8 장궁: 시위 탄성음 + 뻗어나가는 롱레인지 레이저
  fire_fan: (t) => {
    noise(t, { dur: 0.15, f: 1800, to: 4200, q: 1.2, gain: 0.12 });
    arp(t + 0.01, [1046, 1568, 2093], 0.03, { dur: 0.14, type: "sine", gain: 0.08 });
    tone(t + 0.04, { f: 2637, to: 1319, dur: 0.1, type: "triangle", gain: 0.05 });
  }, // 확장 광고 부채: 펼쳐지는 풍절음 + 3방향 확산 신호파
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
  // 몬스터별 공격 예고·공격음 (Stage 13.9) — windup_<type> = 기를 모으는 소리, atk_<type> = 공격이 터지는 소리
  windup_trainingBot: (t) => arp(t, [523, 784], 0.08, { dur: 0.1, type: "square", gain: 0.04 }),                                   // 삐-삐 (훈련 봇)
  atk_trainingBot: (t) => {
    noise(t, { dur: 0.04, f: 1600, to: 400, q: 1.5, gain: 0.14 });
    noise(t + 0.03, { dur: 0.05, f: 800, to: 200, q: 1, gain: 0.16, type: "lowpass" });
    tone(t + 0.02, { f: 440, to: 160, dur: 0.1, type: "sine", gain: 0.1 });
  }, // 피스톤 2단 철컥 + 뾱 펀치
  windup_wifiInterferer: (t) => { noise(t, { dur: 0.45, f: 400, to: 3000, q: 3, gain: 0.07 }); tone(t, { f: 120, to: 240, dur: 0.45, type: "sawtooth", gain: 0.03 }); }, // 정전기 차오름
  atk_wifiInterferer: (t) => {
    noise(t, { dur: 0.28, f: 3800, to: 400, q: 0.8, gain: 0.22 });
    noise(t + 0.06, { dur: 0.2, f: 2200, to: 200, q: 1.2, gain: 0.18 });
    tone(t, { f: 90, to: 35, dur: 0.35, type: "sawtooth", gain: 0.14 });
    tone(t, { f: 60, to: 30, dur: 0.4, type: "sine", gain: 0.2 });
  }, // 20MHz 광역 OFDM 스파크 방전 & 묵직한 서브우퍼
  windup_advFlooder: (t) => arp(t, [1760, 2093, 1760, 2349], 0.045, { dur: 0.04, type: "square", gain: 0.035 }),                    // 다다닥 처프
  atk_advFlooder: (t) => {
    [1975, 1760, 1568, 1319].forEach((f, i) => {
      const dt = i * 0.028;
      tone(t + dt, { f, to: f * 0.7, dur: 0.04, type: "square", gain: 0.07 });
      noise(t + dt, { dur: 0.025, f: 4000, to: 1200, q: 2, gain: 0.1 });
    });
  }, // 20ms 간격 4연발 기관총 처프
  windup_microwave: (t) => {
    // 마그네트론 가열 윙— (모바일에서도 잘 들리는 160~320Hz 배음 웅—)
    tone(t, { f: 160, to: 320, dur: 0.9, type: "sawtooth", gain: 0.14, attack: 0.2 });
    tone(t, { f: 110, to: 220, dur: 0.9, type: "triangle", gain: 0.16, attack: 0.2 });
    noise(t + 0.2, { dur: 0.7, f: 2450, q: 3, gain: 0.09 });
  }, // 웅— (마그네트론 가열)
  atk_microwave: (t) => {
    // 콰앙! 마그네트론 광역 파열 (모바일에서도 찰진 240~60Hz 펀치 + 1800Hz 크런치)
    noise(t, { dur: 0.35, f: 1800, to: 220, q: 1.0, gain: 0.32 });
    tone(t, { f: 240, to: 60, dur: 0.35, type: "sawtooth", gain: 0.22 });
    tone(t, { f: 140, to: 45, dur: 0.4, type: "triangle", gain: 0.25 });
    // 2.45GHz 지글거리는 잔향
    noise(t + 0.05, { dur: 0.22, f: 2450, q: 2.5, gain: 0.18 });
    // 조리 완료 '땡!!' 선명한 벨소리
    tone(t + 0.15, { f: 1568, dur: 0.6, type: "sine", gain: 0.25, attack: 0.002 });
  }, // 2.45GHz 마그네트론 고주파 파동 + 콰앙 + 끝에 울리는 '땡!'
  // 📡 보스 전자레인지 오븐 (Stage 13.19): 전자레인지 소리를 한 옥타브 낮게 겹치고 더 길게
  windup_ovenBoss: (t) => { SFX.windup_microwave(t); tone(t, { f: 55, to: 110, dur: 1.2, type: "sawtooth", gain: 0.12, attack: 0.3 }); },
  atk_ovenBoss: (t) => { SFX.atk_microwave(t); tone(t, { f: 90, to: 28, dur: 0.6, type: "sine", gain: 0.3 }); noise(t + 0.05, { dur: 0.4, f: 900, to: 120, q: 0.7, gain: 0.2, type: "lowpass" }); },
  bossRage: (t) => { for (let i = 0; i < 3; i++) tone(t + i * 0.18, { f: 220 * (i + 1), to: 330 * (i + 1), dur: 0.25, type: "square", gain: 0.06 }); noise(t, { dur: 0.6, f: 300, to: 3000, q: 2, gain: 0.15 }); },
  bossDown: (t) => { arp(t, [392, 523, 659, 784, 1047, 1319], 0.08, { dur: 0.25, type: "triangle", gain: 0.11 }); tone(t + 0.5, { f: 1568, dur: 0.9, type: "sine", gain: 0.08 }); },
  windup_sniffer: (t) => tone(t, { f: 400, to: 3200, dur: 0.75, type: "sine", gain: 0.04, attack: 0.4 }),                          // 레이저 충전
  atk_sniffer: (t) => {
    tone(t, { f: 3600, to: 440, dur: 0.12, type: "square", gain: 0.1 });
    noise(t, { dur: 0.08, f: 5500, to: 1800, q: 2.5, gain: 0.12 });
    tone(t + 0.05, { f: 988, to: 494, dur: 0.08, type: "sawtooth", gain: 0.06 });
  }, // 날카로운 관통 탄환 + 도청 글리치
  ko: (t) => tone(t, { f: 440, to: 90, dur: 0.7, type: "sawtooth", gain: 0.12 }),
  // 시작 연출 "두둥" (Stage 13.6) — 엠블럼이 가운데서 두 번 고동칠 때 맞춰 낮은 북 두 번 + 반짝
  dudung: (t) => {
    for (const [dt, g] of [[0.48, 0.32], [0.74, 0.4]]) {
      tone(t + dt, { f: 110, to: 38, dur: 0.42, type: "sine", gain: g });
      noise(t + dt, { dur: 0.12, f: 180, to: 60, q: 0.8, gain: 0.12, type: "lowpass" });
    }
    arp(t + 0.76, [784, 1175, 1568], 0.05, { dur: 0.3, type: "triangle", gain: 0.05 });
    arp(t + 1.9, [2093, 2637], 0.06, { dur: 0.35, type: "sine", gain: 0.05 });   // 왼쪽 위에 앉으며 반짝 — 띵
  },
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

// ---------- BGM 음원 (Stage 12.9: 마을 = 잔잔한 통기타 "Peaceful Days", 던전 = 빠른 8비트 "Battle 1", CC0) ----------
// 효과음은 계속 합성하고, 배경음악만 음원 파일(src/assets/bgm/*.mp3)을 반복 재생한다.
// <audio>로 틀면 모바일이 "미디어 재생"으로 보고 상태표시줄·잠금화면에 음악 알림을 띄운다 (Stage 12.10) →
// 파일을 받아 Web Audio 버퍼로 풀고(decodeAudioData) AudioBufferSourceNode로 반복한다. 게임 효과음처럼 취급돼 알림이 없다.
// BGM 버스로 이어 음소거·볼륨을 따르고, 장면이 바뀌면 교차 페이드 + 멈춘 자리 기억. 테스트 모드는 불러오지 않는다.
const BGM_FILES = {
  village: new URL("../assets/bgm/bgm-village.mp3", import.meta.url).href,
  dungeon: new URL("../assets/bgm/bgm-dungeon.mp3", import.meta.url).href
};
let bgmMode = null;
let bgmEnabled = false;
const bgmTracks = {};
const bgmBytes = {};
/** 파일 받기만 (압축된 채로) — 마을에 있는 동안 던전 곡을 미리 받아 둘 때도 쓴다 */
const fetchBgm = (mode) => (bgmBytes[mode] ??= fetch(BGM_FILES[mode]).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }));
function bgmTrack(mode) {
  if (bgmTracks[mode]) return bgmTracks[mode];
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(bgmBus);
  const tr = { gain, buf: null, src: null, startedAt: 0, offset: 0 };
  fetchBgm(mode).then((bytes) => ctx.decodeAudioData(bytes.slice(0))).then((buf) => { tr.buf = buf; syncBgm(); }).catch(() => { /* 음원이 없으면 조용히 */ });
  return (bgmTracks[mode] = tr);
}
function startTrack(tr) {
  if (tr.src || !tr.buf) return;
  const src = ctx.createBufferSource();
  src.buffer = tr.buf;
  src.loop = true;
  src.connect(tr.gain);
  src.start(0, tr.offset % tr.buf.duration);
  tr.startedAt = ctx.currentTime - tr.offset;
  tr.src = src;
}
function stopTrack(tr) {
  if (!tr.src) return;
  tr.offset = (ctx.currentTime - tr.startedAt) % tr.buf.duration;
  try { tr.src.stop(); } catch { /* 이미 멈춤 */ }
  tr.src.disconnect();
  tr.src = null;
}
/** 지금 장면의 곡은 페이드 인, 나머지는 페이드 아웃 후 정지 */
function syncBgm() {
  if (!bgmEnabled || !ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  for (const mode of Object.keys(BGM_FILES)) {
    const on = mode === bgmMode && !document.hidden;
    const tr = on ? bgmTrack(mode) : bgmTracks[mode];
    if (!tr) continue;
    tr.gain.gain.cancelScheduledValues(now);
    tr.gain.gain.setTargetAtTime(on ? 1 : 0, now, on ? 0.5 : 0.25);
    clearTimeout(tr.timer);
    if (on) {
      startTrack(tr);
      // 마을에 있는 동안 던전 곡을 미리 받아 둔다 — 첫 입장 때 음악이 늦게 시작하지 않게
      if (mode === "village") setTimeout(() => fetchBgm("dungeon").catch(() => {}), 5000);
    } else if (tr.src) tr.timer = setTimeout(() => { if (bgmMode !== mode || document.hidden) stopTrack(tr); }, 1500);
  }
}

/** BGM 장면 전환: "village" | "dungeon" | null(정지) */
export function setBgm(mode) {
  if (mode === bgmMode) return;
  bgmMode = mode;
  log.push(`bgm:${mode}`);
  try { syncBgm(); } catch { /* 음원 재생 실패는 무시 */ }
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
/** 볼륨 0~1 (설정 창 슬라이더, Stage 13.1) */
export function setVolume(v) {
  settings.volume = Math.min(1, Math.max(0, Number(v) || 0));
  applyVolume();
  saveSettings();
}
export const audioState = () => ({ ctx: ctx?.state ?? "none", muted: settings.muted, bgm: bgmMode, volume: settings.volume, playing: Object.keys(bgmTracks).filter((m) => bgmTracks[m].src) });
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
    ctx?.resume?.().then(() => { try { syncBgm(); } catch { /* 무시 */ } }).catch(() => {});
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
  bgmEnabled = bgm;
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) { syncBgm(); ctx.suspend?.().catch(() => {}); }
    else ctx.resume?.().then(() => syncBgm()).catch(() => {});
  });
  return () => { bgmEnabled = false; for (const tr of Object.values(bgmTracks)) stopTrack(tr); };
}
