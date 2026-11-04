import { json, verifyGoogle, newSession, sessionCookie } from "../../server/cloud.js";
/** POST { credential } — 구글 ID 토큰을 검증하고 세션 쿠키를 준다. 클라우드 세이브도 함께 돌려준다 */
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
  const g = await verifyGoogle(body?.credential, env.GOOGLE_CLIENT_ID);
  if (!g) return json({ error: "invalid_token" }, 401);
  await env.DB.prepare("INSERT INTO users (id, name, picture, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, picture = excluded.picture")
    .bind(g.sub, g.name, g.picture, Date.now()).run();
  const token = await newSession(env, g.sub);
  const save = await env.DB.prepare("SELECT data, updated_at FROM saves WHERE user_id = ?").bind(g.sub).first();
  return json({ user: { name: g.name, picture: g.picture }, save: save ? JSON.parse(save.data) : null, savedAt: save?.updated_at ?? null }, 200, { "set-cookie": sessionCookie(token) });
}
