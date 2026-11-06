// 🪞 나의 기사 — 닉네임·성별 (Stage 13.34) — 순수 로직 (THREE·DOM 없음)
// 세이브: progress.look = { name, gender, skin, hairColor, made } (없으면 기본값, 버전 그대로). made = 캐릭터 만들기 창을 마쳤는지.
// 서버(functions/api/save.js)도 cleanName 으로 닉네임을 다시 검사해 랭킹 이름으로 쓴다.

export const GENDERS = Object.freeze([{ id: "m", label: "남자 기사" }, { id: "f", label: "여자 기사" }]);
export const NAME_MIN = 2, NAME_MAX = 12;
/** 🎨 피부톤·머리색 (Stage 13.35) — "base" = 모델 원래 색. color 는 칠할 목표 색 */
export const SKINS = Object.freeze([
  { id: "base", color: null, swatch: 0xf0b48a }, { id: "s1", color: 0xf6d2b8 }, { id: "s2", color: 0xf3c9a5 }, { id: "s3", color: 0xd9a27a },
  { id: "s4", color: 0xb57a52 }, { id: "s5", color: 0x8a5636 }, { id: "s6", color: 0x5e3a24 }
]);
export const HAIR_COLORS = Object.freeze([
  { id: "base", color: null, swatch: null }, { id: "black", color: 0x2a2a33 }, { id: "brown", color: 0x6b4026 }, { id: "blonde", color: 0xf2cf6b },
  { id: "red", color: 0xc8352e }, { id: "silver", color: 0xd8dee8 }, { id: "blue", color: 0x3f7fe0 }, { id: "pink", color: 0xf08bb8 }, { id: "green", color: 0x3fa86a }
]);
export const defaultLook = () => ({ name: "", gender: "m", skin: "base", hairColor: "base", made: false });
export const skinHex = (id) => SKINS.find((s) => s.id === id)?.color ?? null;
export const hairHex = (id) => HAIR_COLORS.find((s) => s.id === id)?.color ?? null;

const BAD = ["시발", "씨발", "병신", "좆", "개새", "fuck", "shit", "admin", "관리자", "운영자"];

/** 닉네임 정리 — 제어문자·꺾쇠·따옴표 제거, 공백은 하나로, 2~12자. 안 되면 "" */
export function cleanName(raw) {
  const s = String(raw ?? "").replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, "").replace(/\s+/g, " ").trim();
  const t = [...s].slice(0, NAME_MAX).join("");
  if ([...t].length < NAME_MIN) return "";
  const low = t.toLowerCase().replace(/\s/g, "");
  return BAD.some((b) => low.includes(b)) ? "" : t;
}

/** 세이브 검증 — 모르는 값은 기본값으로 */
export function validLook(raw) {
  const d = defaultLook();
  if (!raw || typeof raw !== "object") return d;
  return { name: cleanName(raw.name), gender: raw.gender === "f" ? "f" : "m",
    skin: SKINS.some((s) => s.id === raw.skin) ? raw.skin : "base", hairColor: HAIR_COLORS.some((s) => s.id === raw.hairColor) ? raw.hairColor : "base", made: Boolean(raw.made) };
}
