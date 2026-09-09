import { existsSync } from "fs";

// CI sets DATABASE_URL directly as a workflow env var; local runs fall back to
// the repo-root .env (same file the dev server reads via --env-file).
if (!process.env.DATABASE_URL) {
  const envPath = "../../.env";
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}
