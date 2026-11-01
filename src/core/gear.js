// 장비 강화 — 스탯 반영·기대 비용 (PRD §3.3, §8.4). 순수 로직
import { GEAR, upgradeCost, upgradeSuccess, UPGRADE } from "./balance.js";

/** @typedef {Record<keyof typeof GEAR, number>} GearLevels */
export const emptyGear = () => Object.fromEntries(Object.keys(GEAR).map((k) => [k, 0]));

/** 기본 스탯에 장비 강화치를 더한다 */
export function applyGear(stats, levels) {
  const out = { ...stats };
  for (const [k, g] of Object.entries(GEAR)) out[g.stat] = +(out[g.stat] + g.per * (levels[k] ?? 0)).toFixed(2);
  return out;
}

/** 한 번 강화 시도 → { success, cost } (실패해도 재료는 소모) */
export function tryUpgrade(level, rng) {
  if (level >= UPGRADE.MAX_LEVEL) return null;
  return { success: rng() < upgradeSuccess(level), cost: upgradeCost(level) };
}

/** 0 → target 레벨까지의 기대 CR2032 비용 (실패 재시도 포함): Σ cost(k) / p(k) */
export function expectedCostTo(target) {
  let sum = 0;
  for (let k = 0; k < target; k++) sum += upgradeCost(k) / upgradeSuccess(k);
  return sum;
}
