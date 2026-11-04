import { json, currentUser } from "../../server/cloud.js";

// 랭킹 판 (Stage 13.8): level = XP 순(최고 층으로 동점 가름), job = 비콘 찾기 알바 최고 점수 순
const BOARDS = {
  level: { key: "s.xp", tie: "s.max_floor", where: "1 = 1" },
  job: { key: "json_extract(s.data, '$.job.bestScore')", tie: "json_extract(s.data, '$.job.runs')", where: "json_extract(s.data, '$.job.bestScore') IS NOT NULL" }
};
const COLS = (b) => `u.name, s.xp, s.max_floor AS maxFloor, s.badges,
  json_extract(s.data, '$.shop.outfit') AS outfit, json_extract(s.data, '$.shop.weapon') AS weapon,
  json_extract(s.data, '$.job.bestScore') AS jobBest, json_extract(s.data, '$.job.runs') AS jobRuns, ${b.key} AS k, ${b.tie} AS t`;

/** GET ?board=level|job — 상위 30명 (+ 로그인했으면 내 순위). 이름·숫자·입은 옷과 든 무기만 공개 */
export async function onRequestGet({ request, env }) {
  const name = new URL(request.url).searchParams.get("board") === "job" ? "job" : "level";
  const b = BOARDS[name];
  const { results } = await env.DB.prepare(
    `SELECT ${COLS(b)} FROM saves s JOIN users u ON u.id = s.user_id WHERE ${b.where} ORDER BY k DESC, t DESC, s.updated_at ASC LIMIT 30`
  ).all();
  const u = await currentUser(request, env);
  let me = null;
  if (u) {
    const mine = await env.DB.prepare(`SELECT ${COLS(b)} FROM saves s JOIN users u ON u.id = s.user_id WHERE s.user_id = ? AND ${b.where}`).bind(u.id).first();
    if (mine) {
      const ahead = await env.DB.prepare(`SELECT COUNT(*) AS n FROM saves s WHERE ${b.where} AND (${b.key} > ? OR (${b.key} = ? AND ${b.tie} > ?))`)
        .bind(mine.k, mine.k, mine.t ?? 0).first();
      me = { ...mine, rank: ahead.n + 1 };
    }
  }
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM saves s WHERE ${b.where}`).first();
  const strip = ({ k, t, ...r }) => r;
  return json({ board: name, top: results.map(strip), me: me && strip(me), total: total.n });
}
