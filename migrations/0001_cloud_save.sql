-- Stage 13: 구글 로그인 · 클라우드 세이브 · 랭킹 (Cloudflare D1)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,            -- 구글 계정 sub (이메일은 저장하지 않는다)
  name TEXT NOT NULL,             -- 랭킹에 보일 이름 (구글 이름의 앞부분)
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saves (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  data TEXT NOT NULL,             -- 진행도 JSON (localStorage packetKnight.save 와 같은 모양)
  xp INTEGER NOT NULL DEFAULT 0,
  max_floor INTEGER NOT NULL DEFAULT 0,
  badges INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS saves_rank ON saves (xp DESC, max_floor DESC);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
