import type { FastifyInstance } from "fastify";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@stash/shared";
import { prisma } from "../lib/prisma.js";
import { generateAndSaveVapidKeys, getVapidPublicKey, isPushConfigured, sendPushToUser } from "../lib/push.js";

export async function pushRoutes(app: FastifyInstance) {
  app.get("/config", async () => ({
    configured: await isPushConfigured(),
    publicKey: await getVapidPublicKey(),
  }));

  // 관리자가 설정 화면에서 버튼 한 번으로 VAPID 키 쌍을 발급·저장한다 (.env 편집·재시작 불필요).
  app.post("/vapid/generate", { preHandler: [app.authenticate, app.requireAdmin] }, async () => {
    return generateAndSaveVapidKeys();
  });

  app.get("/status", { preHandler: [app.authenticate] }, async (request) => {
    const count = await prisma.pushSubscription.count({ where: { userId: request.user.sub } });
    return { configured: await isPushConfigured(), subscribed: count > 0, subscriptionCount: count };
  });

  app.post("/subscribe", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!(await isPushConfigured())) {
      return reply.code(503).send({ error: "서버에 푸시 알림이 설정되지 않았습니다" });
    }

    const parsed = pushSubscribeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { endpoint, keys, locale } = parsed.data;
    const { sub } = request.user;

    // 같은 브라우저 구독이 다른 사용자 계정에 남아있으면(공용 기기 등) 정리하고 새로 잡는다.
    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    if (existing && existing.userId !== sub) {
      await prisma.pushSubscription.delete({ where: { endpoint } });
    }

    const row = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: sub, p256dh: keys.p256dh, auth: keys.auth, locale },
      create: { userId: sub, endpoint, p256dh: keys.p256dh, auth: keys.auth, locale },
    });

    return reply.code(201).send(row);
  });

  // 배치 잡을 기다리지 않고 본인 구독으로 즉시 테스트 알림을 보내 설정을 바로 확인할 수 있게 한다.
  app.post("/test", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!(await isPushConfigured())) {
      return reply.code(503).send({ error: "서버에 푸시 알림이 설정되지 않았습니다" });
    }
    const count = await prisma.pushSubscription.count({ where: { userId: request.user.sub } });
    if (count === 0) return reply.code(400).send({ error: "구독 정보가 없습니다" });

    await sendPushToUser(request.user.sub, {
      title: "Stash",
      body: "테스트 알림입니다. 정상적으로 도착했다면 푸시 설정이 잘 되어 있는 것입니다.",
      url: "/backup",
    });
    return { status: "sent" };
  });

  app.delete("/subscribe", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = pushUnsubscribeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: parsed.data.endpoint } });
    if (!existing) return reply.code(204).send();
    if (existing.userId !== request.user.sub) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await prisma.pushSubscription.delete({ where: { endpoint: parsed.data.endpoint } });
    return reply.code(204).send();
  });
}
