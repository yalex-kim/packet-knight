import { json, currentUser } from "../../server/cloud.js";
/** GET — 로그인 상태 + 클라우드 세이브 */
export async function onRequestGet({ request, env }) {
  const u = await currentUser(request, env);
  if (!u) return json({ user: null }, 200);
  const save = await env.DB.prepare("SELECT data, updated_at FROM saves WHERE user_id = ?").bind(u.id).first();
  return json({ user: { name: u.name, picture: u.picture }, save: save ? JSON.parse(save.data) : null, savedAt: save?.updated_at ?? null });
}
