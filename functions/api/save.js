import { json, currentUser, rankFields, weekKey } from "../../server/cloud.js";
const MAX_BYTES = 128 * 1024;
/** PUT { save } — 진행도를 통째로 저장하고 랭킹 숫자를 갱신한다 */
export async function onRequestPut({ request, env }) {
  const u = await currentUser(request, env);
  if (!u) return json({ error: "login_required" }, 401);
  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ error: "too_large" }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: "bad_request" }, 400); }
  const save = body?.save;
  if (!save || typeof save !== "object" || !Number.isInteger(save.v)) return json({ error: "bad_save" }, 400);
  const r = rankFields(save), now = Date.now();
  const prev = await env.DB.prepare("SELECT xp FROM saves WHERE user_id = ?").bind(u.id).first();
  await env.DB.prepare(
    `INSERT INTO saves (user_id, data, xp, max_floor, badges, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, xp = excluded.xp, max_floor = excluded.max_floor, badges = excluded.badges, updated_at = excluded.updated_at`
  ).bind(u.id, JSON.stringify(save), r.xp, r.maxFloor, r.badges, now).run();
  // 🗓️ 주간 시즌 (Stage 13.31): 이번 주 첫 저장이면 직전 XP를 출발점으로 — 표가 아직 없어도 저장은 된다
  try {
    await env.DB.prepare(`INSERT INTO weekly (week, user_id, xp_start, xp_now, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(week, user_id) DO UPDATE SET xp_now = excluded.xp_now, updated_at = excluded.updated_at`)
      .bind(weekKey(now), u.id, Math.min(prev?.xp ?? r.xp, r.xp), r.xp, now).run();
  } catch { /* 마이그레이션 0005 전 */ }
  return json({ ok: true, savedAt: now });
}
