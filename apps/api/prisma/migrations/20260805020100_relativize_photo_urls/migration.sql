-- photoUrl에 절대 URL(호스트 포함)이 저장된 행을 상대 경로로 바꾼다.
-- 도메인/포트 변경 후에도 사진이 깨지지 않게 하기 위함.
UPDATE "Item"
SET "photoUrl" = regexp_replace("photoUrl", '^https?://[^/]+', '')
WHERE "photoUrl" LIKE 'http%';

UPDATE "Location"
SET "photoUrl" = regexp_replace("photoUrl", '^https?://[^/]+', '')
WHERE "photoUrl" LIKE 'http%';
