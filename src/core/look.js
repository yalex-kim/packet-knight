// 🪞 나의 기사 — 닉네임·성별 (Stage 13.34) — 순수 로직 (THREE·DOM 없음)
// 세이브: progress.look = { name, gender, made } (없으면 기본값, 버전 그대로). made = 캐릭터 만들기 창을 마쳤는지.
// 서버(functions/api/save.js)도 cleanName 으로 닉네임을 다시 검사해 랭킹 이름으로 쓴다.

export const GENDERS = Object.freeze([{ id: "m", label: "남자 기사" }, { id: "f", label: "여자 기사" }]);
export const NAME_MIN = 2, NAME_MAX = 12;
export const defaultLook = () => ({ name: "", gender: "m", made: false });

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
  return { name: cleanName(raw.name), gender: raw.gender === "f" ? "f" : "m", made: Boolean(raw.made) };
}
