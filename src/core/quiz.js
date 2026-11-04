// 퀴즈 출제·채점 — 순수 로직 (THREE·DOM 의존 없음)

import { CHAPTERS } from "./chapters.data.js";
import { QUIZ } from "./balance.js";
import { EXTRA_QUESTIONS } from "./extraQuestions.js";

/** 장의 문항 풀 = 교과서 문항(자동 생성) + 추가 문항 (Stage 13.13, 장마다 10개 이상) */
export const questionPool = (chapterId) => [...(chapterById(chapterId)?.questions ?? []), ...(EXTRA_QUESTIONS[chapterId] ?? [])];

/** @typedef {import("./chapters.data.js").QuizQuestion} QuizQuestion */

export const chapterById = (id) => CHAPTERS.find((c) => c.id === id);

/** 시드 고정 가능한 난수 (mulberry32) — 테스트·시뮬레이터 재현성용 */
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 챕터 문항 풀에서 n개를 뽑고 보기 순서도 섞는다 (재도전 시 암기가 아니라 이해로 풀도록)
 * @returns {QuizQuestion[]} answer는 섞인 보기 기준 인덱스
 */
export function drawQuiz(chapterId, rng = createRng(), n = QUIZ.QUESTIONS_PER_QUIZ) {
  const chapter = chapterById(chapterId);
  if (!chapter) throw new Error(`알 수 없는 챕터: ${chapterId}`);
  return shuffle(questionPool(chapterId), rng).slice(0, n).map((q) => {
    const order = shuffle(q.options.map((_, i) => i), rng);
    return { q: q.q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer), explain: q.explain };
  });
}

/** @param {QuizQuestion[]} questions @param {number[]} picks */
export function gradeQuiz(questions, picks) {
  const wrong = questions.map((q, i) => (picks[i] === q.answer ? -1 : i)).filter((i) => i >= 0);
  return { score: questions.length - wrong.length, total: questions.length, perfect: wrong.length === 0, wrong };
}
