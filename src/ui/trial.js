// 주민 실습 의뢰 창 (Stage 13.27, 퀘스트 Q9~Q13) — 4라운드 판단·계산 문제 또는 💡 메시 릴레이 퍼즐 (DOM)

import { trialFor, gradeTrial, MESH_LEVELS, runMesh } from "../core/trials.js";
import { CHAPTERS } from "../core/chapters.data.js";
import { chapterUrl } from "../core/book.js";

let overlay, panel, hooks, cur = null;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/** @param {{ onPassed: (id: string) => void, onOpenChange: (open: boolean) => void, sfx?: (n: string) => void }} h */
export function initTrial(h) {
  hooks = h;
  overlay = document.createElement("div");
  overlay.id = "trial";
  overlay.className = "overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `<div class="panel tr"></div>`;
  panel = overlay.querySelector(".panel");
  document.body.append(overlay);
  overlay.addEventListener("click", onClick);
  window.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") { e.stopPropagation(); closeTrial(); } }, { capture: true });
}

function head(t, sub) {
  const ch = CHAPTERS.find((c) => c.id === t.chapter);
  return `<div class="head"><div><h2>${esc(t.title)}</h2><div class="muted">${esc(sub)}</div></div>
    <button type="button" class="close" data-act="close" aria-label="닫기">×</button></div>
    <p class="npc">${esc(t.intro)}</p>
    ${ch ? `<a class="tr-book" href="${esc(chapterUrl(ch.file))}" target="_blank" rel="noopener">📖 교과서 「${esc(ch.title)}」 ↗</a>` : ""}`;
}

// ---------- 판단·계산 4라운드 ----------
function renderRound() {
  const t = cur.trial, i = cur.i, r = cur.order[i];
  if (i >= cur.order.length) return renderResult();
  const last = cur.last;
  panel.innerHTML = head(t, `${i + 1} / ${cur.order.length} · ${t.pass}개 이상 맞히면 통과`) + `
    ${last ? `<p class="tr-fb ${last.ok ? "ok" : "bad"}">${last.ok ? "⭕" : "❌"} ${esc(last.explain)}</p>` : ""}
    <p class="tr-q">${esc(r.q)}</p>
    <div class="tr-opts">${cur.optOrder[i].map((k) => `<button type="button" class="opt" data-act="pick" data-k="${k}">${esc(r.options[k])}</button>`).join("")}</div>`;
}
function renderResult() {
  const t = cur.trial;
  const { score, passed } = gradeTrial({ ...t, rounds: cur.order }, cur.picks);
  const last = cur.last;
  if (passed && !cur.reported) { cur.reported = true; hooks.onPassed(t.id); }
  hooks.sfx?.(passed ? "perfect" : "wrong");
  panel.innerHTML = head(t, passed ? "통과!" : "아쉽다 — 다시 도전") + `
    ${last ? `<p class="tr-fb ${last.ok ? "ok" : "bad"}">${last.ok ? "⭕" : "❌"} ${esc(last.explain)}</p>` : ""}
    <div class="result-big">${score} / ${cur.order.length} ${passed ? "✅ 의뢰 완료" : "❌"}</div>
    <div class="lib-actions">${passed ? `<button type="button" class="lib-btn primary" data-act="close">완료 — 퀘스트 로그에서 🔮 예측해 보기</button>`
      : `<button type="button" class="lib-btn primary" data-act="retry">🔁 순서를 바꿔 다시 도전</button>`}</div>`;
}

// ---------- 💡 메시 릴레이 퍼즐 ----------
function renderMesh(result = null) {
  const t = cur.trial, L = MESH_LEVELS[cur.level];
  const xs = L.nodes.map((n) => n[0]), ys = L.nodes.map((n) => n[1]);
  const W = 60 * (Math.max(...xs) + 1) + 20, H = 60 * (Math.max(...ys) + 1) + 20;
  const P = (n) => [30 + n[0] * 60, 30 + n[1] * 60];
  const reached = result?.reached ?? new Set();
  const relayN = [...cur.relays].length;
  panel.innerHTML = head(t, `${cur.level + 1} / ${MESH_LEVELS.length}단계 · 릴레이 ≤ ${L.maxRelays}개 · TTL ≤ ${L.maxTtl}`) + `
    <p class="tr-q">${esc(L.hint)}</p>
    <p class="muted">조명을 눌러 릴레이로 켜고 끈다(테두리). 📡는 등대 스위치. 한 번 외치면 두 칸 안의 조명이 듣고, 릴레이만 TTL을 1 줄여 다시 외친다(TTL 2 이상일 때).</p>
    <svg class="mesh" viewBox="0 0 ${W} ${H}" role="group" aria-label="릴레이 배치">
      ${L.nodes.map((n, i) => {
        const [x, y] = P(n), src = i === L.source, rel = cur.relays.has(i), got = reached.has(i);
        return `<g data-act="relay" data-i="${i}" class="mn${src ? " src" : ""}${rel ? " rel" : ""}${got ? " got" : ""}" tabindex="0" role="button" aria-label="${src ? "등대 스위치" : `조명 ${i}${rel ? " (릴레이)" : ""}`}">
          ${rel || src ? `<circle cx="${x}" cy="${y}" r="${L.range * 60}" class="mn-reach"/>` : ""}
          <circle cx="${x}" cy="${y}" r="17" class="mn-dot"/><text x="${x}" y="${y + 6}" text-anchor="middle">${src ? "📡" : got ? "💡" : "○"}</text></g>`;
      }).join("")}
    </svg>
    <div class="mesh-ctl">
      <span>릴레이 <b>${relayN}</b> / ${L.maxRelays}</span>
      <span class="ttl">TTL <button type="button" class="lib-btn" data-act="ttl" data-d="-1" aria-label="TTL 줄이기">−</button><b>${cur.ttl}</b><button type="button" class="lib-btn" data-act="ttl" data-d="1" aria-label="TTL 늘리기">+</button></span>
      <button type="button" class="lib-btn primary" data-act="run">📡 스위치 누르기</button>
    </div>
    ${result ? `<p class="tr-fb ${result.ok ? "ok" : "bad"}">${result.ok ? `✅ 모두 켜졌다! 전송 ${result.transmissions}번` : `❌ ${esc(result.why)} (전송 ${result.transmissions}번)`}</p>` : ""}
    ${result?.ok ? `<div class="lib-actions"><button type="button" class="lib-btn primary" data-act="next">${cur.level + 1 < MESH_LEVELS.length ? "다음 단계 →" : "✅ 의뢰 완료"}</button></div>` : ""}`;
}

function onClick(e) {
  if (e.target === overlay) return closeTrial();
  const b = e.target instanceof Element ? e.target.closest("[data-act]") : null;
  if (!b || !cur) return;
  const act = b.dataset.act;
  if (act === "close") return closeTrial();
  if (act === "pick") {
    const r = cur.order[cur.i], k = Number(b.dataset.k);
    cur.picks[cur.i] = k;
    cur.last = { ok: k === r.answer, explain: r.explain };
    hooks.sfx?.(k === r.answer ? "correct" : "wrong");
    cur.i++;
    return renderRound();
  }
  if (act === "retry") return start(cur.trial.id);
  if (act === "relay") {
    const i = Number(b.dataset.i);
    if (i === MESH_LEVELS[cur.level].source) return;
    cur.relays.has(i) ? cur.relays.delete(i) : cur.relays.add(i);
    hooks.sfx?.("channelToggle");
    return renderMesh();
  }
  if (act === "ttl") { cur.ttl = Math.max(2, Math.min(7, cur.ttl + Number(b.dataset.d))); return renderMesh(); }
  if (act === "run") {
    const res = runMesh(MESH_LEVELS[cur.level], cur.relays, cur.ttl);
    hooks.sfx?.(res.ok ? "afh" : "wrong");
    return renderMesh(res);
  }
  if (act === "next") {
    if (cur.level + 1 < MESH_LEVELS.length) { cur.level++; cur.relays = new Set(); cur.ttl = 3; return renderMesh(); }
    if (!cur.reported) { cur.reported = true; hooks.onPassed(cur.trial.id); }
    hooks.sfx?.("perfect");
    return closeTrial();
  }
}

function start(id) {
  const t = trialFor(id);
  cur = { trial: t, i: 0, picks: [], last: null, reported: false };
  overlay.setAttribute("aria-label", t.title);
  if (t.kind === "mesh") { cur.level = 0; cur.relays = new Set(); cur.ttl = 3; return renderMesh(); }
  cur.order = shuffle(t.rounds);
  cur.optOrder = cur.order.map((r) => shuffle(r.options.map((_, k) => k)));
  renderRound();
}

export function openTrial(id) {
  if (!trialFor(id)) return;
  overlay.hidden = false;
  hooks.onOpenChange(true);
  start(id);
}
export function closeTrial() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  hooks.onOpenChange(false);
}
export const isTrialOpen = () => Boolean(overlay && !overlay.hidden);
export const trialState = () => cur && { id: cur.trial.id, i: cur.i, level: cur.level, order: cur.order?.map((r) => r.answer) };
