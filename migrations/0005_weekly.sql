-- Stage 13.31: 주간 랭킹 시즌 — 주(한국 시간 월요일 0시 시작)마다 처음 저장한 XP와 지금 XP. 이번 주 순위 = 오른 XP
CREATE TABLE IF NOT EXISTS weekly (
  week TEXT NOT NULL,             -- 그 주 월요일 날짜 (KST) YYYY-MM-DD
  user_id TEXT NOT NULL REFERENCES users(id),
  xp_start INTEGER NOT NULL,      -- 이번 주 첫 저장 직전의 XP
  xp_now INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (week, user_id)
);
CREATE INDEX IF NOT EXISTS weekly_gain ON weekly (week, xp_now);
