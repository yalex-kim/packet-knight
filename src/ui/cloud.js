// 구글 로그인 · 클라우드 세이브 · 랭킹 (Stage 13) — DOM + 네트워크 (functions/api/*)
//
// - 구글 One Tap(auto_select): 한 번 허락하면 다음부터는 들어오기만 해도 저절로 로그인된다.
// - 로그인하면 진행도를 서버(D1)에 올린다. 저장할 때마다 15초 모아서, 탭을 떠날 때는 바로.
// - 다른 기기의 진행도가 더 앞서 있으면 어느 쪽으로 이어갈지 묻는다 (이 기기가 새것이면 묻지 않고 불러온다).
// - 랭킹 창은 숨은 나무를 눌러야 열린다 (main.js · world.secretTree).
// 서버나 클라이언트 ID가 없으면(로컬 개발·테스트) 조용히 꺼진다 — 게임은 지금처럼 브라우저 저장만 쓴다.

import { levelFromXp } from "../core/combat.js";
import { isValidSave } from "../core/progress.js";

const GSI_SRC = "https://accounts.google.com/gsi/client";
const UPLOAD_DELAY = 15000;

let hooks = null;
let clientId = "";
let user = null;           // { name }
let enabled = false;
let timer = 0;
let dirty = false;
let lastSavedAt = null;
let gsiLoading = null;
let overlay = null;

const api = async (path, opts = {}) => {
  const r = await fetch(`/api/${path}`, { credentials: "same-origin", ...opts, headers: { "content-type": "application/json", ...(opts.headers ?? {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error ?? r.status), { status: r.status });
  return body;
};

/** 진행도 비교용 숫자 — XP, 최고 층, 배지 */
const score = (s) => [s?.xp ?? 0, s?.dungeon?.maxFloor ?? 0, Object.keys(s?.quests?.done ?? {}).length];
const ahead = (a, b) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
const isFresh = (s) => (s?.xp ?? 0) === 0 && Object.keys(s?.cleared ?? {}).length === 0 && (s?.cr2032 ?? 0) === 0;
const summary = (s) => `Lv ${levelFromXp(s?.xp ?? 0).level} · 던전 ${s?.dungeon?.maxFloor ?? 0}층 · 배지 ${Object.keys(s?.quests?.done ?? {}).length}`;

/**
 * @param {{ getProgress: () => any, adoptSave: (save: any) => void, toast: (msg: string, sec?: number) => void,
 *           sfx?: (name: string) => void, disabled?: boolean }} h
 */
export async function initCloud(h) {
  hooks = h;
  if (h.disabled) return;
  try {
    clientId = (await api("config")).googleClientId || "";
  } catch { return; }   // 서버 없음 (로컬 정적 서버)
  if (!clientId) return;
  enabled = true;
  renderAccount();
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(true); });
  window.addEventListener("pagehide", () => flush(true));
  try {
    const me = await api("me");
    if (me.user) { user = me.user; lastSavedAt = me.savedAt; renderAccount(); await reconcile(me.save); }
  } catch { /* 오프라인 — 다음 저장 때 다시 */ }
  renderAccount();
  if (!user) promptLogin();   // 시작 화면에서 바로 One Tap (전에 허락한 계정이면 저절로)
  const msg = sessionStorage.getItem("pk.cloudMsg");
  if (msg) { sessionStorage.removeItem("pk.cloudMsg"); toastLater(msg, 4); }
}

/** 시작 화면이 걷힌 뒤에 보이도록 안내를 미룬다 */
function toastLater(msg, sec) {
  const go = () => (document.body.classList.contains("prestart") ? setTimeout(go, 800) : setTimeout(() => hooks.toast(msg, sec), 1200));
  go();
}

/** 시작 버튼을 누른 뒤 — 로그인 안 했으면 One Tap (한 번 허락한 계정이면 저절로) */
let prompted = false;
export function promptLogin() {
  if (!enabled || user || prompted) return;
  prompted = true;
  loadGsi().then((g) => g.accounts.id.prompt()).catch(() => {});
}

function loadGsi() {
  gsiLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_SRC; s.async = true;
    s.onload = () => {
      const g = window.google;
      if (!g?.accounts?.id) { reject(new Error("gsi")); return; }
      g.accounts.id.initialize({
        client_id: clientId,
        callback: onCredential,
        auto_select: true,               // 전에 허락한 계정 하나면 묻지 않고 로그인
        cancel_on_tap_outside: true,
        itp_support: true,
        use_fedcm_for_prompt: true,
        context: "signin"
      });
      resolve(g);
    };
    s.onerror = reject;
    document.head.append(s);
  });
  return gsiLoading;
}

async function onCredential(resp) {
  try {
    const r = await api("login", { method: "POST", body: JSON.stringify({ credential: resp.credential }) });
    user = r.user; lastSavedAt = r.savedAt;
    renderAccount();
    hooks.sfx?.("coin");
    hooks.toast(`☁️ ${user.name} 님, 로그인했어요 — 진행도가 클라우드에 저장돼요`, 4);
    await reconcile(r.save);
    if (overlay && !overlay.hidden) refreshRanking();
  } catch {
    hooks.toast("☁️ 로그인에 실패했어요. 잠시 뒤 다시 해 주세요", 3);
  }
}

/** 클라우드 세이브와 이 기기 진행도를 맞춘다 */
async function reconcile(cloud) {
  const local = hooks.getProgress();
  // 비어 있거나 이 버전이 못 읽는 클라우드 세이브는 이 기기 것으로 덮는다
  if (!cloud || !isValidSave(cloud)) {
    // 처음 로그인한 기존 사용자: 이 기기 진행도를 그대로 클라우드로 옮긴다
    dirty = true;
    await flush();
    if (!isFresh(local) && lastSavedAt) toastLater(`📦 이 기기 진행도(${summary(local)})를 클라우드로 옮겼어요 — 이제 다른 기기에서도 이어서 할 수 있어요`, 5);
    return;
  }
  if (JSON.stringify(cloud) === JSON.stringify(local)) return;
  if (isFresh(local) && !isFresh(cloud)) { adopt(cloud); return; }
  if (ahead(cloud, local)) {
    const pick = await choose(cloud, local);
    if (pick === "cloud") { adopt(cloud); return; }
  }
  dirty = true;
  await flush();
}

function adopt(cloud) {
  if (sessionStorage.getItem("pk.adopted")) return;   // 같은 세션에서 두 번 다시 불러오지 않는다 (무한 새로고침 방지)
  sessionStorage.setItem("pk.adopted", "1");
  sessionStorage.setItem("pk.cloudMsg", `☁️ 클라우드 진행도를 불러왔어요 (${summary(cloud)})`);
  hooks.adoptSave(cloud);
}

/** 두 진행도 중 하나를 고르는 작은 창 */
function choose(cloud, local) {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "overlay";
    box.id = "cloud-choose";
    box.innerHTML = `<div class="panel cloud-choose" role="dialog" aria-modal="true" aria-label="이어갈 진행도 고르기">
      <h2>☁️ 다른 기기의 진행도가 있어요</h2>
      <p>어느 쪽으로 이어갈까요? 고르지 않은 쪽은 덮어써져요.</p>
      <button type="button" data-pick="cloud"><b>☁️ 클라우드</b><span>${summary(cloud)}</span></button>
      <button type="button" data-pick="local"><b>📱 이 기기</b><span>${summary(local)}</span></button>
    </div>`;
    document.body.append(box);
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-pick]");
      if (!b) return;
      box.remove();
      resolve(b.dataset.pick);
    });
  });
}

/** 진행도가 바뀌었다 (main.js persist) */
export function markDirty() {
  if (!enabled || !user) return;
  dirty = true;
  if (!timer) timer = setTimeout(() => { timer = 0; flush(); }, UPLOAD_DELAY);
}

async function flush(leaving = false) {
  if (!enabled || !user || !dirty) return;
  clearTimeout(timer); timer = 0;
  dirty = false;
  const body = JSON.stringify({ save: hooks.getProgress() });
  try {
    const r = await api("save", { method: "PUT", body, keepalive: leaving && body.length < 60000 });
    lastSavedAt = r.savedAt;
    renderAccount();
  } catch (e) {
    if (e.status === 401) { user = null; renderAccount(); return; }   // 세션 만료 → 다음에 다시 로그인
    dirty = true;
  }
}

async function logout() {
  await flush();
  try { await api("logout", { method: "POST" }); } catch { /* 무시 */ }
  window.google?.accounts?.id?.disableAutoSelect?.();
  user = null;
  renderAccount();
  hooks.toast("☁️ 로그아웃했어요 — 이 기기에는 계속 저장돼요", 3);
  refreshRanking();
}

// ---------- 🌳 비밀의 나무: 랭킹 ----------
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let onRankClose = () => {};

function buildRanking() {
  overlay = document.createElement("div");
  overlay.id = "ranking";
  overlay.className = "overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "비밀의 나무 — 기사 랭킹");
  overlay.innerHTML = `<div class="panel rk">
    <div class="rk-head"><span class="rk-tree">🌳</span><div><b>비밀의 나무</b><span>나무껍질에 새겨진 기사들의 이름</span></div>
      <button type="button" class="rk-close" aria-label="닫기">×</button></div>
    <div class="rk-body"></div>
    <div class="rk-foot"></div>
  </div>`;
  document.body.append(overlay);
  overlay.querySelector(".rk-close").addEventListener("click", closeRanking);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeRanking(); });
  window.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") { e.stopPropagation(); closeRanking(); } }, { capture: true });
}

export function openRanking(close = () => {}) {
  if (!overlay) buildRanking();
  onRankClose = close;
  overlay.hidden = false;
  refreshRanking();
}
export function closeRanking() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  onRankClose();
}
export const isRankingOpen = () => Boolean(overlay && !overlay.hidden);

async function refreshRanking() {
  if (!overlay) return;
  const body = overlay.querySelector(".rk-body"), foot = overlay.querySelector(".rk-foot");
  body.innerHTML = `<p class="rk-msg">나무껍질을 읽는 중…</p>`;
  foot.innerHTML = "";
  let data;
  try { data = await api("ranking"); } catch {
    body.innerHTML = `<p class="rk-msg">지금은 나무가 조용해요. (랭킹 서버에 닿지 않음)</p>`;
    return;
  }
  const row = (r, i, mine) => {
    const lv = levelFromXp(r.xp).level;
    const medal = ["🥇", "🥈", "🥉"][i] ?? `${i + 1}`;
    return `<li class="${mine ? "me" : ""}"><span class="rk-no">${medal}</span><b class="rk-name">${esc(r.name)}</b>
      <span class="rk-lv">Lv ${lv}</span><span class="rk-sub">⚔️ ${r.maxFloor}층 · 🎖️ ${r.badges}</span></li>`;
  };
  const myIdx = data.me ? data.me.rank - 1 : -1;
  body.innerHTML = data.top.length
    ? `<ol class="rk-list">${data.top.map((r, i) => row(r, i, i === myIdx && r.name === data.me?.name)).join("")}</ol>`
    : `<p class="rk-msg">아직 새겨진 이름이 없어요. 첫 번째 기사가 되어 보세요!</p>`;
  if (data.me && myIdx >= data.top.length) body.insertAdjacentHTML("beforeend", `<ol class="rk-list rk-mine" start="${data.me.rank}">${row(data.me, myIdx, true)}</ol>`);
  const total = `<span class="rk-total">기사 ${data.total}명</span>`;
  if (user) {
    foot.innerHTML = `${total}<span>☁️ ${esc(user.name)} 님 — 클라우드 저장 중</span><button type="button" class="rk-logout">로그아웃</button>`;
    foot.querySelector(".rk-logout").addEventListener("click", logout);
  } else if (enabled) {
    foot.innerHTML = `${total}<span>구글로 로그인하면 진행도가 클라우드에 저장되고 여기에 이름이 새겨져요</span><div class="rk-gbtn"></div>`;
    loadGsi().then((g) => g.accounts.id.renderButton(foot.querySelector(".rk-gbtn"), { theme: "filled_black", size: "medium", shape: "pill", text: "signin_with", locale: "ko" })).catch(() => {});
  } else {
    foot.innerHTML = total;
  }
}

// ---------- 로그인 상태 표시 (Stage 13.1): 화면 오른쪽 위 계정 버튼 + 시작 화면 ----------
const listeners = [];
/** 로그인 상태가 바뀔 때 (설정 버튼 아이콘 갱신 — settings.js) */
export const onCloudChange = (f) => { listeners.push(f); };
const ago = (t) => {
  if (!t) return "아직 저장 전";
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "방금 저장됨" : m < 60 ? `${m}분 전 저장` : `${Math.round(m / 60)}시간 전 저장`;
};
function googleButton(el, opts = {}) {
  if (!el) return;
  loadGsi().then((g) => g.accounts.id.renderButton(el, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "ko", ...opts })).catch(() => {});
}
let accEl = null;
function renderAccount() {
  // 시작 화면
  const sp = document.getElementById("splash-account");
  if (sp && enabled) {
    if (user) sp.innerHTML = `<span class="pk-acc-on">☁️ <b>${esc(user.name)}</b> 님으로 로그인됨 · 클라우드 저장 중</span>`;
    else if (!sp.querySelector(".pk-gbtn")) {
      sp.innerHTML = `<div class="pk-gbtn"></div><span class="pk-acc-hint">로그인하면 이 기기 진행도를 클라우드로 옮겨, 다른 기기에서도 이어 할 수 있어요</span>`;
      googleButton(sp.querySelector(".pk-gbtn"));
    }
  }
  if (accEl?.isConnected) fillAccount(accEl);
  for (const f of listeners) f(accountInfo());
}
/** 설정 창의 계정 칸을 채운다 */
export function fillAccount(el) {
  accEl = el;
  if (!enabled) {
    el.innerHTML = `<div class="acc-head"><span class="acc-ini big off">👤</span><div><b>게스트</b><span>이 브라우저에만 저장 중</span></div></div>`;
    return;
  }
  if (user) {
    el.innerHTML = `<div class="acc-head"><span class="acc-ini big">${esc([...user.name][0])}</span><div><b>${esc(user.name)}</b><span>구글 계정으로 로그인됨 · ☁️ ${dirty ? "저장 대기 중…" : ago(lastSavedAt)}</span></div></div>
      <div class="acc-row"><button type="button" class="acc-save">☁️ 지금 저장</button><button type="button" class="acc-out">로그아웃</button></div>`;
    el.querySelector(".acc-save").addEventListener("click", async () => { dirty = true; await flush(); hooks.toast("☁️ 클라우드에 저장했어요", 2); });
    el.querySelector(".acc-out").addEventListener("click", logout);
  } else {
    el.innerHTML = `<div class="acc-head"><span class="acc-ini big off">👤</span><div><b>게스트</b><span>이 브라우저에만 저장 중</span></div></div>
      <p class="acc-sync">구글로 로그인하면 지금 진행도를 클라우드로 옮기고, 다른 기기에서도 이어서 할 수 있어요. 비밀의 나무 랭킹에도 이름이 새겨져요.</p>
      <div class="acc-g"></div>`;
    googleButton(el.querySelector(".acc-g"), { size: "medium" });
  }
}
export const accountInfo = () => ({ enabled, name: user?.name ?? null });

export const cloudState = () => ({ enabled, user, dirty, lastSavedAt });
