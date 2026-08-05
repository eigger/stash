-- AlterTable
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- 기존 90일 JWT(tv 클레임 없음)를 배포와 동시에 무효화한다.
-- authenticate는 tv가 number가 아니면 거부하고, 로그인 시 새 tokenVersion을 심는다.
UPDATE "User" SET "tokenVersion" = 1;
