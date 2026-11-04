import { json, currentUser } from "../../server/cloud.js";
/** GET — XP 순 상위 30명 (+ 로그인했으면 내 순위). 이름과 숫자만 공개 */
export async function onRequestGet({ request, env }) {
  const { results } = await env.DB.prepare(
    "SELECT u.name, s.xp, s.max_floor AS maxFloor, s.badges FROM saves s JOIN users u ON u.id = s.user_id ORDER BY s.xp DESC, s.max_floor DESC, s.updated_at ASC LIMIT 30"
  ).all();
  const u = await currentUser(request, env);
  let me = null;
  if (u) {
    const mine = await env.DB.prepare("SELECT xp, max_floor AS maxFloor, badges FROM saves WHERE user_id = ?").bind(u.id).first();
    if (mine) {
      const ahead = await env.DB.prepare("SELECT COUNT(*) AS n FROM saves WHERE xp > ? OR (xp = ? AND max_floor > ?)").bind(mine.xp, mine.xp, mine.maxFloor).first();
      me = { name: u.name, rank: ahead.n + 1, ...mine };
    }
  }
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM saves").first();
  return json({ top: results, me, total: total.n });
}
