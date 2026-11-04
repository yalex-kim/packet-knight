import { json, currentUser, sessionCookie } from "../../server/cloud.js";
export async function onRequestPost({ request, env }) {
  const u = await currentUser(request, env);
  if (u) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(u.token).run();
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
}
