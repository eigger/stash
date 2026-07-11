import type { FastifyInstance } from "fastify";
import { settingUpdateSchema } from "@stash/shared";
import { prisma } from "../lib/prisma.js";

// 관리자 UI에서 입력하는 외부 연동 키. 값은 절대 반환하지 않고 설정 여부(hasValue)만 알려준다.
const MANAGED_KEYS = ["UPCITEMDB_API_KEY", "INVENTORY_WEBHOOK_URL"];

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireAdmin);

  app.get("/", async () => {
    const rows = await prisma.setting.findMany({ where: { key: { in: MANAGED_KEYS } } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return MANAGED_KEYS.map((key) => ({ key, hasValue: byKey.has(key) }));
  });

  app.put("/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    if (!MANAGED_KEYS.includes(key)) return reply.code(400).send({ error: "unknown setting key" });

    const parsed = settingUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await prisma.setting.upsert({
      where: { key },
      create: { key, value: parsed.data.value },
      update: { value: parsed.data.value },
    });
    return { key, hasValue: true };
  });

  app.delete("/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    await prisma.setting.deleteMany({ where: { key } });
    return reply.code(204).send();
  });
}
