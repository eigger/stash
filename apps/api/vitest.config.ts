import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tsc의 빌드 산출물이 dist/에 같은 *.test.js로 떨어진다 — 명시적으로 빼지 않으면
    // 로컬에서 build 뒤에 test를 돌릴 때 vitest가 양쪽을 집어 모든 테스트가 조용히
    // 두 번 돈다.
    //
    // *.integration.test.ts도 여기서 뺀다: 그 테스트들은 백업 복원 라우트를 부르고,
    // 그 라우트는 DATABASE_URL이 가리키는 DB의 모든 테이블을 지운다. 이 설정은 다른
    // 테스트 파일과 DB를 나눠 쓰므로(로컬과 CI의 `test` 잡) 절대 같이 돌면 안 된다 —
    // vitest.integration.config.ts가 전용 DB에서 따로 집는다. 이유는 그 파일에 있다.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
  },
});
