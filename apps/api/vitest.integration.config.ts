import { defineConfig } from "vitest/config";

// 백업 복원(POST /api/backup/restore)을 실제로 호출하는 테스트 전용 설정. 그 라우트는
// 성공하면 DATABASE_URL이 가리키는 DB의 모든 테이블을 지우고 백업 내용으로 다시 채운다 —
// 기본 `vitest run`이 쓰는 DB에서 다른 테스트와 나란히 돌리면 서로의 데이터를 지워버린다.
// 그래서 *.integration.test.ts만 이 설정으로 따로 실행하고, CI에서는 이 목적만을 위한
// 별도 Postgres 컨테이너를 붙인다(.github/workflows/ci.yml의 backup-restore 잡 참고).
export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // 테이블을 통째로 지우는 라우트라 파일 간 병렬 실행이 위험하다 — 이 설정으로
    // 묶이는 통합 테스트가 늘어도 항상 순차 실행되게 강제한다.
    fileParallelism: false,
  },
});
