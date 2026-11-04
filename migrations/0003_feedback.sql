-- Stage 13.15: 마을 게시판 — 의견·제안 (관리자만 읽는다)
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  user_id TEXT,                  -- 로그인했으면 구글 sub (아니면 NULL)
  name TEXT,                     -- 로그인했으면 랭킹 이름
  category TEXT NOT NULL,        -- bug | idea | praise | etc
  body TEXT NOT NULL,            -- 최대 500자
  ip_hash TEXT NOT NULL          -- 도배 막기용 (IP 원문은 저장하지 않는다)
);
CREATE INDEX IF NOT EXISTS feedback_time ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_ip ON feedback (ip_hash, created_at);
