// 💡 주민이 들려주는 스펙 이야기 (Stage 13.14) — 순수 로직 (THREE·DOM 없음)
// 게임에서 한 박자 쉬는 일(층 클리어, KO 뒤 재시작, 마을 귀환, 상점 구매, 레벨 업)이 생기면
// 그 일과 관련된 장을 맡은 주민 한 명의 머리 위에 💡가 뜬다. 말을 걸면 스펙 한 조각 + 🎯 맞혀 볼래?
// 정해진 시간마다 화면을 막던 카드(13.12)를 대신한다.

import { VILLAGERS } from "./layout.js";
import { SPEC_CARDS } from "./specCards.js";

/** 이벤트 → 관련 장 (없으면 아무 장) */
export const TIP_EVENTS = Object.freeze({
  floorClear: ["hopping", "coexistence", "connection"],   // 간섭을 피해 층을 깼다
  ko: ["connection", "hopping", "power"],                 // 연결 타임아웃 — 감독 타임아웃·도약
  returnVillage: [],
  levelUp: [],
  shop: []                                                // 산 물건에 따라 (itemChapters)
});

/** 상점 물건 → 관련 장 */
const ITEM_CHAPTERS = { adv: ["advertising"], phy2m: ["phy"], coded: ["phy", "radio"], extadv: ["advertising"],
  classic: ["intro"], sig: ["intro", "gatt"], auracast: ["audio"], mesh: ["mesh"], stealth: ["security"], gold: ["power"] };
export const itemChapters = (id) => ITEM_CHAPTERS[id] ?? [];

/**
 * 💡 하나 만들기: 관련 장을 맡은 주민 → 그 주민의 관심 장 중 관련 장의 카드(안 본 것부터)
 * @param {string} event TIP_EVENTS 키 @param {string[]} [extra] 추가 관련 장 (상점 물건 등)
 * @param {Set<string>} seen 본 카드 id @returns {{ villagerId: string, card: typeof SPEC_CARDS[number], event: string }}
 */
export function makeTip(event, extra = [], seen = new Set(), rng = Math.random) {
  const want = [...new Set([...(TIP_EVENTS[event] ?? []), ...extra])];
  const fits = VILLAGERS.filter((v) => v.topics.some((t) => want.includes(t)));
  const pool = fits.length ? fits : VILLAGERS;
  const v = pool[Math.floor(rng() * pool.length)];
  const chapters = want.length ? v.topics.filter((t) => want.includes(t)) : v.topics;
  const cards = SPEC_CARDS.filter((c) => (chapters.length ? chapters : v.topics).includes(c.chapter));
  const fresh = cards.filter((c) => !seen.has(c.id));
  const list = fresh.length ? fresh : cards;
  return { villagerId: v.id, card: list[Math.floor(rng() * list.length)], event };
}
