-- Stage 13.29: 플레이어 브라우저에서 난 오류 모으기 — 같은 오류(sig)는 한 줄로 묶어 횟수만 센다 (관리자만 읽는다)
CREATE TABLE IF NOT EXISTS client_errors (
  sig TEXT PRIMARY KEY,          -- 메시지·파일·줄의 해시 (같은 오류 묶기)
  message TEXT NOT NULL,         -- 최대 300자
  source TEXT,                   -- 파일:줄:칸 (주소의 경로만)
  stack TEXT,                    -- 최대 1200자
  version TEXT,                  -- 배포 sha
  ua TEXT,                       -- 브라우저 요약 (최대 120자)
  count INTEGER NOT NULL DEFAULT 1,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS client_errors_last ON client_errors (last_at DESC);
