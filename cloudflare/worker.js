// 정적 사이트 Worker — 원본: yalex-kim/edge cloudflare/worker.js (connbook·packet-knight 에 같은 사본)
//
// 정적 파일과 주소가 정확히 맞으면 Cloudflare 가 파일을 바로 주고 이 코드는 돌지 않는다
// (assets.html_handling = "none": /a.html 을 /a 로 넘기지 않는다 — canonical·sitemap 이 .html 이라).
// 파일이 없는 주소만 여기로 온다. 예전 nginx 의 index · try_files $uri $uri/ 와 같게 맞춘다.
//   /dir/                → /dir/index.html
//   /dir                 → 301 /dir/   (dir/index.html 이 있을 때)
//   /v/<sha>/src/…       → /src/…      (packet-knight: 지난 배포의 sha 로 온 요청. 이번 sha 는 파일로 있다)
//   그 밖                → 404
const NOT_FOUND = () =>
  new Response("404 Not Found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;

    const v = p.match(/^\/v\/[0-9a-f]{7,40}\/(src\/.+)$/);
    if (v) {
      const r = await env.ASSETS.fetch(new URL("/" + v[1], url), req);
      return r.status === 404 ? NOT_FOUND() : r;
    }
    if (p.endsWith("/")) {
      const r = await env.ASSETS.fetch(new URL(p + "index.html", url), req);
      return r.status === 404 ? NOT_FOUND() : r;
    }
    if (!p.split("/").pop().includes(".")) {
      const r = await env.ASSETS.fetch(new URL(p + "/index.html", url), { method: "HEAD" });
      if (r.ok) return Response.redirect(new URL(p + "/" + url.search, url), 301);
    }
    return NOT_FOUND();
  },
};
