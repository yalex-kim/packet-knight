// 진행도 — 퀴즈 보상 스탯, 스킬 슬롯, 학습 지표. 저장소는 주입한다(브라우저 localStorage / Node Map).
// 순수 로직 (THREE·DOM 의존 없음)

import { PLAYER_BASE, QUIZ_BONUS, QUIZ, LIBRARY_COURSES } from "./balance.js";

export const SAVE_KEY = "packetKnight.save";
export const SAVE_VERSION = 1;

/**
 * @typedef {{
 *   v: number,
 *   bonus: Record<string, number>,
 *   skillSlots: number,
 *   cleared: Record<string, string>,
 *   metrics: { quizAttempts: Record<string, number>, quizPerfect: Record<string, number>, chapterOpens: Record<string, number> }
 * }} Progress
 * @typedef {{ getItem(k: string): string|null, setItem(k: string, v: string): void }} StorageLike
 */

/** @returns {Progress} */
export function createProgress() {
  return {
    v: SAVE_VERSION,
    bonus: { hp: 0, tx: 0, rx: 0, hop: 0, sec: 0, pwr: 0 },
    skillSlots: QUIZ.BASE_SKILL_SLOTS,
    cleared: {},
    metrics: { quizAttempts: {}, quizPerfect: {}, chapterOpens: {} }
  };
}

const isCountMap = (o) => o && typeof o === "object" && Object.values(o).every((n) => Number.isFinite(n) && n >= 0);

/** 저장 데이터 검증 — 깨졌거나 버전이 다르면 null */
function validate(raw) {
  if (!raw || raw.v !== SAVE_VERSION || typeof raw !== "object") return null;
  const base = createProgress();
  if (!isCountMap(raw.bonus) || !Number.isInteger(raw.skillSlots) || typeof raw.cleared !== "object" || !raw.metrics) return null;
  const m = raw.metrics;
  if (![m.quizAttempts, m.quizPerfect, m.chapterOpens].every(isCountMap)) return null;
  return {
    ...base,
    bonus: { ...base.bonus, ...raw.bonus },
    skillSlots: Math.min(QUIZ.MAX_SKILL_SLOTS, Math.max(QUIZ.BASE_SKILL_SLOTS, raw.skillSlots)),
    cleared: { ...raw.cleared },
    metrics: { quizAttempts: { ...m.quizAttempts }, quizPerfect: { ...m.quizPerfect }, chapterOpens: { ...m.chapterOpens } }
  };
}

/**
 * 저장소에서 불러오기. 저장소가 없거나(사생활 보호 모드) 데이터가 깨졌으면 새 진행도로 시작한다.
 * @param {StorageLike|null} storage
 * @returns {{ progress: Progress, status: "loaded"|"new"|"corrupt"|"unavailable" }}
 */
export function loadProgress(storage) {
  let text;
  try {
    text = storage?.getItem(SAVE_KEY) ?? null;
  } catch {
    return { progress: createProgress(), status: "unavailable" };
  }
  if (storage == null) return { progress: createProgress(), status: "unavailable" };
  if (text == null) return { progress: createProgress(), status: "new" };
  try {
    const p = validate(JSON.parse(text));
    return p ? { progress: p, status: "loaded" } : { progress: createProgress(), status: "corrupt" };
  } catch {
    return { progress: createProgress(), status: "corrupt" };
  }
}

/** @returns {boolean} 저장 성공 여부 */
export function saveProgress(storage, progress) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(progress));
    return storage != null;
  } catch {
    return false;
  }
}

/** 기본 스탯 + 영구 보너스 */
export function effectiveStats(progress) {
  const out = {};
  for (const k of Object.keys(PLAYER_BASE)) out[k] = +(PLAYER_BASE[k] + (progress.bonus[k] ?? 0)).toFixed(2);
  return out;
}

export const courseFor = (chapterId) => LIBRARY_COURSES.find((c) => c.chapter === chapterId);

const bump = (map, key) => { map[key] = (map[key] ?? 0) + 1; };

/** 학습 지표: 챕터 원문 열람 */
export function recordChapterOpen(progress, chapterId) {
  bump(progress.metrics.chapterOpens, chapterId);
}

/**
 * 퀴즈 결과 반영. 첫 만점 통과에만 보상(스탯 + 스킬 슬롯).
 * @returns {{ firstClear: boolean, reward: null | { stat: string, amount: number, slotUnlocked: boolean } }}
 */
export function applyQuizResult(progress, chapterId, perfect, now = new Date()) {
  bump(progress.metrics.quizAttempts, chapterId);
  if (!perfect) return { firstClear: false, reward: null };
  bump(progress.metrics.quizPerfect, chapterId);
  if (progress.cleared[chapterId]) return { firstClear: false, reward: null };

  progress.cleared[chapterId] = now.toISOString();
  const course = courseFor(chapterId);
  if (!course) return { firstClear: true, reward: null };
  const amount = QUIZ_BONUS[course.reward] ?? 0;
  progress.bonus[course.reward] = (progress.bonus[course.reward] ?? 0) + amount;
  const slotUnlocked = progress.skillSlots < QUIZ.MAX_SKILL_SLOTS;
  if (slotUnlocked) progress.skillSlots += 1;
  return { firstClear: true, reward: { stat: course.reward, amount, slotUnlocked } };
}
