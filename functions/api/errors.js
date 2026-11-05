import { json, currentUser, isAdmin } from "../../server/cloud.js";

// 🐞 실시간 오류 수집 (Stage 13.29) — 브라우저에서 난 오류를 받아 같은 것끼리 묶어 센다. 읽기·지우기는 관리자만.
// 개인정보는 받지 않는다: 주소는 경로만, 브라우저는 요약만, IP·계정은 저장하지 않는다.
const MAX_ROWS = 300;   // 서로 다른 오류가 이보다 많으면 새 종류는 버린다 (도배 막기)
const cut = (v, n) => (typeof v === "string" ? v.slice(0, n) : null);

async function sigOf(...parts) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("|"))));
  return [...bytes.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** POST { errors: [{ message, source, stack, version, ua }] } — 한 번에 5개까지 */
export async function onRequestPost({ request, env }) {
  let data;
  try { data = JSON.parse(await request.text()); } catch { return json({ error: "bad_request" }, 400); }
  const list = Array.isArray(data?.errors) ? data.errors.slice(0, 5) : [];
  const now = Date.now();
  try {
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM client_errors").first();
    for (const e of list) {
      const message = cut(e?.message, 300);
      if (!message) continue;
      const source = cut(e.source, 200), sig = await sigOf(message, source ?? "");
      const hit = await env.DB.prepare("UPDATE client_errors SET count = count + 1, last_at = ?, version = ?, ua = ? WHERE sig = ?")
        .bind(now, cut(e.version, 40), cut(e.ua, 120), sig).run();
      if (hit.meta.changes || n >= MAX_ROWS) continue;
      await env.DB.prepare("INSERT OR IGNORE INTO client_errors (sig, message, source, stack, version, ua, count, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
        .bind(sig, message, source, cut(e.stack, 1200), cut(e.version, 40), cut(e.ua, 120), now, now).run();
    }
  } catch { return json({ error: "unavailable" }, 503); }
  return json({ ok: true });
}

/** GET — 최근 40종 (관리자만) */
export async function onRequestGet({ request, env }) {
  const u = await currentUser(request, env);
  if (!isAdmin(u, env)) return json({ error: "forbidden" }, 403);
  try {
    const { results } = await env.DB.prepare("SELECT sig, message, source, stack, version, ua, count, first_at AS first, last_at AS last FROM client_errors ORDER BY last_at DESC LIMIT 40").all();
    return json({ items: results });
  } catch { return json({ items: [], note: "table_missing" }); }
}

/** DELETE — 모두 지우기 (관리자만, 고친 뒤 새로 모을 때) */
export async function onRequestDelete({ request, env }) {
  const u = await currentUser(request, env);
  if (!isAdmin(u, env)) return json({ error: "forbidden" }, 403);
  await env.DB.prepare("DELETE FROM client_errors").run();
  return json({ ok: true });
}
