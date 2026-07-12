import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { renderLabelSheetPdf } from "../lib/labelSheet.js";
import { t } from "../lib/i18n.js";

const sheetInputSchema = z.object({
  itemIds: z.array(z.string()).min(1),
});

export async function labelRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // 여러 아이템을 골라 한 장의 인쇄용 PDF 시트로 묶어서 내려받는다 (Phase 2).
  app.post("/sheet", async (request, reply) => {
    const parsed = sheetInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const items = await prisma.item.findMany({
      where: { id: { in: parsed.data.itemIds } },
      include: { barcodes: true },
    });

    const entries = items
      .map((item) => {
        const primary = item.barcodes.find((b) => b.isPrimary) ?? item.barcodes[0];
        if (!primary) return null;
        return { name: item.name, value: primary.value, symbology: primary.symbology };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    if (entries.length === 0) {
      return reply.code(400).send({ error: t("noBarcodedItemsSelected", request.locale) });
    }

    const pdf = await renderLabelSheetPdf(entries);
    reply
      .type("application/pdf")
      .header("Content-Disposition", `attachment; filename="stash-labels-${Date.now()}.pdf"`)
      .send(pdf);
  });
}
