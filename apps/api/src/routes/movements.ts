import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function movementRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // 재고 이력 화면용 — 전체 아이템을 가로질러 수량 변경 이력을 조회한다.
  app.get("/", async (request) => {
    const { itemId, reason, limit } = request.query as {
      itemId?: string;
      reason?: string;
      limit?: string;
    };

    const where: Record<string, unknown> = {};
    if (itemId) where.itemId = itemId;
    if (reason) where.reason = reason;

    const take = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);

    return prisma.stockMovement.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take,
      include: {
        item: { select: { id: true, name: true, photoUrl: true, unit: true } },
        user: { select: { id: true, name: true } },
      },
    });
  });
}
