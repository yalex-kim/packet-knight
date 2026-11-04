// 클라우드 세이브 API 공통 (Stage 13) — Cloudflare Pages Functions + D1 (env.DB), 구글 ID 토큰 검증
// 이메일은 받지도 저장하지도 않는다. 구글 계정 sub(고유 번호)와 이름 앞부분만 쓴다.

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

const COOKIE = "pk_sess";
const SESSION_DAYS = 180;

export function sessionCookie(token, maxAge = SESSION_DAYS * 86400) {
  return `${COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/** 쿠키의 세션 → { id, name } 또는 null */
export async function currentUser(request, env) {
  const m = (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)pk_sess=([0-9a-f]{64})/);
  if (!m) return null;
  const row = await env.DB.prepare(
    "SELECT u.id, u.name, u.picture FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?"
  ).bind(m[1], Date.now()).first();
  return row ? { id: row.id, name: row.name, picture: row.picture ?? null, token: m[1] } : null;
}

export async function newSession(env, userId) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").bind(token, userId, now + SESSION_DAYS * 86400e3)
  ]);
  return token;
}

// ---- 구글 ID 토큰(JWT, RS256) 검증 ----
let jwks = null, jwksAt = 0;
async function googleKeys() {
  if (jwks && Date.now() - jwksAt < 3600e3) return jwks;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!r.ok) throw new Error("jwks");
  jwks = (await r.json()).keys; jwksAt = Date.now();
  return jwks;
}
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

/** @returns {Promise<{ sub: string, name: string } | null>} */
export async function verifyGoogle(credential, clientId) {
  if (typeof credential !== "string" || !clientId) return null;
  const parts = credential.split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64u(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  } catch { return null; }
  if (header.alg !== "RS256") return null;
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) return null;
  if (payload.aud !== clientId || !(payload.exp > now) || typeof payload.sub !== "string") return null;
  return { sub: payload.sub, name: displayName(payload), picture: profilePicture(payload.picture) };
}

/** 구글 프로필 사진 주소 — googleusercontent.com 의 https 주소만 (그 밖은 null) */
export function profilePicture(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" && /(^|\.)googleusercontent\.com$/.test(u.hostname) ? u.href : null;
  } catch { return null; }
}

/** 랭킹에 보일 이름 — 구글 이름(given_name)만, 최대 12자 */
export function displayName(p) {
  const raw = String(p.given_name || (p.name || "").split(/\s+/)[0] || "기사").trim();
  return [...raw].slice(0, 12).join("") || "기사";
}

/** 세이브에서 랭킹 숫자만 뽑는다 (모양이 이상하면 0) */
export function rankFields(save) {
  const int = (n, max) => (Number.isInteger(n) && n >= 0 ? Math.min(n, max) : 0);
  return {
    xp: int(save?.xp, 1e8),
    maxFloor: int(save?.dungeon?.maxFloor, 1e4),
    badges: save?.quests?.done && typeof save.quests.done === "object" ? Math.min(Object.keys(save.quests.done).length, 100) : 0
  };
}
