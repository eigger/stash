import type { FastifyInstance } from "fastify";
import {
  auditConfirmSchema,
  auditFinishSchema,
  auditRegisterSchema,
  auditScanSchema,
  auditSessionStartSchema,
  guessSymbology,
  type AuditUnscannedAction,
} from "@stash/shared";
import { prisma } from "../lib/prisma.js";
import { collectLocationIds, computeAuditProgress } from "../lib/auditScope.js";
import { fireInventoryWebhook } from "../lib/webhook.js";
import { isUniqueConstraintError } from "../lib/prismaErrors.js";
import { t } from "../lib/i18n.js";

const ITEM_INCLUDE = {
  barcodes: true,
  location: true,
  category: true,
} as const;

const CHECK_INCLUDE = {
  item: { include: ITEM_INCLUDE },
} as const;

function sessionInclude() {
  return {
    location: true,
    checks: {
      include: CHECK_INCLUDE,
      orderBy: [{ status: "asc" as const }, { item: { name: "asc" as const } }],
    },
  };
}

function withProgress<T extends { checks: { status: "PENDING" | "FOUND" | "UNEXPECTED" }[] }>(
  session: T,
) {
  return { ...session, progress: computeAuditProgress(session.checks) };
}

async function loadActiveSession() {
  return prisma.auditSession.findFirst({
    where: { status: "ACTIVE" },
    include: sessionInclude(),
  });
}

async function requireActiveSession(id: string) {
  const session = await prisma.auditSession.findUnique({
    where: { id },
    include: sessionInclude(),
  });
  if (!session) return { error: "not_found" as const };
  if (session.status !== "ACTIVE") return { error: "not_active" as const, session };
  return { session };
}

async function applyQuantityAdjust(opts: {
  itemId: string;
  from: number;
  to: number;
  userId: string;
  locationId?: string | null;
  alsoAudited?: boolean;
}) {
  const { itemId, from, to, userId, locationId, alsoAudited = true } = opts;
  const delta = to - from;
  const data: {
    quantity: number;
    lastAuditedAt?: Date;
    locationId?: string | null;
    deletedAt?: null;
  } = {
    quantity: to,
    deletedAt: null,
  };
  if (alsoAudited) data.lastAuditedAt = new Date();
  if (locationId !== undefined) data.locationId = locationId;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.item.update({
      where: { id: itemId },
      data,
      include: ITEM_INCLUDE,
    });
    // 수량 변화가 있을 때만 ADJUST — 위치만 옮긴 확인은 이력에 노이즈를 남기지 않는다.
    if (delta !== 0) {
      await tx.stockMovement.create({
        data: { itemId, delta, reason: "ADJUST", userId },
      });
    }
    return updated;
  });
}

async function applyUnscannedAction(opts: {
  itemId: string;
  currentQuantity: number;
  action: AuditUnscannedAction;
  moveToLocationId: string | undefined;
  sessionLocationId: string;
  userId: string;
}) {
  const { itemId, currentQuantity, action, moveToLocationId, sessionLocationId, userId } = opts;
  if (action === "LEAVE") return;

  if (action === "ZERO") {
    if (currentQuantity === 0) {
      // 수량은 이미 0이어도 "없어진 것으로 확인"한 것이므로 감사 시각만 찍는다.
      await prisma.item.update({
        where: { id: itemId },
        data: { lastAuditedAt: new Date() },
      });
      return;
    }
    await applyQuantityAdjust({
      itemId,
      from: currentQuantity,
      to: 0,
      userId,
    });
    return;
  }

  // MOVE
  const target = moveToLocationId ?? sessionLocationId;
  await prisma.item.update({
    where: { id: itemId },
    data: { locationId: target, lastAuditedAt: new Date() },
  });
}

export async function auditRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // 가구당 ACTIVE 세션 하나 — 앱을 닫아도 이어서 할 수 있게.
  app.get("/sessions/active", async () => {
    const session = await loadActiveSession();
    return session ? withProgress(session) : null;
  });

  app.get("/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await prisma.auditSession.findUnique({
      where: { id },
      include: sessionInclude(),
    });
    if (!session) return reply.code(404).send({ error: t("auditSessionNotFound", request.locale) });
    return withProgress(session);
  });

  app.post("/sessions", async (request, reply) => {
    const parsed = auditSessionStartSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await loadActiveSession();
    if (existing) {
      return reply.code(409).send({
        error: t("auditSessionAlreadyActive", request.locale),
        session: withProgress(existing),
      });
    }

    const location = await prisma.location.findUnique({ where: { id: parsed.data.locationId } });
    if (!location) return reply.code(404).send({ error: t("locationNotFound", request.locale) });

    const allLocations = await prisma.location.findMany({ select: { id: true, parentId: true } });
    const scopeIds = collectLocationIds(allLocations, parsed.data.locationId, parsed.data.includeChildren);

    const items = await prisma.item.findMany({
      where: { deletedAt: null, locationId: { in: scopeIds } },
      select: { id: true, quantity: true },
    });

    const session = await prisma.auditSession.create({
      data: {
        locationId: parsed.data.locationId,
        includeChildren: parsed.data.includeChildren,
        startedById: request.user.sub,
        checks: {
          create: items.map((item) => ({
            itemId: item.id,
            expectedQuantity: item.quantity,
            status: "PENDING",
          })),
        },
      },
      include: sessionInclude(),
    });

    return reply.code(201).send(withProgress(session));
  });

  // 바코드 → 아이템 조회만. 수량/위치 변경은 confirm에서.
  app.post("/sessions/:id/scan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = auditScanSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const loaded = await requireActiveSession(id);
    if (loaded.error === "not_found") {
      return reply.code(404).send({ error: t("auditSessionNotFound", request.locale) });
    }
    if (loaded.error === "not_active") {
      return reply.code(400).send({ error: t("auditSessionNotActive", request.locale) });
    }
    const { session } = loaded;

    const barcode = await prisma.barcode.findUnique({
      where: { value: parsed.data.barcodeValue },
      include: { item: { include: ITEM_INCLUDE } },
    });

    if (!barcode || barcode.item.deletedAt) {
      return {
        status: "unknown" as const,
        barcodeValue: parsed.data.barcodeValue,
        session: withProgress(session),
      };
    }

    const item = barcode.item;
    const existingCheck = session.checks.find((c) => c.itemId === item.id);
    const allLocations = await prisma.location.findMany({ select: { id: true, parentId: true } });
    const scopeIds = new Set(
      collectLocationIds(allLocations, session.locationId, session.includeChildren),
    );
    const inScope = item.locationId != null && scopeIds.has(item.locationId);

    return {
      status: existingCheck
        ? existingCheck.status === "PENDING"
          ? ("expected" as const)
          : ("already_found" as const)
        : ("unexpected" as const),
      item,
      check: existingCheck ?? null,
      inScope,
      sessionLocationId: session.locationId,
      session: withProgress(session),
    };
  });

  app.post("/sessions/:id/confirm", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = auditConfirmSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const loaded = await requireActiveSession(id);
    if (loaded.error === "not_found") {
      return reply.code(404).send({ error: t("auditSessionNotFound", request.locale) });
    }
    if (loaded.error === "not_active") {
      return reply.code(400).send({ error: t("auditSessionNotActive", request.locale) });
    }
    const { session } = loaded;

    const item = await prisma.item.findFirst({
      where: { id: parsed.data.itemId, deletedAt: null },
      include: ITEM_INCLUDE,
    });
    if (!item) return reply.code(404).send({ error: t("itemNotFound", request.locale) });

    const actualQuantity = item.itemType === "ASSET" ? 1 : parsed.data.actualQuantity;
    const existing = session.checks.find((c) => c.itemId === item.id);
    const nextStatus = existing && existing.status !== "UNEXPECTED" ? "FOUND" : "UNEXPECTED";
    const moveLocationId = parsed.data.moveHere ? session.locationId : undefined;

    const updatedItem = await applyQuantityAdjust({
      itemId: item.id,
      from: item.quantity,
      to: actualQuantity,
      userId: request.user.sub,
      locationId: moveLocationId,
    });

    await prisma.auditCheck.upsert({
      where: { sessionId_itemId: { sessionId: session.id, itemId: item.id } },
      create: {
        sessionId: session.id,
        itemId: item.id,
        expectedQuantity: existing?.expectedQuantity ?? item.quantity,
        actualQuantity,
        status: nextStatus,
        checkedAt: new Date(),
      },
      update: {
        actualQuantity,
        status: nextStatus,
        checkedAt: new Date(),
      },
    });

    void fireInventoryWebhook("item.updated", updatedItem);

    const refreshed = await prisma.auditSession.findUniqueOrThrow({
      where: { id: session.id },
      include: sessionInclude(),
    });
    return { item: updatedItem, session: withProgress(refreshed) };
  });

  // 세션 중 미등록 바코드 → 이 위치에 신규 등록 후 UNEXPECTED로 확인 처리.
  app.post("/sessions/:id/register", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = auditRegisterSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const loaded = await requireActiveSession(id);
    if (loaded.error === "not_found") {
      return reply.code(404).send({ error: t("auditSessionNotFound", request.locale) });
    }
    if (loaded.error === "not_active") {
      return reply.code(400).send({ error: t("auditSessionNotActive", request.locale) });
    }
    const { session } = loaded;

    const existingBarcode = await prisma.barcode.findUnique({ where: { value: parsed.data.barcodeValue } });
    if (existingBarcode) {
      return reply.code(400).send({ error: t("barcodeAlreadyRegistered", request.locale) });
    }

    let item;
    try {
      item = await prisma.item.create({
        data: {
          name: parsed.data.name,
          quantity: parsed.data.quantity,
          locationId: session.locationId,
          createdById: request.user.sub,
          lastAuditedAt: new Date(),
          barcodes: {
            create: {
              value: parsed.data.barcodeValue,
              symbology: guessSymbology(parsed.data.barcodeValue),
              source: "EXISTING",
              isPrimary: true,
            },
          },
          movements: {
            create: {
              delta: parsed.data.quantity,
              reason: "RESTOCK",
              userId: request.user.sub,
            },
          },
          auditChecks: {
            create: {
              sessionId: session.id,
              expectedQuantity: parsed.data.quantity,
              actualQuantity: parsed.data.quantity,
              status: "UNEXPECTED",
              checkedAt: new Date(),
            },
          },
        },
        include: ITEM_INCLUDE,
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return reply.code(400).send({ error: t("barcodeAlreadyRegistered", request.locale) });
      }
      throw err;
    }

    void fireInventoryWebhook("item.updated", item);
    const refreshed = await prisma.auditSession.findUniqueOrThrow({
      where: { id: session.id },
      include: sessionInclude(),
    });
    return reply.code(201).send({ item, session: withProgress(refreshed) });
  });

  app.post("/sessions/:id/finish", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = auditFinishSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const loaded = await requireActiveSession(id);
    if (loaded.error === "not_found") {
      return reply.code(404).send({ error: t("auditSessionNotFound", request.locale) });
    }
    if (loaded.error === "not_active") {
      return reply.code(400).send({ error: t("auditSessionNotActive", request.locale) });
    }
    const { session } = loaded;

    if (parsed.data.defaultAction === "MOVE" && !parsed.data.moveToLocationId) {
      return reply.code(400).send({ error: t("auditMoveTargetRequired", request.locale) });
    }

    const exceptionMap = new Map(parsed.data.exceptions.map((e) => [e.itemId, e]));
    const pending = session.checks.filter((c) => c.status === "PENDING");

    for (const check of pending) {
      const ex = exceptionMap.get(check.itemId);
      const action = ex?.action ?? parsed.data.defaultAction;
      const moveTo = ex?.moveToLocationId ?? parsed.data.moveToLocationId;
      if (action === "MOVE" && !moveTo) {
        return reply.code(400).send({ error: t("auditMoveTargetRequired", request.locale) });
      }
      await applyUnscannedAction({
        itemId: check.itemId,
        currentQuantity: check.item.quantity,
        action,
        moveToLocationId: moveTo,
        sessionLocationId: session.locationId,
        userId: request.user.sub,
      });
      // LEAVE는 확인하지 않은 것이므로 체크 상태를 바꾸지 않는다.
      // ZERO/MOVE는 사용자가 처리 방향을 정한 것이므로 FOUND로 올려 세션을 닫는다.
      if (action !== "LEAVE") {
        await prisma.auditCheck.update({
          where: { id: check.id },
          data: {
            status: "FOUND",
            actualQuantity: action === "ZERO" ? 0 : check.item.quantity,
            checkedAt: new Date(),
          },
        });
      }
    }

    // 이미 FOUND인 아이템의 lastAuditedAt은 confirm 때 찍혔다.
    // 세션을 닫는다.
    const completed = await prisma.auditSession.update({
      where: { id: session.id },
      data: { status: "COMPLETED", completedAt: new Date() },
      include: sessionInclude(),
    });

    return withProgress(completed);
  });

  // 확인분(FOUND)은 유지하고 세션만 버린다 — 중단해도 이미 맞춘 수량은 깨지지 않게.
  app.post("/sessions/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const loaded = await requireActiveSession(id);
    if (loaded.error === "not_found") {
      return reply.code(404).send({ error: t("auditSessionNotFound", request.locale) });
    }
    if (loaded.error === "not_active") {
      return reply.code(400).send({ error: t("auditSessionNotActive", request.locale) });
    }

    const cancelled = await prisma.auditSession.update({
      where: { id },
      data: { status: "CANCELLED", completedAt: new Date() },
      include: sessionInclude(),
    });
    return withProgress(cancelled);
  });
}
