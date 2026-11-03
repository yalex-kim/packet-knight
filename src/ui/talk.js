// 주민 대사창 (Stage 11.14) — 주민을 누르면 화면 아래에 초상화 + 이름 + 대사 (DOM)
// 대사는 core/villagerLines.js에서 관심 장 위주로 무작위, 📖로 그 대사의 교과서 장을 새 탭으로 연다.

import { pickLine } from "../core/villagerLines.js";
import { CHAPTERS } from "../core/chapters.data.js";
import { chapterUrl } from "../core/book.js";

let box, hooks, current = null, typing = 0, lastText = null;

function build() {
  box = document.createElement("div");
  box.id = "talk";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "주민과 대화");
  box.hidden = true;
  box.innerHTML = `
    <img class="talk-face" alt="" width="256" height="256" />
    <div class="talk-body">
      <div class="talk-head"><b class="talk-name"></b><span class="talk-role"></span>
        <button type="button" class="talk-close" aria-label="닫기">×</button></div>
      <p class="talk-text" aria-live="polite"></p>
      <div class="talk-actions">
        <button type="button" class="talk-btn talk-more">💬 다른 이야기</button>
        <a class="talk-btn talk-book" target="_blank" rel="noopener"></a>
      </div>
    </div>`;
  document.body.append(box);
  box.querySelector(".talk-close").addEventListener("click", closeTalk);
  box.querySelector(".talk-more").addEventListener("click", () => speak());
  box.querySelector(".talk-text").addEventListener("click", finishTyping);
  box.querySelector(".talk-book").addEventListener("click", () => hooks.onChapterOpen?.(box.querySelector(".talk-book").dataset.chapter));
  window.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") { e.stopPropagation(); closeTalk(); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); typing ? finishTyping() : speak(); }
  }, { capture: true });
  // 대사창 바깥을 누르면 닫힌다
  document.addEventListener("pointerdown", (e) => { if (!box.hidden && !box.contains(e.target)) closeTalk(); }, { capture: true });
}

function finishTyping() {
  if (!typing) return;
  clearInterval(typing);
  typing = 0;
  box.querySelector(".talk-text").textContent = box.dataset.full;
}

/** 다음 대사 — 한 글자씩 써 내려간다 */
function speak() {
  const line = pickLine(current.topics, Math.random, lastText);
  lastText = line.text;
  const ch = CHAPTERS.find((c) => c.id === line.chapter);
  const book = box.querySelector(".talk-book");
  book.href = chapterUrl(ch.file);
  book.dataset.chapter = ch.id;
  book.textContent = `📖 ${ch.title.split(":")[0]}`;
  book.title = `교과서: ${ch.title} (새 탭)`;
  const el = box.querySelector(".talk-text");
  box.dataset.full = line.text;
  clearInterval(typing);
  let i = 0;
  el.textContent = "";
  typing = setInterval(() => {
    i += 2;
    el.textContent = line.text.slice(0, i);
    if (i >= line.text.length) { clearInterval(typing); typing = 0; }
  }, 28);
  hooks.onLine?.(line);
}

/** @param {{ onOpen?: (v: any) => void, onClose?: () => void, onChapterOpen?: (id: string) => void, onLine?: (line: any) => void }} h */
export function initTalk(h) { hooks = h; }

/** @param {{ id: string, name: string, role: string, face: string, topics: string[] }} villager */
export function openTalk(villager) {
  if (!box) build();
  current = villager;
  lastText = null;
  box.querySelector(".talk-face").src = `./src/assets/faces/face-${villager.face}-v1.webp`;
  box.querySelector(".talk-name").textContent = villager.name;
  box.querySelector(".talk-role").textContent = villager.role;
  box.hidden = false;
  box.classList.remove("talk-in"); void box.offsetWidth; box.classList.add("talk-in");
  hooks.onOpen?.(villager);
  speak();
}
export function closeTalk() {
  if (!box || box.hidden) return;
  finishTyping();
  box.hidden = true;
  current = null;
  hooks.onClose?.();
}
export const isTalkOpen = () => Boolean(box && !box.hidden);
export const talkState = () => ({ open: isTalkOpen(), name: current?.name ?? null, text: box?.dataset.full ?? null, face: box?.querySelector(".talk-face")?.getAttribute("src") ?? null, book: box?.querySelector(".talk-book")?.getAttribute("href") ?? null });
export const talkMore = () => speak();
