import { json, currentUser, isAdmin } from "../../server/cloud.js";

// 마을 게시판 의견·제안 (Stage 13.15) — 누구나 보낼 수 있고(로그인하면 이름이 붙는다), 읽기는 관리자만.
const CATEGORIES = ["bug", "idea", "praise", "etc"];
const MAX_LEN = 500;
const PER_HOUR = 5;

async function ipHash(request) {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pk-feedback:${ip}`)));
  return [...bytes.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** POST { category, body } — 한 시간에 다섯 번까지 */
export async function onRequestPost({ request, env }) {
  let data;
  try { data = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
  const category = CATEGORIES.includes(data?.category) ? data.category : "etc";
  const body = typeof data?.body === "string" ? data.body.trim() : "";
  if (!body || [...body].length > MAX_LEN) return json({ error: "bad_body" }, 400);
  const hash = await ipHash(request), now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND created_at > ?").bind(hash, now - 3600e3).first();
  if (recent.n >= PER_HOUR) return json({ error: "too_many" }, 429);
  const u = await currentUser(request, env);
  await env.DB.prepare("INSERT INTO feedback (created_at, user_id, name, category, body, ip_hash) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(now, u?.id ?? null, u?.name ?? null, category, body, hash).run();
  return json({ ok: true });
}

/** GET — 최근 50개 (관리자만) */
export async function onRequestGet({ request, env }) {
  const u = await currentUser(request, env);
  if (!isAdmin(u, env)) return json({ error: "forbidden" }, 403);
  const { results } = await env.DB.prepare("SELECT id, created_at AS at, name, category, body FROM feedback ORDER BY created_at DESC LIMIT 50").all();
  return json({ items: results });
}
