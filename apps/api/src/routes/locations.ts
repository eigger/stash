import type { FastifyInstance } from "fastify";
import { computeFreshnessRatio, freshnessPercent, locationInputSchema } from "@stash/shared";
import { prisma } from "../lib/prisma.js";
import { collectLocationIds } from "../lib/auditScope.js";

export async function locationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async () => {
    const [locations, items] = await Promise.all([
      prisma.location.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { items: true } } },
      }),
      prisma.item.findMany({
        where: { deletedAt: null, locationId: { not: null } },
        select: { locationId: true, lastAuditedAt: true, createdAt: true, itemType: true },
      }),
    ]);

    const tree = locations.map((l) => ({ id: l.id, parentId: l.parentId }));
    // 방 단위 조망 — 자식 선반·박스 아이템을 부모 비율에 포함한다 (지시서 "어디가 썩는지 한눈에").
    // 아이템은 리프에만 있어도 주방이 empty로 보이지 않게.
    const byExact = new Map<
      string,
      { lastAuditedAt: Date | null; createdAt: Date; itemType: "CONSUMABLE" | "ASSET" }[]
    >();
    for (const item of items) {
      if (!item.locationId) continue;
      const list = byExact.get(item.locationId);
      if (list) list.push(item);
      else byExact.set(item.locationId, [item]);
    }

    return locations.map((loc) => {
      const scopeIds = collectLocationIds(tree, loc.id, true);
      const scoped: { lastAuditedAt: Date | null; createdAt: Date; itemType: "CONSUMABLE" | "ASSET" }[] = [];
      for (const id of scopeIds) {
        const chunk = byExact.get(id);
        if (chunk) scoped.push(...chunk);
      }
      const ratio = computeFreshnessRatio(scoped);
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
