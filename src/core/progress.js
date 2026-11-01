// 진행도 — 퀴즈 보상 스탯, 스킬 슬롯, 학습 지표. 저장소는 주입한다(브라우저 localStorage / Node Map).
// 순수 로직 (THREE·DOM 의존 없음)

import { PLAYER_BASE, QUIZ_BONUS, QUIZ, LIBRARY_COURSES, STAT_POINTS_PER_LEVEL } from "./balance.js";
import { levelFromXp } from "./combat.js";
import { fullCharges, useCharge, chargesAt } from "./jobCharges.js";

export const SAVE_KEY = "packetKnight.save";
export const SAVE_VERSION = 4; // v2: CR2032·알바 기록 (Stage 5) · v3: XP·스탯 포인트·도감 (Stage 6) · v4: 측정기 배터리 (Stage 6.5)

/**
 * @typedef {{
 *   v: number,
 *   bonus: Record<string, number>,
 *   skillSlots: number,
 *   cleared: Record<string, string>,
 *   cr2032: number,
 *   job: { runs: number, bestScore: number|null, totalEarned: number, charges: import("./jobCharges.js").Charges },
 *   xp: number, statPoints: number,
 *   bestiary: Record<string, { kills: number, firstScan: string }>,
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
    cr2032: 0,
    job: { runs: 0, bestScore: null, totalEarned: 0, charges: fullCharges(0) },
    xp: 0,
    statPoints: 0,
    bestiary: {},
    metrics: { quizAttempts: {}, quizPerfect: {}, chapterOpens: {} }
  };
}

/** 구버전 세이브를 현재 버전으로 올린다 (진행도를 잃지 않는 것이 원칙) */
function migrate(raw) {
  if (raw && raw.v === 1) raw = { ...raw, v: 2, cr2032: 0, job: { runs: 0, bestScore: null, totalEarned: 0 } };
  if (raw && raw.v === 2) raw = { ...raw, v: 3, xp: 0, statPoints: 0, bestiary: {} };
  if (raw && raw.v === 3) raw = { ...raw, v: 4, job: { ...raw.job, charges: fullCharges(0) } };
  return raw;
}

const isCountMap = (o) => o && typeof o === "object" && Object.values(o).every((n) => Number.isFinite(n) && n >= 0);

/** 저장 데이터 검증 — 깨졌거나 버전이 다르면 null */
function validate(raw) {
  raw = migrate(raw);
  if (!raw || typeof raw !== "object" || raw.v !== SAVE_VERSION) return null;
  const base = createProgress();
  if (!isCountMap(raw.bonus) || !Number.isInteger(raw.skillSlots) || typeof raw.cleared !== "object" || !raw.metrics) return null;
  const m = raw.metrics;
  if (![m.quizAttempts, m.quizPerfect, m.chapterOpens].every(isCountMap)) return null;
  const j = raw.job;
  if (!Number.isInteger(raw.cr2032) || raw.cr2032 < 0 || !j || !Number.isInteger(j.runs) || !Number.isInteger(j.totalEarned)) return null;
  if (!Number.isInteger(raw.xp) || raw.xp < 0 || !Number.isInteger(raw.statPoints) || raw.statPoints < 0) return null;
  if (!raw.bestiary || typeof raw.bestiary !== "object") return null;
  return {
    ...base,
    bonus: { ...base.bonus, ...raw.bonus },
    skillSlots: Math.min(QUIZ.MAX_SKILL_SLOTS, Math.max(QUIZ.BASE_SKILL_SLOTS, raw.skillSlots)),
    cleared: { ...raw.cleared },
    cr2032: raw.cr2032,
    job: {
      runs: j.runs, bestScore: Number.isFinite(j.bestScore) ? j.bestScore : null, totalEarned: j.totalEarned,
      charges: Number.isInteger(j.charges?.stored) && Number.isFinite(j.charges?.since) ? { stored: j.charges.stored, since: j.charges.since } : fullCharges(0)
    },
    xp: raw.xp,
    statPoints: raw.statPoints,
    bestiary: Object.fromEntries(Object.entries(raw.bestiary).map(([k, v]) => [k, { kills: Number.isInteger(v?.kills) ? v.kills : 0, firstScan: String(v?.firstScan ?? "") }])),
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

/**
 * 알바 결과 반영 — 보수 CR2032 지급, 기록 갱신
 * @param {{ score: number, rounds: number, reward: number }} result
 * @returns {{ earned: number, balance: number, newBest: boolean }}
 */
export function applyJobResult(progress, result) {
  progress.job.runs += 1;
  const newBest = result.rounds > 0 && (progress.job.bestScore === null || result.score > progress.job.bestScore);
  if (newBest) progress.job.bestScore = result.score;
  progress.cr2032 += result.reward;
  progress.job.totalEarned += result.reward;
  return { earned: result.reward, balance: progress.cr2032, newBest };
}

/** 몬스터 첫 스캔(첫 명중) — 도감 등록 */
export function recordScan(progress, monsterType, now = new Date()) {
  if (progress.bestiary[monsterType]) return false;
  progress.bestiary[monsterType] = { kills: 0, firstScan: now.toISOString() };
  return true;
}

/**
 * 처치 반영 — 도감 처치 수, XP, 레벨업 시 스탯 포인트(PRD §8.4: 레벨당 3)
 * @returns {{ level: number, leveledUp: number }}
 */
export function applyKill(progress, monsterType, xp) {
  recordScan(progress, monsterType);
  progress.bestiary[monsterType].kills += 1;
  const before = levelFromXp(progress.xp).level;
  progress.xp += xp;
  const { level } = levelFromXp(progress.xp);
  const leveledUp = level - before;
  progress.statPoints += leveledUp * STAT_POINTS_PER_LEVEL;
  return { level, leveledUp };
}

/** 아이템 줍기 */
export function applyPickup(progress, item, count) {
  if (item === "cr2032") progress.cr2032 += count;
}

/** 측정기 배터리 현황 */
export const jobChargesAt = (progress, now) => chargesAt(progress.job.charges, now);

/** 알바 시작 시 배터리 1칸 사용 — 없으면 false (중도 이탈해도 돌려주지 않는다: 이탈 남용 방지) */
export function startJobCharge(progress, now) {
  const next = useCharge(progress.job.charges, now);
  if (!next) return false;
  progress.job.charges = next;
  return true;
}
