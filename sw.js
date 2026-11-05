// Packet Knight 서비스 워커 (Stage 13.28) — 두 번째 방문부터 빠르게, 연결이 끊겨도 마을에 들어갈 수 있게
// 배포 때 tools/build_site.sh 가 VERSION 에 커밋 sha 를 찍는다 → 새 배포면 새 캐시, 옛 캐시는 지운다.
// · /v/<sha>/…, src/assets/…, three CDN: 캐시 먼저 (주소가 버전마다 바뀌거나 -v1 이름이라 안전)
// · 페이지(index.html): 네트워크 먼저, 안 되면 캐시 — 배포 직후에도 새 버전을 받는다
// · /api/…(로그인·랭킹·클라우드 세이브·게시판): 손대지 않는다
const VERSION = "dev";
const CACHE = `pk-${VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest"])).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("pk-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const cacheFirst = async (req) => {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && (res.type === "basic" || res.type === "cors")) c.put(req, res.clone());
  return res;
};
const networkFirst = async (req) => {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) c.put("/", res.clone());
    return res;
  } catch {
    return (await c.match("/")) ?? Response.error();
  }
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate" && url.origin === location.origin && url.pathname === "/") return e.respondWith(networkFirst(req));
  if (req.headers.has("range")) return;   // 배경음악 부분 요청은 브라우저에 맡긴다
  const mine = url.origin === location.origin && (url.pathname.startsWith("/v/") || url.pathname.startsWith("/src/assets/"));
  const three = url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith("/npm/three@");
  if (mine || three) e.respondWith(cacheFirst(req));
});
