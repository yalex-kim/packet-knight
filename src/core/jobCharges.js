// 측정기 배터리 — 알바 횟수 제한 (실시간 충전). 순수 로직: 시각(now, ms)을 인자로 받는다.
import { RSSI_JOB } from "./balance.js";

/** @typedef {{ stored: number, since: number }} Charges  stored칸을 since(ms) 시점에 가지고 있었다 */

export const fullCharges = (now) => ({ stored: RSSI_JOB.CHARGES_MAX, since: now });

/** now 시점의 { count, nextInSec } — 가득 차면 nextInSec = null */
export function chargesAt(c, now, cfg = RSSI_JOB) {
  const gained = Math.floor(Math.max(0, now - c.since) / (cfg.RECHARGE_SEC * 1000));
  const count = Math.min(cfg.CHARGES_MAX, c.stored + gained);
  if (count >= cfg.CHARGES_MAX) return { count, nextInSec: null };
  const elapsed = (now - c.since) % (cfg.RECHARGE_SEC * 1000);
  return { count, nextInSec: Math.ceil((cfg.RECHARGE_SEC * 1000 - elapsed) / 1000) };
}

/** 1칸 사용. 칸이 없으면 null, 있으면 새 상태 */
export function useCharge(c, now, cfg = RSSI_JOB) {
  const { count } = chargesAt(c, now, cfg);
  if (count <= 0) return null;
  if (count >= cfg.CHARGES_MAX) return { stored: count - 1, since: now }; // 가득 찬 동안엔 충전 시계가 멈춰 있다
  // 충전 진행 중인 시계는 유지: since를 충전된 칸 수만큼 앞당겨 정리
  const gained = Math.floor((now - c.since) / (cfg.RECHARGE_SEC * 1000));
  return { stored: c.stored + gained - 1, since: c.since + gained * cfg.RECHARGE_SEC * 1000 };
}
