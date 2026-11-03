// 첫 방문 설명서 + UI 투어 (Stage 11.13) — DOM 전용
// ① 설명서: 게임 콘셉트 3장 (카드 넘기기) ② 투어: 화면을 어둡게 하고 HUD 요소를 하나씩 비추며 말풍선으로 설명.
// 본 기록은 localStorage packetKnight.tips.intro (세이브 버전 그대로). 다시 보기: 조작법 상자·퀘스트 로그의 📘 버튼.

const SEEN_KEY = "packetKnight.tips.intro";

const PAGES = [
  {
    icon: "🛡️", title: "패킷 나이트에 온 걸 환영해요",
    body: [
      "여기는 2.4 GHz 전파가 흐르는 <b>스펙트럼 대륙</b>. 당신은 블루투스 저전력(BLE) 패킷을 다루는 기사 <b>애드워드</b>입니다 — 광고(<b>Ad</b>vertising) 패킷을 외치는 기사죠.",
      "게임 속 모든 것은 실제 BLE 규격을 본떴어요 — 광고 채널 37·38·39, 연결 이벤트마다 채널을 건너뛰는 호핑, Wi-Fi 간섭, 코인 전지 CR2032까지.",
      "모르는 게 나오면 건물 카드의 <b>📖 교과서</b> 링크로 connectivityBook의 그 장을 바로 열 수 있어요."
    ]
  },
  {
    icon: "🔁", title: "이렇게 성장해요",
    loop: [
      ["📚", "도서관", "교과서 퀴즈 만점 → 스탯 상승"],
      ["📡", "등대 알바", "RSSI로 비콘 찾기 → CR2032"],
      ["⚔️", "호핑 던전", "Wi-Fi 간섭 몬스터 격퇴"],
      ["🔨", "패킷 대장간", "CR2032로 장비 강화·스탯 분배"]
    ]
  },
  {
    icon: "📜", title: "무엇부터 할까요?",
    body: [
      "왼쪽 아래 <b>퀘스트 트래커</b>가 지금 할 일을 알려 줘요. 누르면 단계와 <b>📍 길 안내</b>가 펼쳐져요.",
      "퀘스트를 끝내면 교과서 장의 <b>📖 완독 배지</b>를 받아요. Q0 \"세계에 첫 패킷을 쏘다\"부터 시작!",
      "이어서 화면의 버튼들을 하나씩 소개할게요."
    ]
  }
];

/** 투어 단계 — 보이는 요소만 차례로 (데스크톱·모바일마다 다르다) */
const STEPS = [
  { sel: "#joystick-zone", title: "이동", text: "조이스틱을 끌어 걸어요. 바닥을 눌러도 그곳으로 걸어가요. (PC: WASD·클릭)" },
  { sel: "#btn-fire", title: "📡 ADV 패킷 발사", text: "가장 가까운 몬스터에게 광고 패킷을 쏴요. 쏘고 나면 버튼이 어두워졌다가 시계 방향으로 밝아져요 — 쿨타임. (PC: F)" },
  { sel: "#btn-jump", title: "🦘 점프", text: "턱을 넘거나 공격을 피할 때. (PC: 스페이스)" },
  { sel: "#hp", title: "❤️ HP = 연결 안정성", text: "0이 되면 연결 타임아웃 — 던전에서 쫓겨나요. 맞지 않고 3초가 지나면 회복돼요." },
  { sel: "#stats", title: "스탯", text: "TX(공격)·RX(회피)·HOP(속도)·SEC(방어)·PWR(배터리 효율)·CI(연결 간격 — 공격 쿨타임)와 CR2032·레벨. 모바일에선 눌러서 펼쳐요." },
  { sel: "#quest-tracker", title: "📜 지금 할 일", text: "진행 중인 퀘스트 한 줄. 누르면 단계와 📍 길 안내가 이 위로 펼쳐져요." },
  { sel: "#btn-quests", title: "퀘스트 로그", text: "모든 퀘스트·🔮 예측해 보기·📖 완독 배지. (PC: Q)" },
  { sel: "#badge", title: "지금 상태", text: "어디에 있는지, 무엇을 하는 중인지 알려 줘요." },
  { sel: "#btn-help", title: "❔ 조작법", text: "키 조작 전체를 펼쳐 봐요. 이 설명서와 투어도 여기서 다시 볼 수 있어요. (PC: H)" },
  { sel: "#btn-guide", title: "❔ 다시 보기", text: "이 설명서와 버튼 소개를 언제든 다시 볼 수 있어요." },
  { sel: "#btn-sound", title: "🔊 소리", text: "효과음·배경음 켜고 끄기. (PC: M)" },
  { sel: null, title: "건물을 눌러 보세요", text: "건물 위 이름표를 누르면 정보 카드가 떠요 — 도서관·대장간·등대·던전 입구로 들어가는 문이에요. 그럼 광장을 10 m 걸어 보는 것부터!" }
];

let root, onEnd = () => {}, page = 0, step = 0, steps = [];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

function ensureRoot() {
  if (root) return;
  root = el("div", "tut-root");
  root.hidden = true;
  document.body.append(root);
  window.addEventListener("keydown", (e) => {
    if (root.hidden) return;
    if (e.key === "Escape") { e.stopPropagation(); finish(); }
    else if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); prev(); }
  }, { capture: true });
  window.addEventListener("resize", () => { if (!root.hidden && root.dataset.mode === "tour") placeStep(); });
}

// ---------- ① 설명서 ----------
function showPage() {
  root.dataset.mode = "manual";
  const p = PAGES[page];
  const card = el("div", "tut-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "게임 설명서");
  card.append(el("div", "tut-icon", p.icon), el("h2", "tut-title", p.title));
  if (p.body) card.append(...p.body.map((t) => el("p", "tut-p", t)));
  if (p.loop) {
    const loop = el("div", "tut-loop");
    p.loop.forEach(([i, name, what], n) => {
      loop.append(el("div", "tut-node", `<span class="tut-node-i">${i}</span><b>${name}</b><small>${what}</small>`));
      if (n < p.loop.length - 1) loop.append(el("div", "tut-arrow", "→"));
    });
    card.append(loop, el("p", "tut-p tut-center", "↺ 강해지면 다시 도서관으로 — 더 깊은 장, 더 깊은 층"));
  }
  const dots = el("div", "tut-dots", PAGES.map((_, i) => `<i class="${i === page ? "on" : ""}"></i>`).join(""));
  const actions = el("div", "tut-actions");
  const skip = el("button", "tut-btn ghost", "건너뛰기"); skip.type = "button"; skip.onclick = finish;
  const back = el("button", "tut-btn", "← 이전"); back.type = "button"; back.onclick = prev; back.disabled = page === 0;
  const fwd = el("button", "tut-btn primary", page === PAGES.length - 1 ? "버튼 소개 시작 ▶" : "다음 →"); fwd.type = "button"; fwd.onclick = next;
  actions.append(skip, el("span", "tut-gap"), back, fwd);
  card.append(dots, actions);
  root.replaceChildren(el("div", "tut-dim"), card);
  fwd.focus({ preventScroll: true });
}

// ---------- ② 투어 ----------
const visible = (s) => { if (!s.sel) return true; const n = document.querySelector(s.sel); if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== "hidden" && !n.closest("[hidden]"); };
function showStep() {
  root.dataset.mode = "tour";
  const s = steps[step];
  const spot = el("div", "tut-spot");
  const tip = el("div", "tut-tip");
  tip.setAttribute("role", "dialog");
  tip.setAttribute("aria-label", s.title);
  tip.append(el("div", "tut-step", `${step + 1} / ${steps.length}`), el("b", "tut-tip-title", s.title), el("p", "tut-tip-text", s.text));
  const actions = el("div", "tut-actions");
  const skip = el("button", "tut-btn ghost", "건너뛰기"); skip.type = "button"; skip.onclick = finish;
  const back = el("button", "tut-btn", "←"); back.type = "button"; back.onclick = prev; back.disabled = step === 0;
  const fwd = el("button", "tut-btn primary", step === steps.length - 1 ? "시작하기 ✓" : "다음 →"); fwd.type = "button"; fwd.onclick = next;
  actions.append(skip, el("span", "tut-gap"), back, fwd);
  tip.append(actions);
  root.replaceChildren(el("div", "tut-catch"), spot, tip);
  placeStep();
  fwd.focus({ preventScroll: true });
}
function placeStep() {
  const s = steps[step];
  const spot = root.querySelector(".tut-spot"), tip = root.querySelector(".tut-tip");
  if (!spot || !tip) return;
  const W = window.innerWidth, H = window.innerHeight;
  if (!s.sel) {                                     // 대상 없는 단계: 가운데 큰 원 (마을을 가리킨다)
    Object.assign(spot.style, { left: `${W / 2 - 90}px`, top: `${H / 2 - 90}px`, width: "180px", height: "180px", borderRadius: "50%" });
  } else {
    const r = document.querySelector(s.sel).getBoundingClientRect(), pad = 8;
    const round = getComputedStyle(document.querySelector(s.sel)).borderRadius;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, borderRadius: round === "50%" ? "50%" : "16px" });
  }
  const sr = spot.getBoundingClientRect();
  const tw = Math.min(320, W - 24);
  tip.style.width = `${tw}px`;
  const th = tip.offsetHeight;
  const below = sr.bottom + 12 + th < H - 8 && (sr.top + sr.height / 2 < H / 2 || sr.top - 12 - th < 8);
  const top = below ? sr.bottom + 12 : Math.max(8, sr.top - 12 - th);
  const left = Math.min(W - tw - 12, Math.max(12, sr.left + sr.width / 2 - tw / 2));
  Object.assign(tip.style, { top: `${top}px`, left: `${left}px` });
  tip.dataset.side = below ? "below" : "above";
}

function next() {
  if (root.dataset.mode === "manual") {
    if (page < PAGES.length - 1) { page++; showPage(); return; }
    steps = STEPS.filter(visible);
    step = 0;
    showStep();
    return;
  }
  if (step < steps.length - 1) { step++; showStep(); } else finish();
}
function prev() {
  if (root.dataset.mode === "manual") { if (page > 0) { page--; showPage(); } return; }
  if (step > 0) { step--; showStep(); }
}
function finish() {
  if (!root || root.hidden) return;
  root.hidden = true;
  root.replaceChildren();
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* 다음에 또 보일 뿐 */ }
  onEnd();
}

/** 설명서부터 시작 (onDone: 끝나거나 건너뛰면) */
export function startTutorial(onDone = () => {}) {
  ensureRoot();
  onEnd = onDone;
  page = 0;
  root.hidden = false;
  showPage();
}
export const isTutorialOpen = () => Boolean(root && !root.hidden);
export function tutorialSeen() {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; }
}
/** 테스트 훅 */
export const tutorialState = () => ({ open: isTutorialOpen(), mode: root?.dataset.mode ?? null, page, step, steps: steps.map((s) => s.sel) });
export const tutorialNext = () => next();
