import type { FastifyInstance } from "fastify";
import { sumQualityXp, type QualityXpItem } from "@stash/shared";
import { prisma } from "../lib/prisma.js";
import { getConfirmXp } from "../lib/householdXp.js";

export async function xpRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async () => {
    const [confirm, rows] = await Promise.all([
      getConfirmXp(),
      prisma.item.findMany({
        where: { deletedAt: null },
        select: {
          itemType: true,
          locationId: true,
          categoryId: true,
          photoUrl: true,
          price: true,
          minQuantity: true,
          expiryDate: true,
          warrantyExpiresAt: true,
          barcodes: { select: { source: true } },
        },
      }),
    ]);
    const quality = sumQualityXp(rows as QualityXpItem[]);
    return {
      quality,
      confirm,
      total: quality + confirm,
    };
  });
}
