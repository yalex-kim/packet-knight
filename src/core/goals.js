// 📅 오늘의 임무 · 🏅 업적 (Stage 13.20) — 순수 로직 (THREE·DOM 없음)
// 오늘의 임무: 날짜(현지)마다 후보 중 3개를 고정해서 고르고, 다 하면 🎁 상자(CR2032). 업적: 오래 쌓는 목표, 처음 달성하면 CR2032.
// 세이브: progress.goals = { daily: { date, ids, prog, claimed }, counters: {…}, ach: { id: 달성일 } } — 없으면 기본값 (버전 그대로)

import { MONSTERS } from "./balance.js";
import { QUESTS } from "./quests.js";
import { OUTFITS } from "./shop.js";

/** 오늘의 임무 후보 — ev: 게임 이벤트 종류, need: 횟수, match: (선택) 이벤트 조건 */
export const DAILY_POOL = Object.freeze([
  { id: "job2", text: "📡 비콘 알바 2번 하기", ev: "job", need: 2 },
  { id: "jobA", text: "📡 비콘 알바 A등급 이상 1번", ev: "job", need: 1, match: (e) => e.grade === "S" || e.grade === "A" },
  { id: "floor1", text: "⚔️ 던전 층 1개 클리어", ev: "floorClear", need: 1 },
  { id: "kill10", text: "👾 몬스터 10마리 처치", ev: "kill", need: 10 },
  { id: "tip2", text: "💡 주민 퀴즈 2개 맞히기", ev: "tipRight", need: 2 },
  { id: "double1", text: "🎓 알바 2배 받기 성공 1번", ev: "doubleWin", need: 1 },
  { id: "lib1", text: "📚 도서관 강좌 퀴즈 1번 풀기", ev: "libQuiz", need: 1 }
]);
export const DAILY_COUNT = 3;
export const DAILY_REWARD = 10;   // 🎁 상자: CR2032

/** 🏅 업적 — check(p, counters) */
export const ACHIEVEMENTS = Object.freeze([
  { id: "firstBoss", icon: "📡", title: "오븐을 식힌 기사", desc: "보스 전자레인지 오븐을 처음 쓰러뜨렸다", reward: 20, check: (p, c) => (c.bossKills ?? 0) >= 1 },
  { id: "floor10", icon: "🏰", title: "열 번째 층", desc: "호핑 던전 10층까지 깼다", reward: 20, check: (p) => (p.dungeon?.maxFloor ?? 0) >= 10 },
  { id: "jobS10", icon: "🎯", title: "비콘 사냥꾼", desc: "비콘 알바 S등급 10번 — 🎯 비콘 사냥꾼 망토", reward: 15, outfit: "hunter", check: (p, c) => (c.jobS ?? 0) >= 10 },
  { id: "tips20", icon: "💡", title: "마을의 귀 밝은 기사", desc: "주민 퀴즈 20개 맞히기", reward: 15, check: (p, c) => (c.tipRight ?? 0) >= 20 },
  { id: "bestiary", icon: "📖", title: "도감 완성", desc: "모든 몬스터를 도감에 올렸다", reward: 15, check: (p) => Object.keys(MONSTERS).every((k) => p.bestiary?.[k]) },
  { id: "kill100", icon: "⚔️", title: "백 번의 패킷", desc: "몬스터 100마리 처치", reward: 10, check: (p) => Object.values(p.bestiary ?? {}).reduce((n, b) => n + (b.kills ?? 0), 0) >= 100 },
  { id: "allBadges", icon: "🏅", title: "완독 기사", desc: "퀘스트 9개를 모두 끝냈다", reward: 25, check: (p) => QUESTS.every((q) => p.quests?.done?.[q.id]) },
  { id: "wardrobe", icon: "👗", title: "옷장 가득", desc: "상점의 옷을 모두 모았다", reward: 10, check: (p) => OUTFITS.filter((o) => !o.bossOnly && !o.achOnly).every((o) => p.shop?.outfits?.includes(o.id)) }
]);

export const emptyGoals = () => ({ daily: null, counters: {}, ach: {} });
/** 세이브 검증 — 깨졌으면 기본값 */
export function validGoals(raw) {
  if (!raw || typeof raw !== "object") return emptyGoals();
  const counters = Object.fromEntries(Object.entries(raw.counters ?? {}).filter(([, v]) => Number.isInteger(v) && v >= 0));
  const ach = Object.fromEntries(Object.entries(raw.ach ?? {}).filter(([k, v]) => ACHIEVEMENTS.some((a) => a.id === k) && typeof v === "string"));
  const d = raw.daily;
  const daily = d && typeof d.date === "string" && Array.isArray(d.ids) && d.ids.every((id) => DAILY_POOL.some((m) => m.id === id))
    ? { date: d.date, ids: [...d.ids], prog: Object.fromEntries(Object.entries(d.prog ?? {}).filter(([, v]) => Number.isInteger(v))), claimed: Boolean(d.claimed) }
    : null;
  return { daily, counters, ach };
}

/** 현지 날짜 YYYY-MM-DD */
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 날짜로 정해지는 임무 3개 (같은 날 누구에게나 같다) */
export function pickDaily(key) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const ids = DAILY_POOL.map((m) => m.id);
  for (let i = ids.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; const j = h % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, DAILY_COUNT);
}

/** 오늘 임무 준비 (날짜가 바뀌었으면 새로) @returns 오늘의 daily */
export function ensureDaily(goals, key = todayKey()) {
  if (!goals.daily || goals.daily.date !== key) goals.daily = { date: key, ids: pickDaily(key), prog: {}, claimed: false };
  return goals.daily;
}
export const missionById = (id) => DAILY_POOL.find((m) => m.id === id);
export const missionDone = (daily, id) => (daily.prog[id] ?? 0) >= missionById(id).need;
export const dailyDone = (daily) => daily.ids.every((id) => missionDone(daily, id));

/**
 * 게임 이벤트 → 임무 진행·카운터 @param {{ type: string, grade?: string, amount?: number }} ev
 * @returns {{ completed: string[], allDone: boolean }} 이번에 끝난 임무
 */
export function goalEvent(goals, ev, key = todayKey()) {
  const c = goals.counters;
  if (ev.type === "job" && ev.grade === "S") c.jobS = (c.jobS ?? 0) + 1;
  if (ev.type === "tipRight") c.tipRight = (c.tipRight ?? 0) + 1;
  if (ev.type === "doubleWin") c.doubleWin = (c.doubleWin ?? 0) + 1;
  if (ev.type === "bossKill") c.bossKills = (c.bossKills ?? 0) + 1;
  const daily = ensureDaily(goals, key);
  const was = dailyDone(daily);
  const completed = [];
  for (const id of daily.ids) {
    const m = missionById(id);
    if (missionDone(daily, id) || m.ev !== ev.type || (m.match && !m.match(ev))) continue;
    daily.prog[id] = Math.min(m.need, (daily.prog[id] ?? 0) + (ev.amount ?? 1));
    if (missionDone(daily, id)) completed.push(id);
  }
  return { completed, allDone: !was && dailyDone(daily) };
}

/** 🎁 상자 열기 — 다 했고 아직 안 열었으면 보상 개수, 아니면 0 */
export function claimDaily(goals, key = todayKey()) {
  const daily = ensureDaily(goals, key);
  if (!dailyDone(daily) || daily.claimed) return 0;
  daily.claimed = true;
  return DAILY_REWARD;
}

/** 새로 달성한 업적 (달성일을 기록한다) */
export function checkAchievements(p, goals, key = todayKey()) {
  const fresh = ACHIEVEMENTS.filter((a) => !goals.ach[a.id] && a.check(p, goals.counters));
  for (const a of fresh) goals.ach[a.id] = key;
  return fresh;
}
