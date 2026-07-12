import type { FastifyInstance } from "fastify";
import {
  itemBulkDeleteSchema,
  itemBulkUpdateSchema,
  itemInputSchema,
  itemUpdateSchema,
  quantityAdjustSchema,
  scanInputSchema,
} from "@stash/shared";
import { prisma } from "../lib/prisma.js";
import { resolveProduct } from "../lib/barcodeLookup/index.js";
import { fireInventoryWebhook, isInventoryWebhookConfigured } from "../lib/webhook.js";
import { guessSymbology } from "../lib/barcodeSymbology.js";
import { isUniqueConstraintError } from "../lib/prismaErrors.js";
import { deleteUploadedFile } from "../lib/uploads.js";
import { encodeCsvRow, parseCsv } from "../lib/csv.js";
import { t } from "../lib/i18n.js";

const ITEM_INCLUDE = {
  barcodes: true,
  location: true,
  category: true,
} as const;

const CSV_COLUMNS = [
  "name",
  "quantity",
  "unit",
  "minQuantity",
  "locationName",
  "categoryName",
  "expiryDate",
  "warrantyExpiresAt",
  "price",
  "currency",
  "barcodeValue",
  "notes",
] as const;

export async function itemRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request) => {
    const { q, locationId, categoryId, lowStock, expiringSoon, sort, page, pageSize, limit, trashed } = request.query as {
      q?: string;
      locationId?: string;
      categoryId?: string;
      lowStock?: string;
      expiringSoon?: string;
      sort?: string;
      page?: string;
      pageSize?: string;
      limit?: string;
      trashed?: string;
    };

    const where: Record<string, unknown> = { deletedAt: trashed === "true" ? { not: null } : null };
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

    // 목록 규모상 DB 정렬 대신 fetch 후 JS에서 정렬 — 위 lowStock 필터와 같은 방식.
    if (sort === "quantityAsc") {
      items = [...items].sort((a, b) => a.quantity - b.quantity);
    } else if (sort === "expiryAsc") {
      items = [...items].sort((a, b) => {
        if (!a.expiryDate && !b.expiryDate) return 0;
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      });
    }

    // page가 있으면 { items, total } 형태로, 없으면 기존처럼 배열 그대로 반환 —
    // 대시보드의 lowStock/expiringSoon 호출 등 기존 호출부와 하위호환을 유지한다.
    if (page) {
      const total = items.length;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const size = Math.min(100, Math.max(1, parseInt(pageSize ?? "30", 10) || 30));
      const paged = items.slice((pageNum - 1) * size, pageNum * size);
      return { items: paged, total, page: pageNum, pageSize: size };
    }

    if (limit) {
      const n = Math.max(1, parseInt(limit, 10) || 0);
      items = items.slice(0, n);
    }

    return items;
  });

  // 전체 백업(tar.gz)과 별개로, 스프레드시트로 대량 입력/이전할 때 쓰는 가벼운 내보내기.
  app.get("/export.csv", async (request, reply) => {
    const items = await prisma.item.findMany({
      where: { deletedAt: null },
      include: ITEM_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    let csv = encodeCsvRow([...CSV_COLUMNS]);
    for (const item of items) {
      const primaryBarcode = item.barcodes.find((b) => b.isPrimary) ?? item.barcodes[0];
      csv += encodeCsvRow([
        item.name,
        item.quantity,
        item.unit,
        item.minQuantity,
        item.location?.name,
        item.category?.name,
        item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : "",
        item.warrantyExpiresAt ? item.warrantyExpiresAt.toISOString().slice(0, 10) : "",
        item.price,
        item.currency,
        primaryBarcode?.value,
        item.notes,
      ]);
    }
    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="stash_items_${new Date().toISOString().slice(0, 10)}.csv"`)
      .send(csv);
  });

  // CSV 대량 등록 — 위치/카테고리는 이름으로 받아서 없으면 새로 만든다(최상위 항목으로).
  // 바코드는 CSV로 다루지 않는다 — 심볼로지 판별 등은 스캔으로 등록하는 게 훨씬 안전하다.
  app.post("/import.csv", async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: t("csvFileRequired", request.locale) });
    const text = (await file.toBuffer()).toString("utf8");
    const rows = parseCsv(text);
    if (rows.length === 0) return reply.code(400).send({ error: t("emptyCsvFile", request.locale) });

    const header = rows[0].map((h) => h.trim());
    const nameIdx = header.indexOf("name");
    if (nameIdx === -1) {
      return reply.code(400).send({ error: t("csvMissingNameColumn", request.locale) });
    }
    const colIdx = (col: string) => header.indexOf(col);
    const cell = (row: string[], col: string) => {
      const idx = colIdx(col);
      return idx !== -1 ? row[idx]?.trim() : undefined;
    };

    const locationCache = new Map<string, string>();
    const categoryCache = new Map<string, string>();

    async function resolveLocationId(name: string | undefined): Promise<string | null> {
      if (!name) return null;
      if (locationCache.has(name)) return locationCache.get(name)!;
      const loc =
        (await prisma.location.findFirst({ where: { name, parentId: null } })) ??
        (await prisma.location.create({ data: { name } }));
      locationCache.set(name, loc.id);
      return loc.id;
    }

    async function resolveCategoryId(name: string | undefined): Promise<string | null> {
      if (!name) return null;
      if (categoryCache.has(name)) return categoryCache.get(name)!;
      const cat =
        (await prisma.category.findFirst({ where: { name, parentId: null } })) ??
        (await prisma.category.create({ data: { name } }));
      categoryCache.set(name, cat.id);
      return cat.id;
    }

    // CSV는 사람이 스프레드시트로 편집하므로 잘못된 값(문자, 음수, 이상한 날짜)이 섞여
    // 들어오기 쉽다. 파싱 실패는 "그 칸만 비움"으로 처리해 한 칸 오타로 행 전체가 날아가지
    // 않게 한다 — 특히 price는 NaN이 들어가면 /stats 합계 전체가 NaN이 되므로 반드시 막는다.
    const parseIntOrNull = (raw: string | undefined): number | null => {
      if (!raw) return null;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? Math.max(0, n) : null;
    };
    const parseFloatOrNull = (raw: string | undefined): number | null => {
      if (!raw) return null;
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : null;
    };
    const parseDateOrNull = (raw: string | undefined): Date | null => {
      if (!raw) return null;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    let created = 0;
    const errors: string[] = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const name = row[nameIdx]?.trim();
      if (!name) {
        errors.push(t("csvRowNameEmpty", request.locale, { row: r + 1 }));
        continue;
      }
      const barcodeValue = cell(row, "barcodeValue");
      try {
        await prisma.item.create({
          data: {
            name,
            quantity: parseIntOrNull(cell(row, "quantity")) ?? 1,
            unit: cell(row, "unit") || null,
            minQuantity: parseIntOrNull(cell(row, "minQuantity")),
            locationId: await resolveLocationId(cell(row, "locationName")),
            categoryId: await resolveCategoryId(cell(row, "categoryName")),
            expiryDate: parseDateOrNull(cell(row, "expiryDate")),
            warrantyExpiresAt: parseDateOrNull(cell(row, "warrantyExpiresAt")),
            price: parseFloatOrNull(cell(row, "price")),
            currency: cell(row, "currency") || null,
            notes: cell(row, "notes") || null,
            createdById: request.user.sub,
            barcodes: barcodeValue
              ? {
                  create: {
                    value: barcodeValue,
                    symbology: guessSymbology(barcodeValue),
                    source: "EXISTING",
                    isPrimary: true,
                  },
                }
              : undefined,
          },
        });
        created++;
      } catch (err: any) {
        // 바코드 값은 전역 유니크라, CSV 여러 행에 같은 값이 있거나 이미 다른 아이템에
        // 등록된 값이면 이 행만 실패한다 — 나머지 행은 계속 진행된다.
        if (isUniqueConstraintError(err)) {
          errors.push(t("csvRowBarcodeConflict", request.locale, { row: r + 1, name }));
        } else {
          errors.push(t("csvRowError", request.locale, { row: r + 1, name, detail: err.message || err }));
        }
      }
    }

    return { created, errors };
  });

  // 대시보드의 "총 자산가치" 집계용 — price/quantity/currency만 select해서 전체 아이템을
  // 무겁게 include하지 않고 가볍게 계산한다. currency는 자유 텍스트라 통화별로 따로 합산.
  app.get("/stats", async () => {
    const rows = await prisma.item.findMany({
      where: { deletedAt: null },
      select: { price: true, quantity: true, currency: true },
    });
    let totalItems = 0;
    const totalValueByCurrency: Record<string, number> = {};
    for (const row of rows) {
      totalItems += row.quantity;
      if (row.price != null) {
        const currency = row.currency || "?";
        totalValueByCurrency[currency] = (totalValueByCurrency[currency] ?? 0) + row.price * row.quantity;
      }
    }
    return { totalItems, totalValueByCurrency };
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
    if (!item) return reply.code(404).send({ error: t("itemNotFound", request.locale) });
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
        return reply.code(409).send({ error: t("barcodeAlreadyRegistered", request.locale) });
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

  // 목록에서 여러 아이템을 골라 위치/카테고리를 한 번에 바꾼다. locationId/categoryId를
  // 아예 안 보내면 그 필드는 그대로 두고, null을 보내면 "위치 없음/카테고리 없음"으로 지운다.
  app.patch("/bulk", async (request, reply) => {
    const parsed = itemBulkUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { itemIds, locationId, categoryId } = parsed.data;
    const data: { locationId?: string | null; categoryId?: string | null } = {};
    if (locationId !== undefined) data.locationId = locationId;
    if (categoryId !== undefined) data.categoryId = categoryId;

    const result = await prisma.item.updateMany({ where: { id: { in: itemIds } }, data });
    return { updated: result.count };
  });

  // 목록에서 여러 아이템을 골라 한 번에 휴지통으로 보낸다 — 단건 삭제와 같은 소프트 삭제.
  app.post("/bulk-delete", async (request, reply) => {
    const parsed = itemBulkDeleteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const result = await prisma.item.updateMany({
      where: { id: { in: parsed.data.itemIds } },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count };
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

  // 소프트 삭제 — 목록/스캔에서 즉시 안 보이게만 하고, 실수로 지운 걸 휴지통에서
  // 되돌릴 수 있게 한다. 첨부파일은 영구 삭제(/permanent) 때만 정리한다.
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await prisma.item.update({ where: { id }, data: { deletedAt: new Date() } });
    return reply.send(item);
  });

  app.post("/:id/restore", async (request) => {
    const { id } = request.params as { id: string };
    const item = await prisma.item.update({ where: { id }, data: { deletedAt: null }, include: ITEM_INCLUDE });
    return item;
  });

  // 휴지통에서의 영구 삭제 — 아직 휴지통에 없는(deletedAt이 null인) 아이템은 거부한다.
  // 즉, 반드시 "삭제 → 휴지통 → 영구 삭제" 두 단계를 거치게 해서 실수를 막는다.
  app.delete("/:id/permanent", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) return reply.code(404).send({ error: t("itemNotFound", request.locale) });
    if (!item.deletedAt) {
      return reply.code(400).send({ error: t("onlyTrashedCanBePurged", request.locale) });
    }
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
    if (!item) return reply.code(404).send({ error: t("itemNotFound", request.locale) });

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
      return reply.code(400).send({ error: t("webhookNotConfigured", request.locale) });
    }
    const item = await prisma.item.findUnique({ where: { id }, include: ITEM_INCLUDE });
    if (!item) return reply.code(404).send({ error: t("itemNotFound", request.locale) });
    if (item.barcodes.length === 0) {
      return reply.code(400).send({ error: t("itemHasNoBarcode", request.locale) });
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
      const nextQuantity = Math.max(0, item.quantity + delta);
      const appliedDelta = nextQuantity - item.quantity;

      // 실제 수량 변화가 없으면(이미 0인데 소비 스캔) 아무 것도 바꾸지 않는다 —
      // 휴지통 복구도, 0-delta 이동 이력도 남기지 않고 현재 상태 그대로 돌려준다.
      if (appliedDelta === 0) {
        return { item, matched: true, created: false };
      }

      const [updated] = await prisma.$transaction([
        prisma.item.update({
          where: { id: item.id },
          // 휴지통에 있던 아이템의 바코드를 다시 스캔해 수량이 바뀌면 "이거 아직 있다"는
          // 뜻이므로 되살린다 — 소비 모드로 실제 차감될 때도 마찬가지.
          data: { quantity: nextQuantity, deletedAt: null },
          include: ITEM_INCLUDE,
        }),
        prisma.stockMovement.create({
          data: {
            itemId: item.id,
            delta: appliedDelta,
            reason: delta > 0 ? "RESTOCK" : "CONSUME",
            userId: request.user.sub,
          },
        }),
      ]);
      void fireInventoryWebhook("item.updated", updated);
      return { item: updated, matched: true, created: false };
    }

    if (delta < 0) {
      return reply.code(400).send({ error: t("cannotConsumeUnregisteredBarcode", request.locale) });
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
          // 이 분기는 delta > 0 만 도달한다(위에서 음수 delta는 이미 거부됨).
          const nextQuantity = Math.max(0, race.item.quantity + delta);
          const [updated] = await prisma.$transaction([
            prisma.item.update({
              where: { id: race.item.id },
              data: { quantity: nextQuantity, deletedAt: null },
              include: ITEM_INCLUDE,
            }),
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
