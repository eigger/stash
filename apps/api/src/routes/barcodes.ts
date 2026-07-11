import type { FastifyInstance } from "fastify";
import { barcodeInputSchema } from "@stash/shared";
import { prisma } from "../lib/prisma.js";
import { buildItemDeepLink, renderLabelPng } from "../lib/qrLabel.js";
import { isUniqueConstraintError } from "../lib/prismaErrors.js";

// 라벨 이미지는 사용자 승인을 받아 의도적으로 인증 없이 공개한다 — 재고 이벤트 웹훅
// 페이로드의 labelImageUrl을 외부 자동화가 토큰 없이 바로 fetch해서 출력할 수 있어야 하기
// 때문 (docs/ROADMAP.md 참고). 바코드 id가 추측 불가능한 cuid라 URL을 아는 사람만 접근 가능.
export async function publicBarcodeRoutes(app: FastifyInstance) {
  app.get("/:id/label.png", async (request, reply) => {
    const { id } = request.params as { id: string };
    const barcode = await prisma.barcode.findUnique({ where: { id } });
    if (!barcode) return reply.code(404).send({ error: "barcode not found" });

    const png = await renderLabelPng(barcode.value, barcode.symbology);
    reply.type("image/png");
    return png;
  });
}

export async function barcodeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // 기존 바코드(제조사 UPC/EAN) 또는 Matter 페어링 코드를 아이템에 수동으로 추가한다.
  app.post("/items/:itemId/barcodes", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const parsed = barcodeInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) return reply.code(404).send({ error: "item not found" });

    try {
      const barcode = await prisma.barcode.create({ data: { itemId, ...parsed.data } });
      return reply.code(201).send(barcode);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return reply.code(409).send({ error: "이미 다른 아이템에 등록된 바코드 값입니다" });
      }
      throw err;
    }
  });

  // 바코드가 없는 물건용 — 아이템 상세페이지로 바로 열리는 내부 QR을 발급한다.
  app.post("/items/:itemId/barcodes/generate", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const item = await prisma.item.findUnique({ where: { id: itemId }, include: { barcodes: true } });
    if (!item) return reply.code(404).send({ error: "item not found" });

    const value = buildItemDeepLink(itemId);
    const barcode = await prisma.barcode.create({
      data: {
        itemId,
        value,
        symbology: "QR",
        source: "GENERATED",
        isPrimary: item.barcodes.length === 0,
      },
    });
    return reply.code(201).send(barcode);
  });

  app.delete("/barcodes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.barcode.delete({ where: { id } });
    return reply.code(204).send();
  });
}
