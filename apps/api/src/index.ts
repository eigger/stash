import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { authRoutes } from "./routes/auth.js";
import { locationRoutes } from "./routes/locations.js";
import { categoryRoutes } from "./routes/categories.js";
import { itemRoutes } from "./routes/items.js";
import { barcodeRoutes, publicBarcodeRoutes } from "./routes/barcodes.js";
import { lookupRoutes } from "./routes/lookup.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { settingsRoutes } from "./routes/settings.js";
import { backupRoutes } from "./routes/backup.js";
import { labelRoutes } from "./routes/labels.js";
import { movementRoutes } from "./routes/movements.js";
import { maintenanceRoutes } from "./routes/maintenance.js";
import { pushRoutes } from "./routes/push.js";
import { startExpiryNotificationJob } from "./jobs/expiryNotifications.js";
import { startTrashPurgeJob } from "./jobs/trashPurge.js";
import { startLowStockSummaryJob } from "./jobs/lowStockSummary.js";
import { localeFromRequest } from "./lib/i18n.js";

const app = Fastify({ logger: true });

if (!process.env.JWT_SECRET) {
  app.log.warn("JWT_SECRET이 설정되지 않았습니다. .env를 확인하세요.");
}

await app.register(cors, { origin: true });
await app.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret-change-me" });
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB
// 기본은 전역 미적용 — 무차별 대입 방어가 필요한 로그인 라우트에서만 개별적으로 설정한다.
await app.register(rateLimit, { global: false });

// 프론트가 보내는 X-Locale 헤더(사용자가 앱에서 고른 언어)로 에러 메시지 언어를 정한다.
app.decorateRequest("locale", "ko");
app.addHook("onRequest", async (request) => {
  request.locale = localeFromRequest(request);
});

app.decorate("authenticate", async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    // 백업 내보내기처럼 브라우저 직접 다운로드(window.location.href)로 여는 GET 요청은
    // Authorization 헤더를 못 실어 보내므로, 쿼리스트링의 token으로도 인증을 허용한다.
    const query = request.query as Record<string, unknown>;
    const token = typeof query?.token === "string" ? query.token : undefined;
    if (token) {
      try {
        const decoded = app.jwt.verify<{ sub: string; role: "ADMIN" | "GENERAL" }>(token);
        request.user = decoded;
        return;
      } catch {
        // fall through to 401
      }
    }
    reply.code(401).send({ error: "unauthorized" });
  }
});

app.decorate("requireAdmin", async (request, reply) => {
  if (request.user.role !== "ADMIN") {
    reply.code(403).send({ error: "admin only" });
  }
});

app.get("/health", async () => ({ status: "ok" }));

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(locationRoutes, { prefix: "/api/locations" });
await app.register(categoryRoutes, { prefix: "/api/categories" });
await app.register(itemRoutes, { prefix: "/api/items" });
await app.register(barcodeRoutes, { prefix: "/api" });
await app.register(publicBarcodeRoutes, { prefix: "/api/barcodes" });
await app.register(lookupRoutes, { prefix: "/api/lookup" });
await app.register(attachmentRoutes, { prefix: "/api/attachments" });
await app.register(settingsRoutes, { prefix: "/api/settings" });
await app.register(backupRoutes, { prefix: "/api/backup" });
await app.register(labelRoutes, { prefix: "/api/labels" });
await app.register(movementRoutes, { prefix: "/api/movements" });
await app.register(maintenanceRoutes, { prefix: "/api" });
await app.register(pushRoutes, { prefix: "/api/push" });

startExpiryNotificationJob();
startTrashPurgeJob();
startLowStockSummaryJob();

const port = Number(process.env.PORT ?? 8080);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
