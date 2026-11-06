import { json, currentUser, weekKey, weekEnd, lastWeekKey } from "../../server/cloud.js";

// 랭킹 판 (Stage 13.8): level = XP 순(최고 층으로 동점 가름), job = 비콘 찾기 알바 최고 점수 순
// 🗓️ week (Stage 13.31) = 이번 주(KST 월요일 0시~) 오른 XP 순. 모든 판에 지난주 1~3위(👑 champ) 표시
const BOARDS = {
  level: { from: "saves s", key: "s.xp", tie: "s.max_floor", where: "1 = 1" },
  job: { from: "saves s", key: "json_extract(s.data, '$.job.bestScore')", tie: "json_extract(s.data, '$.job.runs')", where: "json_extract(s.data, '$.job.bestScore') IS NOT NULL" },
  week: { from: "weekly w JOIN saves s ON s.user_id = w.user_id", key: "(w.xp_now - w.xp_start)", tie: "s.xp", where: "w.week = ?1 AND w.xp_now > w.xp_start" }
};
const COLS = (b) => `s.user_id AS uid, u.name, s.xp, s.max_floor AS maxFloor, s.badges,
  json_extract(s.data, '$.shop.outfit') AS outfit, json_extract(s.data, '$.shop.weapon') AS weapon, json_extract(s.data, '$.look.gender') AS gender,
  json_extract(s.data, '$.job.bestScore') AS jobBest, json_extract(s.data, '$.job.runs') AS jobRuns, ${b.key} AS k, ${b.tie} AS t`;

/** 지난주 1~3위 { uid → 순위 } + 이름 (표가 없으면 빈 값) */
async function champions(env, now) {
  try {
    const { results } = await env.DB.prepare(`SELECT w.user_id AS uid, u.name, (w.xp_now - w.xp_start) AS gain FROM weekly w JOIN users u ON u.id = w.user_id
      WHERE w.week = ? AND w.xp_now > w.xp_start ORDER BY gain DESC, w.updated_at ASC LIMIT 3`).bind(lastWeekKey(now)).all();
    return results;
  } catch { return []; }
}

/** GET ?board=level|job|week — 상위 30명 (+ 로그인했으면 내 순위). 이름·숫자·입은 옷과 든 무기만 공개 (계정 번호는 내보내지 않는다) */
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams.get("board");
  const name = q === "job" || q === "week" ? q : "level";
  const b = BOARDS[name], now = Date.now(), wk = weekKey(now);
  const bind = (stmt, ...rest) => (name === "week" ? stmt.bind(wk, ...rest) : rest.length ? stmt.bind(...rest) : stmt);
  // ?1 은 주 이름 — 다른 자리표시는 ?2부터
  const champs = await champions(env, now);
  const champOf = (uid) => { const i = champs.findIndex((c) => c.uid === uid); return i < 0 ? null : i + 1; };
  const strip = ({ k, t, uid, ...r }) => ({ ...r, ...(name === "week" ? { gain: k } : {}), champ: champOf(uid) });
  let results = [], me = null, total = 0;
  try {
    ({ results } = await bind(env.DB.prepare(
      `SELECT ${COLS(b)} FROM ${b.from} JOIN users u ON u.id = s.user_id WHERE ${b.where} ORDER BY k DESC, t DESC, s.updated_at ASC LIMIT 30`)).all());
    const u = await currentUser(request, env);
    if (u) {
      const mine = await bind(env.DB.prepare(`SELECT ${COLS(b)} FROM ${b.from} JOIN users u ON u.id = s.user_id WHERE s.user_id = ?${name === "week" ? 2 : 1} AND ${b.where}`), u.id).first();
      if (mine) {
        const ahead = await bind(env.DB.prepare(`SELECT COUNT(*) AS n FROM ${b.from} WHERE ${b.where} AND (${b.key} > ?${name === "week" ? 2 : 1} OR (${b.key} = ?${name === "week" ? 2 : 1} AND ${b.tie} > ?${name === "week" ? 3 : 2}))`),
          mine.k, mine.t ?? 0).first();
        me = { ...mine, rank: ahead.n + 1 };
      }
    }
    total = (await bind(env.DB.prepare(`SELECT COUNT(*) AS n FROM ${b.from} WHERE ${b.where}`)).first()).n;
  } catch (e) {
    if (name !== "week") throw e;   // 주간 표가 아직 없으면 빈 판
  }
  return json({
    board: name, top: results.map(strip), me: me && { ...strip(me), rank: me.rank }, total,
    season: { week: wk, endsAt: weekEnd(now), champions: champs.map((c, i) => ({ rank: i + 1, name: c.name, gain: c.gain })) }
  });
}
