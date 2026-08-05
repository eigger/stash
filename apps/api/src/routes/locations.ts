import type { FastifyInstance } from "fastify";
import { computeFreshnessRatio, freshnessPercent, locationInputSchema } from "@stash/shared";
import { prisma } from "../lib/prisma.js";

export async function locationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async () => {
    const [locations, items] = await Promise.all([
      prisma.location.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { items: true } } },
      }),
      // 위치별 신선도 — 직접 소속 아이템만 (트리 부모는 자식 행이 따로 보여 줌).
      prisma.item.findMany({
        where: { deletedAt: null, locationId: { not: null } },
        select: { locationId: true, lastAuditedAt: true, itemType: true },
      }),
    ]);

    const byLocation = new Map<string, { lastAuditedAt: Date | null; itemType: "CONSUMABLE" | "ASSET" }[]>();
    for (const item of items) {
      if (!item.locationId) continue;
      const list = byLocation.get(item.locationId);
      if (list) list.push(item);
      else byLocation.set(item.locationId, [item]);
    }

    return locations.map((loc) => {
      const ratio = computeFreshnessRatio(byLocation.get(loc.id) ?? []);
      return {
        ...loc,
        freshness: {
          freshCount: ratio.freshCount,
          totalCount: ratio.totalCount,
          ratio: ratio.ratio,
          percent: freshnessPercent(ratio.ratio),
        },
      };
    });
  });

  app.post("/", async (request, reply) => {
    const parsed = locationInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const location = await prisma.location.create({ data: parsed.data });
    return reply.code(201).send(location);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = locationInputSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const location = await prisma.location.update({ where: { id }, data: parsed.data });
    return location;
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.location.delete({ where: { id } });
    return reply.code(204).send();
  });
}
