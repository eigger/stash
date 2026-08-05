import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// monorepo: apps/api/.env 또는 루트 .env
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, ".env"), quiet: true });
loadEnv({ path: resolve(here, "../../.env"), quiet: true });

// generate는 DB에 붙지 않으므로 CI/로컬에 .env가 없어도 더미 URL로 통과시킨다.
// migrate/deploy/runtime은 실제 DATABASE_URL이 필요하다.
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://stash:stash@localhost:5433/stash";

// Prisma 7: datasource URL은 schema.prisma가 아니라 여기로 옮긴다.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file=../../.env prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
