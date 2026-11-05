// 🧪 소모품 (Stage 13.22) — 순수 로직 (THREE·DOM 없음). 무기점의 🧪 소모품 칸에서 사고, 가방 › 소지품에서 쓴다.
// 강해지는 것(AFH 부적·MIC 두루마리·연결 갱신 물약)은 던전 한 층에 하나씩만. 🍎 사과는 비밀의 사과나무에서 하루 한 번.
// 세이브: progress.items = { bag: { id: 개수 }, appleDay: "YYYY-MM-DD"|null } — 없으면 기본값 (버전 그대로)

/** @type {ReadonlyArray<{ id: string, icon: string, name: string, price: number|null, desc: string, dungeonOnly?: boolean, perFloor?: boolean }>} */
export const ITEMS = Object.freeze([
  { id: "battery", icon: "🔋", name: "예비 측정기 배터리", price: 6, desc: "비콘 알바 측정기를 한 칸 바로 채운다." },
  { id: "afhCharm", icon: "📶", name: "AFH 부적", price: 4, desc: "던전에서 드러난 간섭 대역을 채널맵에서 한 번 뺀다. (AFH 스킬이 없을 때 좋다)", dungeonOnly: true, perFloor: true },
  { id: "mic", icon: "🛡️", name: "MIC 두루마리", price: 5, desc: "던전에서 다음 공격 두 번을 위조 패킷으로 버린다.", dungeonOnly: true, perFloor: true },
  { id: "ciPotion", icon: "⏱️", name: "연결 갱신 물약", price: 6, desc: "60초 동안 공격 쿨타임 ×0.7 — Connection Update로 간격을 줄인 것처럼.", perFloor: true },
  { id: "apple", icon: "🍎", name: "비밀의 사과", price: null, desc: "HP를 절반 회복한다. 비밀의 사과나무에서 하루 한 번 줍는다." }
]);
export const ITEM_FX = Object.freeze({ MIC_BLOCKS: 2, CI_SEC: 60, CI_MUL: 0.7, APPLE_HEAL: 0.5 });
export const itemById = (id) => ITEMS.find((i) => i.id === id) ?? null;

export const emptyItems = () => ({ bag: {}, appleDay: null });
export function validItems(raw) {
  if (!raw || typeof raw !== "object") return emptyItems();
  const bag = Object.fromEntries(Object.entries(raw.bag ?? {}).filter(([k, v]) => itemById(k) && Number.isInteger(v) && v > 0).map(([k, v]) => [k, Math.min(v, 99)]));
  return { bag, appleDay: typeof raw.appleDay === "string" ? raw.appleDay : null };
}

/** 사기 @returns {{ ok: boolean, reason?: "funds"|"unknown"|"full" }} */
export function buyItem(progress, id) {
  const it = itemById(id);
  if (!it || it.price == null) return { ok: false, reason: "unknown" };
  if (progress.cr2032 < it.price) return { ok: false, reason: "funds" };
  if ((progress.items.bag[id] ?? 0) >= 99) return { ok: false, reason: "full" };
  progress.cr2032 -= it.price;
  progress.items.bag[id] = (progress.items.bag[id] ?? 0) + 1;
  return { ok: true };
}
/** 하나 꺼내 쓰기 (없으면 false) */
export function takeItem(progress, id) {
  const n = progress.items.bag[id] ?? 0;
  if (n <= 0) return false;
  if (n === 1) delete progress.items.bag[id]; else progress.items.bag[id] = n - 1;
  return true;
}
/** 🍎 오늘 사과를 아직 안 주웠으면 하나 (true) */
export function pickApple(progress, day) {
  if (progress.items.appleDay === day) return false;
  progress.items.appleDay = day;
  progress.items.bag.apple = (progress.items.bag.apple ?? 0) + 1;
  return true;
}
