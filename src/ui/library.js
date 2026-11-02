// 도서관 강의실 UI — 강좌 목록 → 레슨(핵심 정리) → 3문제 퀴즈 → 결과 (PRD §4.1)
// 콘텐츠는 connectivityBook 원문에서 가져온 데이터(core/chapters.data.js)이므로 textContent로만 넣는다.

import { sfx } from "./audio.js";
import { LIBRARY_COURSES, QUIZ_BONUS, STAT_META, QUIZ, SKILL_REWARDS } from "../core/balance.js";
import { CHAPTERS, CHAPTER_SOURCE } from "../core/chapters.data.js";
import { chapterById, drawQuiz, gradeQuiz, createRng } from "../core/quiz.js";
import { chapterUrl } from "../core/book.js";

const CHAPTER_URL = (file, section) => chapterUrl(file, section);

const overlay = document.getElementById("library");
const panel = document.getElementById("library-panel");

/**
 * @typedef {{
 *   getProgress: () => import("../core/progress.js").Progress,
 *   getStats: () => Record<string, number>,
 *   onQuizFinished: (chapterId: string, perfect: boolean) => ReturnType<typeof import("../core/progress.js").applyQuizResult>,
 *   onChapterOpen: (chapterId: string) => void,
 *   onOpenChange: (open: boolean) => void,
 *   seed?: number
 * }} LibraryHooks
 */
/** @type {LibraryHooks} */
let hooks;
let rng;
/** 진행 중 퀴즈 세션 */
let session = null;
let lastFocus = null;

// ---------- 작은 DOM 헬퍼 ----------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}
const button = (label, onClick, cls = "lib-btn") => el("button", { type: "button", class: cls, textContent: label, on: { click: onClick } });

function render(...nodes) {
  panel.replaceChildren(...nodes.flat(Infinity).filter((n) => n != null && n !== false));
  panel.scrollTop = 0;
  // 화면이 바뀌면 첫 번째 조작 요소로 포커스 이동 (키보드·스크린리더 사용자)
  const target = [".opt:not(:disabled)", ".course", ".lib-btn.primary:not([hidden])", ".lib-btn", ".close"]
    .map((sel) => panel.querySelector(sel)).find(Boolean);
  target?.focus({ preventScroll: true });
}

function header(title, sub) {
  return el("div", { class: "head" },
    el("div", {}, el("h2", { id: "library-title", textContent: title }), sub && el("div", { class: "muted", textContent: sub })),
    el("button", { type: "button", class: "close", textContent: "×", "aria-label": "강의실 나가기", on: { click: closeLibrary } })
  );
}

const rewardText = (stat) => SKILL_REWARDS[stat]
  ? `${SKILL_REWARDS[stat].icon} ${SKILL_REWARDS[stat].label}`
  : `${STAT_META[stat].icon} ${STAT_META[stat].label} +${QUIZ_BONUS[stat]}${STAT_META[stat].unit}`;

function sourceNote(chapter) {
  return el("div", { class: "source" },
    "출처: ",
    el("a", { href: CHAPTER_URL(chapter.file), target: "_blank", rel: "noopener", textContent: `BluetoothBook · ${chapter.title}` }),
    ` (connectivityBook@${CHAPTER_SOURCE.commit}, ${CHAPTER_SOURCE.license})`
  );
}

// ---------- 화면 1: 강좌 목록 ----------
function showHome() {
  session = null;
  const progress = hooks.getProgress();
  const courses = LIBRARY_COURSES.map(({ chapter: id, reward }) => {
    const c = chapterById(id);
    const done = Boolean(progress.cleared[id]);
    const tries = progress.metrics.quizAttempts[id] ?? 0;
    return el("button", { type: "button", class: `course${done ? " done" : ""}`, on: { click: () => showLesson(id) } },
      el("span", {}, el("div", { textContent: c.title }), el("div", { class: "meta", textContent: `${c.questions.length}문항 중 ${QUIZ.QUESTIONS_PER_QUIZ}문제 출제${tries ? ` · 도전 ${tries}회` : ""}` })),
      el("span", { class: "tag", textContent: done ? "✅ 이수" : `만점 시 ${rewardText(reward)}` })
    );
  });
  const lockedCount = CHAPTERS.length - LIBRARY_COURSES.length;

  render(
    header("📚 RF 이론 도서관", "강의실 · 교수 블루투스"),
    el("p", { class: "npc", textContent: "어서 오게, 패킷 기사! 레슨을 읽고 3문제 퀴즈를 모두 맞히면 기사의 능력이 영구히 오르고 스킬 슬롯이 하나 열린다네. 틀려도 괜찮아. 교과서를 다시 읽고 새 문제로 도전하게." }),
    courses,
    el("p", { class: "muted", textContent: `🔒 나머지 ${lockedCount}개 챕터는 각 지역 퀘스트가 열릴 때 강의실에 추가됩니다. · 스킬 슬롯 ${progress.skillSlots}/${QUIZ.MAX_SKILL_SLOTS}` })
  );
}

// ---------- 화면 2: 레슨 ----------
function showLesson(id) {
  const c = chapterById(id);
  const course = LIBRARY_COURSES.find((x) => x.chapter === id);
  render(
    header(c.title, `레슨 · 만점 보상 ${rewardText(course.reward)} · 스킬 슬롯 +1 (첫 이수 시)`),
    el("p", { textContent: c.lead }),
    el("h3", { textContent: "핵심 정리" }),
    el("ol", {}, c.keypoints.map((k) => el("li", { textContent: k }))),
    el("div", { class: "lib-actions" },
      button("← 목록", showHome),
      chapterLink(c, null, "📖 원문 전체 읽기 ↗"),
      button(`✏️ 퀴즈 시작 (${QUIZ.QUESTIONS_PER_QUIZ}문제)`, () => startQuiz(id), "lib-btn primary")
    ),
    sourceNote(c)
  );
}

// ---------- 화면 3: 퀴즈 ----------
function startQuiz(id) {
  session = { chapterId: id, questions: drawQuiz(id, rng), picks: [], index: 0 };
  showQuestion();
}

function showQuestion() {
  const { questions, index, chapterId } = session;
  const q = questions[index];
  const c = chapterById(chapterId);
  const isLast = index === questions.length - 1;

  const next = button(isLast ? "결과 보기 →" : "다음 문제 →", () => {
    if (isLast) finishQuiz();
    else { session.index += 1; showQuestion(); }
  }, "lib-btn primary");
  next.hidden = true;
  const explain = el("div", { class: "explain", role: "status" });
  explain.hidden = true;

  const opts = q.options.map((text, i) => el("button", {
    type: "button", class: "opt", textContent: `${i + 1}. ${text}`,
    on: { click: () => pick(i) }
  }));

  function pick(i) {
    if (session.picks[index] !== undefined) return;
    session.picks[index] = i;
    opts.forEach((b, j) => {
      b.disabled = true;
      if (j === q.answer) b.classList.add("right");
      else if (j === i) b.classList.add("wrong");
    });
    explain.textContent = `${i === q.answer ? "⭕ 정답!" : "❌ 아쉬워요."} ${q.explain}`;
    sfx(i === q.answer ? "correct" : "wrong");
    explain.hidden = false;
    next.hidden = false;
    next.focus({ preventScroll: true });
  }

  render(
    header(c.title, "확인 퀴즈"),
    el("div", { class: "quiz-progress", textContent: `문제 ${index + 1} / ${questions.length}` }),
    el("div", { class: "quiz-q", textContent: q.q }),
    el("div", { role: "group", "aria-label": "보기" }, opts),
    explain,
    el("div", { class: "lib-actions" }, next)
  );
}

// ---------- 화면 4: 결과 ----------
function finishQuiz() {
  const { chapterId, questions, picks } = session;
  const c = chapterById(chapterId);
  const result = gradeQuiz(questions, picks);
  const before = hooks.getStats();
  const outcome = hooks.onQuizFinished(chapterId, result.perfect);
  if (result.perfect) sfx("perfect");
  const after = hooks.getStats();
  const progress = hooks.getProgress();

  const body = [];
  if (result.perfect) {
    body.push(el("div", { class: "result-big", textContent: `🎉 만점! ${result.score} / ${result.total}` }));
    if (outcome.reward) {
      const { stat, slotUnlocked } = outcome.reward;
      const skill = SKILL_REWARDS[stat];
      if (skill) {
        body.push(el("p", { class: "reward", textContent: `${skill.icon} ${skill.label} 습득 — ${skill.desc}` }));
      } else {
        const m = STAT_META[stat];
        body.push(el("p", { class: "reward", textContent: `${m.icon} ${m.label}(${m.name}) ${before[stat]}${m.unit} → ${after[stat]}${m.unit}` }));
      }
      if (slotUnlocked) body.push(el("p", { class: "reward", textContent: `🔓 스킬 슬롯 해금! (${progress.skillSlots}/${QUIZ.MAX_SKILL_SLOTS})` }));
      body.push(el("p", { class: "npc", textContent: "훌륭하네! 이 지식은 이제 자네 갑옷의 일부일세." }));
    } else {
      body.push(el("p", { class: "npc", textContent: "이미 이수한 챕터라 추가 보상은 없지만, 복습만큼 좋은 수련도 없지!" }));
    }
  } else {
    body.push(el("div", { class: "result-big", textContent: `📶 ${result.score} / ${result.total} — 신호가 조금 약했어요` }));
    body.push(el("p", { class: "npc", textContent: "게임오버는 없다네. 틀린 문제의 해설을 보고, 교과서를 다시 읽은 뒤 새 문제로 도전하게." }));
    body.push(el("h3", { textContent: "틀린 문제 해설" }));
    for (const i of result.wrong) {
      const q = questions[i];
      body.push(el("div", { class: "explain" },
        el("b", { textContent: q.q }), el("br"),
        `정답: ${q.options[q.answer]}`, el("br"),
        q.explain
      ));
    }
  }

  render(
    header(c.title, "퀴즈 결과"),
    body,
    el("div", { class: "lib-actions" },
      button("← 목록", showHome),
      chapterLink(c, null, result.perfect ? "📖 원문 읽기 ↗" : "📖 교과서 다시 읽기 ↗"),
      !result.perfect && button("🔁 새 문제로 다시 도전", () => startQuiz(chapterId), "lib-btn primary")
    ),
    sourceNote(c)
  );
  session = null;
}

// ---------- 교과서 원문 (새 탭) ----------
let lastOpenedUrl = null;
/**
 * 교과서 원문을 새 탭으로 여는 링크 버튼 — section이 있으면 그 절로 바로 (퀘스트 "원문 읽기"도 이것을 쓴다).
 * <a target="_blank">라서 팝업 차단에 걸리지 않고, 가운데 클릭·길게 누르기도 브라우저 기본 동작을 따른다.
 */
export function chapterLink(chapter, section, label, cls = "lib-btn") {
  const url = CHAPTER_URL(chapter.file, section);
  return el("a", {
    class: cls, href: url, target: "_blank", rel: "noopener", textContent: label,
    title: "교과서 원문을 새 탭으로 엽니다",
    on: { click: () => { lastOpenedUrl = url; hooks.onChapterOpen(chapter.id); } }
  });
}

// ---------- 열기 / 닫기 ----------
export function openLibrary() {
  lastFocus = document.activeElement;
  overlay.hidden = false;
  hooks.onOpenChange(true);
  showHome();
}
export function closeLibrary() {
  overlay.hidden = true;
  session = null;
  hooks.onOpenChange(false);
  lastFocus?.focus?.({ preventScroll: true });
}
export const isLibraryOpen = () => !overlay.hidden;
/** 테스트 훅: 마지막으로 연 원문 주소 */
export const lastChapterUrl = () => lastOpenedUrl;

/** 테스트 훅: 진행 중 퀴즈의 정답 인덱스 */
export const currentAnswerKey = () => session?.questions.map((q) => q.answer) ?? null;

/** @param {LibraryHooks} h */
export function initLibrary(h) {
  hooks = h;
  rng = createRng(h.seed);
  // 배경(오버레이 바깥) 클릭이나 Esc로 닫기
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeLibrary(); });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) closeLibrary();
  });
}
