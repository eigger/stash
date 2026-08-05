import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// monorepo: apps/api/.env 또는 루트 .env
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, ".env"), quiet: true });
loadEnv({ path: resolve(here, "../../.env"), quiet: true });

// generate만 DB에 붙지 않으므로 CI에서 DATABASE_URL 없이 더미로 통과시킨다.
// migrate deploy / db push 등이 같은 폴백을 타면 localhost로 조용히 실패하므로 막는다.
const argv = process.argv.join(" ");
const isGenerateOnly = /\bgenerate\b/.test(argv) && !/\b(migrate|db|studio|validate)\b/.test(argv);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  if (!isGenerateOnly) {
    throw new Error(
      "DATABASE_URL is required for this Prisma command (dummy fallback is only allowed for `prisma generate`)",
    );
  }
}

// Prisma 7: datasource URL은 schema.prisma가 아니라 여기로 옮긴다.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file=../../.env prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl ?? "postgresql://stash:stash@localhost:5433/stash",
  },
});
