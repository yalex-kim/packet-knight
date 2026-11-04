// 📡 스펙 한 장 · 🎯 맞혀 보기 · 🎓 알바 2배 받기 (Stage 13.12) — 순수 로직 (THREE·DOM 없음)
// 카드 = 교과서 각 장의 핵심 정리(chapters.data.js keypoints, 75장). 문제 = 그 장 문항 풀(drawQuiz, 보기 섞음).

import { CHAPTERS } from "./chapters.data.js";
import { drawQuiz } from "./quiz.js";
import { QUESTS } from "./quests.js";

/** @type {ReadonlyArray<{ id: string, chapter: string, title: string, text: string }>} */
export const SPEC_CARDS = Object.freeze(CHAPTERS.flatMap((c) => c.keypoints.map((text, i) => ({ id: `${c.id}#${i}`, chapter: c.id, title: c.title, text }))));

/** 아직 안 본 카드에서 하나 (다 봤으면 처음부터 다시) @param {Set<string>} seen */
export function pickCard(seen, rng = Math.random) {
  const fresh = SPEC_CARDS.filter((c) => !seen.has(c.id));
  const pool = fresh.length ? fresh : SPEC_CARDS;
  return pool[Math.floor(rng() * pool.length)];
}

/** 지금까지 진행한 퀘스트의 장 — 완료한 퀘스트 + 진행 중인 퀘스트 (하나도 없으면 intro) */
export function questChapters(qs) {
  const ids = QUESTS.filter((q) => qs?.done?.[q.id] || q.id === qs?.active).map((q) => q.chapter);
  return ids.length ? [...new Set(ids)] : ["intro"];
}

/** 장 목록에서 하나를 골라 문제 1개 (보기 섞음) */
export function drawOne(chapterIds, rng = Math.random) {
  const chapter = chapterIds[Math.floor(rng() * chapterIds.length)];
  return { chapter, ...drawQuiz(chapter, rng, 1)[0] };
}
