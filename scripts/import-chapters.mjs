#!/usr/bin/env node
// connectivityBook(BluetoothBook) 챕터 → 게임 데이터 임포터
//
//   git clone --depth 1 https://github.com/yalex-kim/connectivityBook ../connectivityBook
//   node scripts/import-chapters.mjs ../connectivityBook
//
// 각 챕터 HTML에서 제목·도입문(lead)·핵심 정리(#summary)·확인 퀴즈(#quiz, data-correct 정답·해설)를 뽑아
// src/core/chapters.data.js 를 생성한다. 생성 파일은 커밋한다(게임 실행에 교과서 클론이 필요 없도록).
// 교과서 문항을 그대로 쓰는 이유: 스펙 정확성(PRD §2.3)의 1차 출처가 교과서이기 때문.
// 라이선스: 교과서 콘텐츠는 CC BY 4.0 / MIT 듀얼 — 생성 파일에 출처를 기록한다.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOOK = path.resolve(process.argv[2] ?? process.env.CONNECTIVITYBOOK_DIR ?? "../connectivityBook");
const CHAPTER_DIR = path.join(BOOK, "bluetooth/chapters");
const OUT = path.join(ROOT, "src/core/chapters.data.js");

// PRD §6 순서 (glossary는 종합 퀴즈 형식이 달라 제외)
const CHAPTER_IDS = [
  "intro", "radio", "phy", "advertising", "hopping", "connection", "gatt",
  "security", "power", "coexistence", "mesh", "audio", "location", "design"
];

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", times: "×", minus: "−", micro: "µ", deg: "°" };
function toText(html) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function sectionById(html, id) {
  const m = html.match(new RegExp(`<section[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</section>`));
  if (!m) throw new Error(`#${id} 섹션 없음`);
  return m[1];
}

function parseChapter(id) {
  const file = `${id}.html`;
  const html = readFileSync(path.join(CHAPTER_DIR, file), "utf8");

  const title = toText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? id);
  const lead = toText(html.match(/<p class="lead">([\s\S]*?)<\/p>/)?.[1] ?? "");
  const keypoints = [...sectionById(html, "summary").matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => toText(m[1]));

  const quizHtml = sectionById(html, "quiz");
  const questions = [];
  // <div class="quiz-q"><p>질문</p><div class="opts">버튼들</div><div class="quiz-exp">해설</div></div>
  const re = /<div class="quiz-q">\s*<p>([\s\S]*?)<\/p>\s*<div class="opts">([\s\S]*?)<\/div>\s*<div class="quiz-exp">([\s\S]*?)<\/div>/g;
  for (const m of quizHtml.matchAll(re)) {
    const opts = [...m[2].matchAll(/<button class="opt"(\s+data-correct)?\s*>([\s\S]*?)<\/button>/g)];
    const answers = opts.map((o, i) => (o[1] ? i : -1)).filter((i) => i >= 0);
    if (answers.length !== 1) throw new Error(`${file}: 정답이 ${answers.length}개인 문항 — "${toText(m[1])}"`);
    questions.push({ q: toText(m[1]), options: opts.map((o) => toText(o[2])), answer: answers[0], explain: toText(m[3]) });
  }
  const declared = (quizHtml.match(/class="quiz-q"/g) ?? []).length;
  if (questions.length !== declared) throw new Error(`${file}: 퀴즈 ${declared}개 중 ${questions.length}개만 파싱됨`);
  if (questions.length < 3) throw new Error(`${file}: 문항이 3개 미만`);

  return { id, file, title, lead, keypoints, questions };
}

const chapters = CHAPTER_IDS.map(parseChapter);
let commit = "unknown";
try { commit = execFileSync("git", ["-C", BOOK, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* 클론이 아니면 생략 */ }

const out = `// ⚠️ 자동 생성 파일 — 직접 고치지 말고 scripts/import-chapters.mjs 를 다시 실행하세요.
// 출처: connectivityBook / BluetoothBook (https://github.com/yalex-kim/connectivityBook) @ ${commit}
// 라이선스: CC BY 4.0 / MIT 듀얼 (교과서 콘텐츠). 기준 사양: Bluetooth Core 6.3
// 챕터 ${chapters.length}개 · 문항 ${chapters.reduce((n, c) => n + c.questions.length, 0)}개

export const CHAPTER_SOURCE = ${JSON.stringify({ repo: "https://github.com/yalex-kim/connectivityBook", commit, license: "CC BY 4.0 / MIT" })};

/**
 * @typedef {{ q: string, options: string[], answer: number, explain: string }} QuizQuestion
 * @typedef {{ id: string, file: string, title: string, lead: string, keypoints: string[], questions: QuizQuestion[] }} Chapter
 * @type {Chapter[]}
 */
export const CHAPTERS = ${JSON.stringify(chapters, null, 2)};
`;
writeFileSync(OUT, out);
console.log(`✅ ${path.relative(ROOT, OUT)} — 챕터 ${chapters.length}개, 문항 ${chapters.reduce((n, c) => n + c.questions.length, 0)}개 (connectivityBook@${commit})`);
for (const c of chapters) console.log(`   ${c.id.padEnd(12)} ${String(c.questions.length).padStart(2)}문항  ${c.title}`);
