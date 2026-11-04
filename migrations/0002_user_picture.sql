-- Stage 13.3: 계정 버튼에 구글 프로필 사진 (본인에게만 보인다 — 랭킹에는 내보내지 않는다)
ALTER TABLE users ADD COLUMN picture TEXT;
