import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { authRoutes } from "./routes/auth.js";
import { locationRoutes } from "./routes/locations.js";
import { categoryRoutes } from "./routes/categories.js";
import { itemRoutes } from "./routes/items.js";
import { barcodeRoutes, publicBarcodeRoutes } from "./routes/barcodes.js";
import { lookupRoutes } from "./routes/lookup.js";
import { attachmentRoutes, mediaAttachmentRoutes } from "./routes/attachments.js";
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
import { getCachedTokenVersion } from "./lib/tokenVersion.js";
import { isMediaAuthDisabled } from "./lib/mediaAuth.js";
import { prisma } from "./lib/prisma.js";

const INSECURE_JWT_SECRETS = new Set(["", "changeme", "dev-secret-change-me"]);

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? "";
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && INSECURE_JWT_SECRETS.has(secret)) {
    // 공개 저장소 기본값/미설정으로 프로덕션이 뜨면 누구나 ADMIN 토큰을 위조할 수 있다.
    console.error(
      "FATAL: JWT_SECRET must be set to a strong random value in production (not empty, changeme, or dev-secret-change-me). Generate one with: openssl rand -hex 32",
    );
    process.exit(1);
  }

  if (!secret) {
    console.warn("JWT_SECRET이 설정되지 않았습니다. 개발용 폴백을 사용합니다. .env를 확인하세요.");
    return "dev-secret-change-me";
  }

  return secret;
}

const jwtSecret = resolveJwtSecret();

if (isMediaAuthDisabled()) {
  // NODE_ENV만으로 끄면 커스텀 배포에서 P0 첨부 무인증이 경고 없이 부활한다.
  // 교차 오리진 로컬 개발(web:3000 → api:8080)에서만 MEDIA_AUTH_DISABLED=true로 켠다.
  console.warn(
    "WARNING: MEDIA_AUTH_DISABLED=true — attachment file routes are unauthenticated. Do not use this in production.",
  );
}

// token/sig 쿼리가 실수로 다시 들어와도 액세스 로그에 평문으로 남지 않게 마스킹한다.
const app = Fastify({
  logger: {
    serializers: {
      req(request) {
        const rawUrl = request.raw?.url ?? request.url;
        const safeUrl =
          typeof rawUrl === "string"
            ? rawUrl.replace(/([?&](?:token|sig)=)[^&]*/gi, "$1[REDACTED]")
            : rawUrl;
        return {
          method: request.method,
          url: safeUrl,
          hostname: request.hostname,
          remoteAddress: request.ip,
        };
      },
    },
  },
});

// Bearer 토큰 방식이라 CSRF 직접 위험은 낮고, 개발(:3000→:8080)과 웹훅 수신 자동화가
// 오리진 제한에 깨질 수 있어 당분간 origin:true를 유지한다. 프로덕션은 Caddy same-origin.
await app.register(cors, { origin: true });
await app.register(cookie);
await app.register(jwt, { secret: jwtSecret });
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
    // 예전에는 백업/CSV 다운로드용으로 ?token= 폴백이 있었지만, URL·서버 로그·Referer에
    // JWT가 남아 위험하므로 제거했다. 클라이언트는 Authorization 헤더 + blob 다운로드를 쓴다.
    reply.code(401).send({ error: "unauthorized" });
    return;
  }

  // 미디어 쿠키 토큰(purpose:"media")은 첨부 경로 전용이다. 같은 시크릿으로 서명되지만
  // role/tv가 없어 API Bearer로 쓰면 전체 API(+requireAdmin DB role 조회)를 뚫을 수 있다.
  if (request.user.purpose === "media") {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }

  const userId = request.user.sub;
  // tv 없는 구 토큰(90d)은 거부한다 — 배포와 동시에 수명 단축이 효력을 갖게 한다.
  if (typeof request.user.tv !== "number") {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  const tokenTv = request.user.tv;
  const dbTv = await getCachedTokenVersion(userId);
  // 사용자 삭제 또는 비밀번호 변경/로그아웃으로 tokenVersion이 바뀌면 즉시(캐시 TTL 내 최대 지연) 거부.
  if (dbTv === null || dbTv !== tokenTv) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
});

app.decorate("requireAdmin", async (request, reply) => {
  // JWT에 박힌 role은 발급 시점 값이라 강등 후에도 최대 토큰 수명만큼 ADMIN으로 남을 수 있다.
  // 관리자 라우트는 호출 빈도가 낮으므로 매 요청 DB 재조회로 즉시 반영한다.
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { role: true },
  });
  if (!user) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  if (user.role !== "ADMIN") {
    reply.code(403).send({ error: "admin only" });
    return;
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
await app.register(mediaAttachmentRoutes, { prefix: "/api/attachments" });
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
