// 🌟 특성 (Stage 13.32) — 5레벨마다 BLE 기술 이름의 특성 셋 중 하나를 고른다. 순수 로직 (THREE·DOM 없음)
// 세이브: progress.talents = ["coded", "retx", …] (고른 순서). 없으면 [] (버전 그대로)

import { TALENT } from "./balance.js";
import { levelFromXp } from "./combat.js";

/** kind: stat(스탯을 올림) | fx(효과) — 같은 특성을 여러 번 골라도 쌓인다 */
export const TALENTS = Object.freeze([
  { id: "coded", icon: "🛡️", name: "Coded PHY", kind: "stat", stat: "hp", desc: `오류 정정 부호로 버틴다 — 최대 HP +${TALENT.STAT.hp}` },
  { id: "txpow", icon: "📶", name: "송신 전력 +3 dBm", kind: "stat", stat: "tx", desc: `더 세게 쏜다 — TX +${TALENT.STAT.tx}` },
  { id: "lna", icon: "👂", name: "저잡음 증폭기", kind: "stat", stat: "rx", desc: `약한 신호도 듣고 피한다 — RX(회피) +${TALENT.STAT.rx}%` },
  { id: "lesc", icon: "🔐", name: "LE Secure Connections", kind: "stat", stat: "sec", desc: `ECDH로 키를 지킨다 — SEC(방어) +${TALENT.STAT.sec}` },
  { id: "ci", icon: "⏱️", name: "짧은 연결 간격", kind: "stat", stat: "ci", desc: `더 자주 주고받는다 — CI(연사) +${TALENT.STAT.ci}` },
  { id: "extadv", icon: "📢", name: "확장 광고", kind: "fx", desc: `더 많이 알린다 — 처치 XP ×${TALENT.XP_MUL}` },
  { id: "retx", icon: "🔁", name: "재전송(ARQ)", kind: "fx", desc: `잃은 패킷은 다시 — 처치마다 HP +${TALENT.HEAL_ON_KILL}` },
  { id: "harvest", icon: "🔋", name: "에너지 하베스팅", kind: "fx", desc: `주변 에너지를 모은다 — CR2032를 주울 때 ${Math.round(TALENT.CR_EXTRA_CHANCE * 100)}% 확률로 +1` }
]);
export const talentById = (id) => TALENTS.find((t) => t.id === id) ?? null;

/** n번째 고르기(0부터)에 나오는 세 가지 — 누구에게나 같고, 바로 앞 고르기와 겹치지 않게 돈다 */
export function talentOffer(n) {
  const ids = TALENTS.map((t) => t.id), k = ids.length;
  return [0, 1, 2].map((j) => ids[(n * 3 + j) % k]);
}

/** 지금 레벨까지 고를 수 있는 횟수 − 이미 고른 횟수 */
export function pendingTalents(progress) {
  const earned = Math.floor(levelFromXp(progress.xp).level / TALENT.EVERY);
  return Math.max(0, earned - (progress.talents?.length ?? 0));
}

/** 고르기 — 지금 나온 셋 중 하나만 @returns 고른 특성 또는 null */
export function chooseTalent(progress, id) {
  if (pendingTalents(progress) <= 0) return null;
  const n = progress.talents.length;
  if (!talentOffer(n).includes(id)) return null;
  progress.talents.push(id);
  return talentById(id);
}

/** 스탯형 특성의 합 { hp: 10, … } */
export function talentStats(talents = []) {
  const out = {};
  for (const id of talents) { const t = talentById(id); if (t?.kind === "stat") out[t.stat] = (out[t.stat] ?? 0) + TALENT.STAT[t.stat]; }
  return out;
}

/** 효과형 특성 { xpMul, healOnKill, crChance } (겹치면 쌓인다) */
export function talentFx(talents = []) {
  const n = (id) => talents.filter((x) => x === id).length;
  return { xpMul: TALENT.XP_MUL ** n("extadv"), healOnKill: TALENT.HEAL_ON_KILL * n("retx"), crChance: Math.min(1, TALENT.CR_EXTRA_CHANCE * n("harvest")) };
}

/** 세이브 검증 — 아는 id만, 최대 40개 */
export const validTalents = (raw) => (Array.isArray(raw) ? raw.filter((id) => talentById(id)).slice(0, 40) : []);
