// 전투 공식 — 데미지·회피·치명타·레벨 (PRD §8.4). 순수 로직
import { COMBAT, XP_TO_NEXT } from "./balance.js";

/**
 * 데미지 = max(1, TX × 스킬계수 − 대상 SEC) × (치명타 10% 확률로 ×1.5)
 * @returns {{ amount: number, crit: boolean }}
 */
export function computeDamage(tx, coef, targetSec, rng) {
  const base = Math.max(1, tx * coef - targetSec);
  const crit = rng() < COMBAT.CRIT_CHANCE;
  return { amount: Math.round(base * (crit ? COMBAT.CRIT_MULT : 1)), crit };
}

/** RX(%) 확률로 회피 */
export const rollDodge = (rxPercent, rng) => rng() < rxPercent / 100;

/** 누적 XP → { level, intoLevel, toNext } */
export function levelFromXp(xp) {
  let level = 1, rest = xp;
  while (rest >= XP_TO_NEXT(level)) { rest -= XP_TO_NEXT(level); level++; }
  return { level, intoLevel: rest, toNext: XP_TO_NEXT(level) };
}
