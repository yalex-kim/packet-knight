// 퀘스트 ↔ 교과서 연동 (PRD §6, Stage 9) — 순수 로직
//
// 퀘스트는 순서대로 열린다(Q0 → Q1 → …). 단계는 두 종류:
//   · 상태 단계(state): 진행도에서 바로 판정 (강좌 이수, 장비 단계, 던전 최고 층) — 이미 해 둔 것도 인정
//   · 사건 단계(event): 퀘스트가 진행 중일 때 일어난 사건을 센다 (걷기, 점프, 명중, 처치, 알바 등급)
//   · 예측 단계(whatif): 교과서 "예측해 보기" 질문에 맞게 답하기 — 퀘스트의 마지막 관문
// 완료하면 보상과 📖 완독 배지(챕터)를 준다.

import { CHAPTERS } from "./chapters.data.js";

/** 알바 등급 순서 */
const GRADE_RANK = { "-": 0, C: 1, B: 2, A: 3, S: 4 };

/**
 * @typedef {{ id: string, text: string, kind: "event"|"state"|"whatif", event?: string, match?: object, need?: number, check?: (p: any) => boolean, whatif?: number }} QuestStep
 * @typedef {{ id: string, code: string, title: string, chapter: string, region: string, reward: { label: string, cr2032?: number, title?: string, bonus?: Record<string, number>, perk?: string }, steps: QuestStep[] }} Quest
 * @type {Quest[]}
 */
export const QUESTS = [
  {
    id: "Q0", code: "Q0", title: "세계에 첫 패킷을 쏘다", chapter: "intro", region: "GATT 빌리지 (튜토리얼)",
    reward: { label: "칭호 '패킷 나이트' · CR2032 5개", cr2032: 5, title: "패킷 나이트" },
    steps: [
      { id: "walk", text: "광장을 10 m 걸어 보기 (WASD·탭·조이스틱)", kind: "event", event: "walk", need: 10 },
      { id: "jump", text: "점프하기 (스페이스바·점프 버튼)", kind: "event", event: "jump", need: 1 },
      { id: "hit", text: "훈련장에서 훈련용 비콘 봇에 ADV 패킷 명중", kind: "event", event: "hit", match: { type: "trainingBot" }, need: 1 },
      { id: "course", text: "도서관: '블루투스란 무엇인가' 만점 이수", kind: "state", check: (p) => Boolean(p.cleared.intro) },
      { id: "whatif", text: "🔮 예측해 보기: LE가 처음에 음악을 못 보낸 이유", kind: "whatif", whatif: 0 }
    ]
  },
  {
    id: "Q1", code: "Q1", title: "전파는 어떻게 날까?", chapter: "radio", region: "전파의 등대 · RF 랩",
    reward: { label: "TX +1 (PRD §6)", bonus: { tx: 1 } },
    steps: [
      { id: "job", text: "등대 알바: RSSI 측정 B등급 이상 1회", kind: "event", event: "job", match: { minGrade: "B" }, need: 1 },
      { id: "course", text: "도서관: '2.4 GHz 전파와 데시벨' 만점 이수", kind: "state", check: (p) => Boolean(p.cleared.radio) },
      { id: "antenna", text: "RF 랩: 안테나 강화 1단계 (링크 버짓의 '안테나 이득')", kind: "state", check: (p) => (p.gear?.antenna ?? 0) >= 1 },
      { id: "whatif", text: "🔮 예측해 보기: 송신 전력 +6 dB vs 앞주머니", kind: "whatif", whatif: 0 }
    ]
  },
  {
    id: "Q2", code: "Q2", title: "속도의 비밀 (1M vs 2M vs Coded)", chapter: "phy", region: "37채널 호핑 던전",
    reward: { label: "DLE 해금 — ADV 패킷 사거리 ×1.5 (PRD §6)", perk: "dle" },
    steps: [
      { id: "course", text: "도서관: '비트를 전파에 싣기: GFSK와 PHY' 만점 이수", kind: "state", check: (p) => Boolean(p.cleared.phy) },
      { id: "floor", text: "호핑 던전 1층 클리어", kind: "state", check: (p) => (p.dungeon?.maxFloor ?? 0) >= 1 },
      { id: "whatif", text: "🔮 예측해 보기: 가까운 거리에서 배터리를 아끼는 PHY", kind: "whatif", whatif: 0 }
    ]
  },
  {
    id: "Q3", code: "Q3", title: "숲의 세 갈래 길 (37/38/39)", chapter: "advertising", region: "훈련장 · 전파의 등대",
    reward: { label: "ADV 패킷 강화 — 데미지 계수 1.0 → 1.15 (PRD §6)", perk: "advBoost" },
    steps: [
      { id: "course", text: "도서관: '광고와 스캔' 만점 이수", kind: "state", check: (p) => Boolean(p.cleared.advertising) },
      { id: "kills", text: "훈련용 비콘 봇(GAP 브로드캐스터) 5마리 처치", kind: "event", event: "kill", match: { type: "trainingBot" }, need: 5 },
      { id: "job", text: "등대 알바: RSSI 측정 A등급 이상 1회", kind: "event", event: "job", match: { minGrade: "A" }, need: 1 },
      { id: "whatif", text: "🔮 예측해 보기: 2초 광고 · 1.28초 스캔 — 5초 안에 발견할 확률", kind: "whatif", whatif: 0 }
    ]
  }
];

/** 로드맵에만 있는 이후 퀘스트 (퀘스트 로그에 잠금으로 표시) — PRD §6 */
export const UPCOMING_QUESTS = [
  ["Q4", "채널을 지어 날아라", "hopping"], ["Q5", "돌진해서 연결하라", "connection"], ["Q6", "마을의 데이터 상인들", "gatt"],
  ["Q7", "잠긴 감옥을 열다", "security"], ["Q8", "전력의 마른 뼈", "power"], ["Q9", "간섭 속의 공존", "coexistence"],
  ["Q10", "타워에 신호를 릴레이하라", "mesh"], ["Q11", "소리로 위치를 잡아라", "audio"], ["Q12", "기사의 설계 철학", "design"]
];

export const PERKS = Object.freeze({
  dle: Object.freeze({ rangeMul: 1.5, label: "DLE — ADV 패킷 사거리 ×1.5" }),
  advBoost: Object.freeze({ coef: 1.15, label: "ADV 패킷 강화 — 데미지 계수 1.15" })
});

export const questById = (id) => QUESTS.find((q) => q.id === id);
export const whatifFor = (quest) => {
  const step = quest.steps.find((s) => s.kind === "whatif");
  return CHAPTERS.find((c) => c.id === quest.chapter).whatifs[step.whatif];
};

/** 저장되는 퀘스트 상태 */
export function createQuestState() {
  return { active: "Q0", progress: {}, done: {}, title: null, perks: {} };
}

/** 단계 하나가 끝났는가 */
export function stepDone(qs, p, quest, step) {
  if (step.kind === "state") return step.check(p);
  const n = qs.progress[quest.id]?.[step.id] ?? 0;
  return n >= (step.need ?? 1);
}

/** 퀘스트의 모든 단계(예측 제외)가 끝났는가 — 끝났으면 예측 단계가 열린다 */
export function readyForWhatif(qs, p, quest) {
  return quest.steps.filter((s) => s.kind !== "whatif").every((s) => stepDone(qs, p, quest, s));
}

function matches(step, ev) {
  if (step.kind !== "event" || step.event !== ev.type) return false;
  const m = step.match ?? {};
  if (m.type && ev.monsterType !== m.type) return false;
  if (m.minGrade && (GRADE_RANK[ev.grade] ?? 0) < GRADE_RANK[m.minGrade]) return false;
  return true;
}

/**
 * 게임 사건을 진행 중인 퀘스트에 반영
 * @param {{ type: "walk"|"jump"|"hit"|"kill"|"job", amount?: number, monsterType?: string, grade?: string }} ev
 * @returns {boolean} 변화가 있었는가
 */
export function questEvent(qs, ev) {
  const quest = questById(qs.active);
  if (!quest) return false;
  let changed = false;
  for (const step of quest.steps) {
    if (!matches(step, ev)) continue;
    const prog = (qs.progress[quest.id] ??= {});
    const before = prog[step.id] ?? 0;
    if (before >= (step.need ?? 1)) continue;
    prog[step.id] = Math.min(step.need ?? 1, before + (ev.amount ?? 1));
    changed = true;
  }
  return changed;
}

/**
 * 예측해 보기 답 제출 (보기 인덱스는 원문 기준) — 맞으면 퀘스트 완료
 * @returns {{ correct: boolean, completed: Quest|null }}
 */
export function answerWhatif(qs, p, questId, optionIndex) {
  const quest = questById(questId);
  if (!quest || qs.active !== questId || !readyForWhatif(qs, p, quest)) return { correct: false, completed: null };
  const w = whatifFor(quest);
  if (optionIndex !== w.answer) return { correct: false, completed: null };
  return { correct: true, completed: completeQuest(qs, p, quest) };
}

/** 완료 처리: 보상 지급, 배지, 다음 퀘스트 열기 */
function completeQuest(qs, p, quest, now = new Date()) {
  qs.done[quest.id] = now.toISOString();
  const r = quest.reward;
  if (r.cr2032) p.cr2032 += r.cr2032;
  if (r.title) qs.title = r.title;
  if (r.bonus) for (const [k, v] of Object.entries(r.bonus)) p.bonus[k] = (p.bonus[k] ?? 0) + v;
  if (r.perk) qs.perks[r.perk] = true;
  const idx = QUESTS.indexOf(quest);
  qs.active = QUESTS[idx + 1]?.id ?? null;
  return quest;
}

/** 완독 배지 = 완료한 퀘스트의 챕터 */
export const badges = (qs) => QUESTS.filter((q) => qs.done[q.id]).map((q) => q.chapter);
