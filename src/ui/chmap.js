// 전투 중 실시간 채널맵 HUD (PRD §4.3 "화면 상단에 실시간 채널맵", Stage 8) (DOM)
// 37칸 = LE 데이터 채널. 지금 채널(테두리), 스캔한 Wi-Fi 몬스터 대역(빨강), 채널맵에서 뺀 칸(어둡게),
// 다음 instant에 바뀔 칸(줄무늬). 칸을 누르면 그 채널을 넣고 빼는 LL_CHANNEL_MAP_IND가 나간다.

import { DATA_CHANNELS, dataChannelFreq } from "../core/hopping.js";
import { targetMap, monsterBand, LINK_COMBAT } from "../core/link.js";

const root = document.getElementById("chmap");
const cellsBox = root.querySelector(".cm-cells");
const info = root.querySelector(".cm-info");
const afhBtn = root.querySelector(".cm-afh");
const resetBtn = root.querySelector(".cm-reset");
const cells = [];

/** @type {{ onToggle: (ch: number) => void, onAfh: () => void, onReset: () => void, hasAfh: () => boolean }} */
let hooks;

export function initChmap(h) {
  hooks = h;
  for (let c = 0; c < DATA_CHANNELS; c++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cm";
    b.dataset.ch = String(c);
    b.title = `채널 ${c} · ${dataChannelFreq(c)} MHz`;
    b.addEventListener("pointerdown", (e) => { e.stopPropagation(); hooks.onToggle(c); });
    cells.push(b);
    cellsBox.append(b);
  }
  afhBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); hooks.onAfh(); });
  resetBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); hooks.onReset(); });
}

/**
 * @param {null | { link: any, battle: any, phase: string }} run 던전 전투 중이 아니면 숨김
 */
export function updateChmap(run) {
  const show = Boolean(run && run.phase === "combat" && run.link);
  root.hidden = !show;
  if (!show) return;
  const { link, battle } = run;
  const bands = new Map(); // 채널 → Wi-Fi 번호들
  for (const m of battle.monsters) {
    if (m.state === "dead" || !m.revealed) continue;
    for (const c of monsterBand(m)) bands.set(c, [...(bands.get(c) ?? []), m.wifi]);
  }
  const next = targetMap(link);
  for (let c = 0; c < DATA_CHANNELS; c++) {
    const el = cells[c];
    el.classList.toggle("now", link.channel === c);
    el.classList.toggle("band", bands.has(c));
    el.classList.toggle("off", !link.map[c]);
    el.classList.toggle("pend", Boolean(link.pending) && next[c] !== link.map[c]);
  }
  const danger = bands.get(link.channel);
  const pend = link.pending ? ` · 채널맵 갱신 대기 → 이벤트 #${link.pending.instant} (${Math.max(0, link.pending.instant - link.event)}회 뒤)` : "";
  info.textContent = `연결 이벤트 #${link.event} · 지금 채널 ${link.channel} (${dataChannelFreq(link.channel)} MHz)${link.remapped ? " ↺" : ""} ${danger ? `⚠ Wi-Fi ${danger.join("·")}번 대역 — 내 패킷 손실·피격` : "✓ 간섭 밖"}${pend}`;
  info.classList.toggle("danger", Boolean(danger));
  const skill = hooks.hasAfh();
  afhBtn.disabled = !skill;
  afhBtn.textContent = skill ? "📶 간섭 채널 빼기 (AFH)" : "🔒 AFH — 도서관 '주파수 도약' 강좌";
  afhBtn.title = skill ? "스캔한 Wi-Fi 대역을 채널맵에서 뺀다 (6 이벤트 뒤 적용)" : "도서관에서 '주파수 도약과 공존' 강좌를 만점 이수하면 열린다. 그 전엔 칸을 직접 눌러 빼자.";
}

export const CHMAP_INTERVAL = LINK_COMBAT.INTERVAL;
