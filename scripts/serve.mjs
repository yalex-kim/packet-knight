#!/usr/bin/env node
// 무의존 정적 서버 — ES 모듈은 file:// 에서 로드되지 않으므로 로컬 실행 시 사용한다.
//   npm start            → http://localhost:5173
//   PORT=8080 npm start

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 5173;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/markdown; charset=utf-8"
};

createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || rel.split("/").some((seg) => seg.startsWith("."))) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`🛡️ Packet Knight → http://localhost:${PORT}`));
