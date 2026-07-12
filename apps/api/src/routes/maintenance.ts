import type { FastifyInstance } from "fastify";
import { maintenanceRecordInputSchema } from "@stash/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";

// 자산(ASSET) 아이템의 정비/점검 이력 CRUD — barcodes.ts와 같은 "중첩 생성 + 평평한 삭제" 패턴.
export async function maintenanceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.post("/items/:itemId/maintenance", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const parsed = maintenanceRecordInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) return reply.code(404).send({ error: t("itemNotFound", request.locale) });

    const { date, description, cost, currency } = parsed.data;
    const record = await prisma.maintenanceRecord.create({
      data: { itemId, date: new Date(date), description, cost, currency },
    });
    return reply.code(201).send(record);
  });

  app.delete("/maintenance/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.maintenanceRecord.delete({ where: { id } });
    return reply.code(204).send();
  });
}
