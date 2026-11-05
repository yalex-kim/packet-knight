// 상점가 (Stage 12.2, PRD §4.6) — 무기점(성능)·옷가게(외형). 순수 로직 (THREE·DOM 없음)
// 무기는 ADV 패킷을 쏘는 방식이 다르다 — 교과서 PHY·광고 장의 교환 관계를 무기로 체험한다.
// 옷은 외형만 바꾼다 (사용자 결정: "무기는 성능, 옷은 외형 위주") — 밸런스 영향 없음.

/** @typedef {{ id: string, name: string, icon: string, price: number, desc: string, lore: string, chapter: string,
 *   coef: number, cooldownMul: number, rangeMul: number, spread: number[], blade: { color: number, length: number, kind: string } }} Weapon */
export const WEAPONS = Object.freeze([
  { id: "adv", name: "ADV 패킷 검", icon: "🗡️", price: 0,
    desc: "기본 검. 한 발씩 고르게 — 쿨타임 0.8초, 사거리 12 m.",
    lore: "LE 1M PHY처럼 무난한 기본기. 모든 기기가 반드시 지원한다.", chapter: "phy.html",
    coef: 1.0, cooldownMul: 1.0, rangeMul: 1.0, spread: [0], blade: { color: 0x7de3ff, length: 0.5, kind: "sword" } },
  { id: "phy2m", name: "2M PHY 쌍단검", icon: "⚡", price: 40,
    desc: "빠르게 연사 — 쿨타임 ×0.55, 한 발 피해 ×0.65, 사거리 ×0.8.",
    lore: "2M PHY는 같은 데이터를 절반 시간에 보낸다. 대신 감도가 떨어져 멀리 못 간다.", chapter: "phy.html",
    coef: 0.65, cooldownMul: 0.55, rangeMul: 0.8, spread: [0], blade: { color: 0xffd76b, length: 0.32, kind: "dagger" } },
  { id: "coded", name: "Coded S=8 장궁", icon: "🏹", price: 55,
    desc: "멀리 세게 — 사거리 ×1.7, 피해 ×1.45, 쿨타임 ×1.5.",
    lore: "Coded PHY S=8은 비트를 8배로 퍼뜨려 감도가 좋다 — 멀리 닿지만 느리다(125 kb/s).", chapter: "phy.html",
    coef: 1.45, cooldownMul: 1.5, rangeMul: 1.7, spread: [0], blade: { color: 0x7dffb5, length: 0.75, kind: "bow" } },
  { id: "extadv", name: "확장 광고 부채", icon: "🪭", price: 70,
    desc: "세 갈래 — 패킷 3발을 부채꼴(±16°)로, 한 발 피해 ×0.55, 쿨타임 ×1.15.",
    lore: "확장 광고는 광고 채널의 짧은 ADV_EXT_IND가 여러 범용 채널의 AUX 패킷을 가리킨다 — 한 번에 넓게 뿌린다.", chapter: "advertising.html",
    coef: 0.55, cooldownMul: 1.15, rangeMul: 0.9, spread: [-0.28, 0, 0.28], blade: { color: 0xb49bff, length: 0.45, kind: "fan" } }
]);

/** @typedef {{ id: string, name: string, icon: string, price: number, desc: string, tabard: number, tabardDark: number, plume: number, steel: number }} Outfit */
export const OUTFITS = Object.freeze([
  { id: "classic", name: "붉은 기사복", icon: "🟥", price: 0, desc: "처음 받은 기사복. 가슴에 하늘색 신호 문양.", tabard: 0xd8443c, tabardDark: 0xa8322b, plume: 0xd8443c, steel: 0xc9d3de },
  { id: "sig", name: "SIG 블루 제복", icon: "🟦", price: 20, desc: "블루투스 로고 색의 단정한 제복.", tabard: 0x0b62d6, tabardDark: 0x0a4aa3, plume: 0x2f8cff, steel: 0xd6dee8 },
  { id: "auracast", name: "오라캐스트 보라", icon: "🟪", price: 25, desc: "방송을 듣는 사람들을 위한 보랏빛 망토.", tabard: 0x7a5cc9, tabardDark: 0x5a3fa3, plume: 0xb49bff, steel: 0xd9d2e8 },
  { id: "mesh", name: "메시 숲지기", icon: "🟩", price: 25, desc: "릴레이 노드처럼 숲에 녹아드는 초록 옷.", tabard: 0x2f8f5a, tabardDark: 0x22704a, plume: 0x7dffb5, steel: 0xc8d6cc },
  { id: "stealth", name: "RPA 그림자", icon: "⬛", price: 30, desc: "15분마다 주소를 바꾸는 추적 방지 망토 — 흑색.", tabard: 0x2a2f3a, tabardDark: 0x1a1d24, plume: 0x39d0ff, steel: 0x8e9aa8 },
  { id: "gold", name: "황금 CR2032", icon: "🟨", price: 40, desc: "코인 전지를 모아 두른 금빛 갑옷 (자랑용).", tabard: 0xf2c14e, tabardDark: 0xc9962a, plume: 0xffe9a8, steel: 0xf6e7b5 },
  // Stage 13.22 새 옷 — 모양은 기존 옷 틀(knight.js OUTFIT_SET) + 새 색
  { id: "leaudio", name: "LE 오디오 망토", icon: "🎧", price: 35, desc: "등시성 채널처럼 박자를 맞추는 청록·검정 망토.", tabard: 0x0f8f8a, tabardDark: 0x0a5f5c, plume: 0x2ff0e0, steel: 0x3a4250 },
  { id: "pawr", name: "PAwR 가격표 갑옷", icon: "🏷️", price: 35, desc: "전자 가격표 수천 개를 깨우는 흰·빨강 제복.", tabard: 0xf2f4f7, tabardDark: 0xd23a3a, plume: 0xff5a5a, steel: 0xe2e6ec },
  { id: "retro", name: "BR/EDR 레트로 기사복", icon: "📻", price: 30, desc: "1999년 1.0 시절 느낌의 갈색 가죽 기사복.", tabard: 0x8a5a2e, tabardDark: 0x6a4220, plume: 0xe8cf9a, steel: 0xb8a58a },
  { id: "aoa", name: "AoA 안테나 갑옷", icon: "📐", price: 45, desc: "어깨에 안테나 배열을 단 은빛 갑옷 — 방향을 읽는 기사.", tabard: 0xc9d3de, tabardDark: 0x8e9aa8, plume: 0x39d0ff, steel: 0xe8eef5 },
  // 업적 전용 (Stage 13.22): 업적 「비콘 사냥꾼」(알바 S등급 10번)으로만 받는다
  { id: "hunter", name: "비콘 사냥꾼 망토", icon: "🎯", price: null, achOnly: "jobS10", desc: "비콘 알바 S등급 10번을 해낸 기사의 초록 망토.", tabard: 0x1f6a3a, tabardDark: 0x14482a, plume: 0xffd76b, steel: 0xc8d6cc },
  // 보스 전용 (Stage 13.19): 살 수 없고 5층 보스 전자레인지 오븐을 처음 쓰러뜨리면 받는다
  { id: "magnetron", name: "마그네트론 갑옷", icon: "🟧", price: null, bossOnly: true, desc: "전자레인지 오븐을 쓰러뜨린 기사의 증표 — 주황·크롬 갑옷.", tabard: 0xff7a1a, tabardDark: 0xc95a0a, plume: 0xffb050, steel: 0xe8ecf0 }
]);

export const weaponById = (id) => WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
export const outfitById = (id) => OUTFITS.find((o) => o.id === id) ?? OUTFITS[0];
export const emptyShop = () => ({ weapons: ["adv"], weapon: "adv", outfits: ["classic"], outfit: "classic" });

/** 세이브의 shop 필드 검증 (없거나 깨졌으면 기본값) — 세이브 버전은 그대로 */
export function validShop(raw) {
  const ok = raw && Array.isArray(raw.weapons) && Array.isArray(raw.outfits);
  if (!ok) return emptyShop();
  const weapons = ["adv", ...raw.weapons.filter((id) => id !== "adv" && WEAPONS.some((w) => w.id === id))];
  const outfits = ["classic", ...raw.outfits.filter((id) => id !== "classic" && OUTFITS.some((o) => o.id === id))];
  return {
    weapons, outfits,
    weapon: weapons.includes(raw.weapon) ? raw.weapon : "adv",
    outfit: outfits.includes(raw.outfit) ? raw.outfit : "classic"
  };
}

/**
 * 사기 — CR2032가 모자라거나 이미 있으면 실패. 사면 바로 장착한다.
 * @returns {{ ok: boolean, reason?: "owned"|"funds"|"unknown" }}
 */
export function buy(progress, kind, id) {
  const list = kind === "weapon" ? WEAPONS : OUTFITS;
  const item = list.find((x) => x.id === id);
  if (!item || item.bossOnly || item.achOnly) return { ok: false, reason: "unknown" };   // 보스·업적 전용은 살 수 없다
  const shop = progress.shop;
  const owned = kind === "weapon" ? shop.weapons : shop.outfits;
  if (owned.includes(id)) return { ok: false, reason: "owned" };
  if (progress.cr2032 < item.price) return { ok: false, reason: "funds" };
  progress.cr2032 -= item.price;
  owned.push(id);
  equip(progress, kind, id);
  return { ok: true };
}
/** 장착 — 가진 것만 */
export function equip(progress, kind, id) {
  const shop = progress.shop;
  if (kind === "weapon" && shop.weapons.includes(id)) { shop.weapon = id; return true; }
  if (kind === "outfit" && shop.outfits.includes(id)) { shop.outfit = id; return true; }
  return false;
}

/** 보스 전용 옷 받기 (Stage 13.19) — 처음이면 true */
export function grantOutfit(progress, id) {
  const shop = progress.shop;
  if (shop.outfits.includes(id) || !OUTFITS.some((o) => o.id === id)) return false;
  shop.outfits.push(id);
  return true;
}
