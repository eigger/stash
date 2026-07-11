import type { FastifyInstance } from "fastify";
import { itemInputSchema, itemUpdateSchema, quantityAdjustSchema, scanInputSchema } from "@stash/shared";
import { prisma } from "../lib/prisma.js";
import { resolveProduct } from "../lib/barcodeLookup/index.js";
import { fireInventoryWebhook, isInventoryWebhookConfigured } from "../lib/webhook.js";
import { guessSymbology } from "../lib/barcodeSymbology.js";
import { isUniqueConstraintError } from "../lib/prismaErrors.js";
import { deleteUploadedFile } from "../lib/uploads.js";

const ITEM_INCLUDE = {
  barcodes: true,
  location: true,
  category: true,
} as const;

export async function itemRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request) => {
    const { q, locationId, categoryId, lowStock, expiringSoon } = request.query as {
      q?: string;
      locationId?: string;
      categoryId?: string;
      lowStock?: string;
      expiringSoon?: string;
    };

    const where: Record<string, unknown> = {};
    if (q) where.name = { contains: q, mode: "insensitive" };
    if (locationId) where.locationId = locationId;
    if (categoryId) where.categoryId = categoryId;
    if (lowStock === "true") {
      // minQuantity가 설정된 아이템 중 현재 수량이 그 이하인 것만.
      where.AND = [{ minQuantity: { not: null } }];
    }
    if (expiringSoon === "true") {
      const soon = new Date();
      soon.setDate(soon.getDate() + 14);
      where.expiryDate = { not: null, lte: soon };
    }

    let items = await prisma.item.findMany({
      where,
      include: ITEM_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    if (lowStock === "true") {
      items = items.filter((i) => i.minQuantity != null && i.quantity <= i.minQuantity);
    }

    return items;
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        ...ITEM_INCLUDE,
        attachments: true,
        movements: { orderBy: { occurredAt: "desc" }, take: 20 },
      },
    });
    if (!item) return reply.code(404).send({ error: "item not found" });
    return item;
  });

  app.post("/", async (request, reply) => {
    const parsed = itemInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    // 새 아이템에 바로 붙일 기존 바코드 값이 있으면(수동 등록 폼에서) 함께 저장한다.
    // 아이템 생성 전에 먼저 충돌을 확인해서, 바코드가 이미 다른 아이템에 있을 때
    // 아이템만 생성되고 바코드는 못 붙는 반쪽짜리 상태가 되지 않게 한다.
    const rawBarcode = (request.body as Record<string, unknown>)?.barcodeValue;
    const barcodeValue = typeof rawBarcode === "string" ? rawBarcode.trim() : "";
    if (barcodeValue) {
      const existing = await prisma.barcode.findUnique({ where: { value: barcodeValue } });
      if (existing) {
        return reply.code(409).send({ error: "이미 다른 아이템에 등록된 바코드 값입니다" });
      }
    }

    const { purchaseDate, expiryDate, warrantyExpiresAt, ...rest } = parsed.data;
    const item = await prisma.item.create({
      data: {
        ...rest,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        warrantyExpiresAt: warrantyExpiresAt ? new Date(warrantyExpiresAt) : undefined,
        createdById: request.user.sub,
      },
      include: ITEM_INCLUDE,
    });

    if (barcodeValue) {
      await prisma.barcode.create({
        data: {
          itemId: item.id,
          value: barcodeValue,
          symbology: guessSymbology(barcodeValue),
          source: "EXISTING",
          isPrimary: true,
        },
      });
    }

    const created = await prisma.item.findUnique({ where: { id: item.id }, include: ITEM_INCLUDE });
    if (created) void fireInventoryWebhook("item.updated", created);
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = itemUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { purchaseDate, expiryDate, warrantyExpiresAt, ...rest } = parsed.data;
    const item = await prisma.item.update({
      where: { id },
      data: {
        ...rest,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : purchaseDate === null ? null : undefined,
        expiryDate: expiryDate ? new Date(expiryDate) : expiryDate === null ? null : undefined,
        warrantyExpiresAt:
          warrantyExpiresAt ? new Date(warrantyExpiresAt) : warrantyExpiresAt === null ? null : undefined,
        // 날짜가 바뀌면 알림 발송 여부도 초기화한다 — 안 그러면 예전 날짜로 이미 알림을
        // 보낸 아이템에 새 날짜를 넣어도 "이미 알림 보냄" 상태 때문에 다시는 알림이 안 간다.
        expiryNotifiedAt: expiryDate !== undefined ? null : undefined,
        warrantyNotifiedAt: warrantyExpiresAt !== undefined ? null : undefined,
      },
      include: ITEM_INCLUDE,
    });
    void fireInventoryWebhook("item.updated", item);
    return item;
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    // Prisma의 onDelete: Cascade는 DB 행만 지우고 디스크의 실제 파일은 안 건드리므로,
    // 아이템을 지우기 전에 첨부파일을 먼저 조회해서 파일도 함께 정리한다.
    const attachments = await prisma.attachment.findMany({ where: { itemId: id } });
    await prisma.item.delete({ where: { id } });
    await Promise.all(attachments.map((a) => deleteUploadedFile(a.filePath)));
    return reply.code(204).send();
  });

  // 목록 카드에서 바로 누르는 +/- 수량 버튼용 — 상세 페이지까지 들어가지 않아도 된다.
  app.post("/:id/quantity", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = quantityAdjustSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { delta, reason } = parsed.data;
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) return reply.code(404).send({ error: "item not found" });

    const nextQuantity = Math.max(0, item.quantity + delta);
    const [updated] = await prisma.$transaction([
      prisma.item.update({ where: { id }, data: { quantity: nextQuantity }, include: ITEM_INCLUDE }),
      prisma.stockMovement.create({
        data: { itemId: id, delta: nextQuantity - item.quantity, reason, userId: request.user.sub },
      }),
    ]);
    void fireInventoryWebhook("item.updated", updated);
    return updated;
  });

  // 관리자가 재고 이벤트 웹훅을 설정해뒀을 때, 명시적으로 "프린터로 출력" 요청을 보내는
  // 액션. 실제 출력 로직은 전부 웹훅을 받는 쪽 자동화가 담당한다 (docs/ROADMAP.md 참고).
  app.post("/:id/print-request", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await isInventoryWebhookConfigured())) {
      return reply.code(400).send({ error: "웹훅이 설정되지 않았습니다. 설정 > 외부 연동에서 등록하세요." });
    }
    const item = await prisma.item.findUnique({ where: { id }, include: ITEM_INCLUDE });
    if (!item) return reply.code(404).send({ error: "item not found" });
    if (item.barcodes.length === 0) {
      return reply.code(400).send({ error: "이 아이템에는 바코드가 없습니다. 먼저 라벨을 발급하세요." });
    }
    await fireInventoryWebhook("item.print_requested", item);
    return { ok: true };
  });

  // 연속 스캔 UX의 핵심 엔드포인트: 바코드 값 하나로 "있으면 수량 증가, 없으면 신규 등록"까지
  // 한 번에 처리한다. 처음 보는 바코드는 외부 조회로 이름/이미지를 채워서 생성한다.
  app.post("/scan", async (request, reply) => {
    const parsed = scanInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { barcodeValue, delta } = parsed.data;

    const existingBarcode = await prisma.barcode.findFirst({
      where: { value: barcodeValue },
      include: { item: { include: ITEM_INCLUDE } },
    });

    if (existingBarcode) {
      const item = existingBarcode.item;
      const nextQuantity = item.quantity + delta;
      const [updated] = await prisma.$transaction([
        prisma.item.update({ where: { id: item.id }, data: { quantity: nextQuantity }, include: ITEM_INCLUDE }),
        prisma.stockMovement.create({
          data: { itemId: item.id, delta, reason: "RESTOCK", userId: request.user.sub },
        }),
      ]);
      void fireInventoryWebhook("item.updated", updated);
      return { item: updated, matched: true, created: false };
    }

    const lookup = await resolveProduct(barcodeValue);
    let item;
    try {
      item = await prisma.item.create({
        data: {
          name: lookup.found && lookup.name ? lookup.name : `미확인 상품 (${barcodeValue})`,
          quantity: delta,
          photoUrl: lookup.imageUrl,
          notes: lookup.brand ? `브랜드: ${lookup.brand}` : undefined,
          createdById: request.user.sub,
          barcodes: {
            create: {
              value: barcodeValue,
              symbology: guessSymbology(barcodeValue),
              source: "EXISTING",
              isPrimary: true,
            },
          },
        },
        include: ITEM_INCLUDE,
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        // 같은 새 바코드를 거의 동시에 두 번 스캔한 경우 — 방금 다른 요청이 먼저 만든
        // 아이템으로 대신 수량을 올린다 (일반 매칭 분기와 동일하게 처리).
        const race = await prisma.barcode.findUnique({ where: { value: barcodeValue }, include: { item: true } });
        if (race) {
          const nextQuantity = race.item.quantity + delta;
          const [updated] = await prisma.$transaction([
            prisma.item.update({ where: { id: race.item.id }, data: { quantity: nextQuantity }, include: ITEM_INCLUDE }),
            prisma.stockMovement.create({
              data: { itemId: race.item.id, delta, reason: "RESTOCK", userId: request.user.sub },
            }),
          ]);
          void fireInventoryWebhook("item.updated", updated);
          return { item: updated, matched: true, created: false };
        }
      }
      throw err;
    }

    await prisma.stockMovement.create({
      data: { itemId: item.id, delta, reason: "RESTOCK", userId: request.user.sub },
    });
    void fireInventoryWebhook("item.updated", item);

    return reply.code(201).send({ item, matched: false, created: true, lookup });
  });
}
