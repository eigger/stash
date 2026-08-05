import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
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
    // 409/이어하기 때 "누가 돌리고 있는지"를 보여주기 위해 — 권한 게이트는 아니다.
    startedBy: { select: { id: true, name: true } },
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

type Tx = Prisma.TransactionClient;

/** 재점검 경로 — 휴지통 아이템을 되살리지 않는다 (/scan의 deletedAt:null과 의도적으로 다름). */
async function applyQuantityAdjust(
  tx: Tx,
  opts: {
    itemId: string;
    from: number;
    to: number;
    userId: string;
    locationId?: string | null;
    alsoAudited?: boolean;
  },
) {
  const { itemId, from, to, userId, locationId, alsoAudited = true } = opts;
  const delta = to - from;
  const data: {
    quantity: number;
    lastAuditedAt?: Date;
    locationId?: string | null;
  } = { quantity: to };
  if (alsoAudited) data.lastAuditedAt = new Date();
  if (locationId !== undefined) data.locationId = locationId;

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
}

type FinishPlan = {
  checkId: string;
  itemId: string;
  action: AuditUnscannedAction;
  moveTo: string | undefined;
  quantity: number;
  deletedAt: Date | null;
};

/** MOVE 타깃 누락을 루프 들어가기 전에 전부 걸러 부분 적용을 막는다. */
export function buildFinishPlans(
  pending: {
    id: string;
    itemId: string;
    item: { quantity: number; deletedAt: Date | null };
  }[],
  defaultAction: AuditUnscannedAction,
  defaultMoveTo: string | undefined,
  exceptions: { itemId: string; action: AuditUnscannedAction; moveToLocationId?: string }[],
): { ok: true; plans: FinishPlan[] } | { ok: false; reason: "move_target_required" } {
  const exceptionMap = new Map(exceptions.map((e) => [e.itemId, e]));
  const plans: FinishPlan[] = [];
  for (const check of pending) {
    const ex = exceptionMap.get(check.itemId);
    const action = ex?.action ?? defaultAction;
    const moveTo = ex?.moveToLocationId ?? defaultMoveTo;
    if (action === "MOVE" && !moveTo) {
      return { ok: false, reason: "move_target_required" };
    }
    plans.push({
      checkId: check.id,
      itemId: check.itemId,
      action,
      moveTo,
      quantity: check.item.quantity,
      deletedAt: check.item.deletedAt,
    });
  }
  return { ok: true, plans };
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

    const { updatedItem } = await prisma.$transaction(async (tx) => {
      const updated = await applyQuantityAdjust(tx, {
        itemId: item.id,
        from: item.quantity,
        to: actualQuantity,
        userId: request.user.sub,
        locationId: moveLocationId,
      });
      await tx.auditCheck.upsert({
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
      return { updatedItem: updated };
    });

    // confirm마다 웹훅 1회 — 재점검은 벌크라 수신 자동화 부하가 커질 수 있음(ROADMAP).
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

    const pending = session.checks.filter((c) => c.status === "PENDING");
    const planned = buildFinishPlans(
      pending,
      parsed.data.defaultAction,
      parsed.data.moveToLocationId,
      parsed.data.exceptions,
    );
    if (!planned.ok) {
      return reply.code(400).send({ error: t("auditMoveTargetRequired", request.locale) });
    }

    const now = new Date();
    const userId = request.user.sub;
    const sessionLocationId = session.locationId;

    // 큰 위치에서도 기본 5초 interactive 타임아웃에 안 걸리게 여유를 둔다.
    // 아이템 갱신은 동일 data끼리 updateMany로 묶어 왕복을 줄인다.
    const { completed, webhookItemIds } = await prisma.$transaction(
      async (tx) => {
        const webhookIds: string[] = [];
        const zeroCheckIds: string[] = [];
        const movePlans: FinishPlan[] = [];
        const movements: { itemId: string; delta: number; reason: "ADJUST"; userId: string }[] = [];

        const zeroAlreadyZeroIds: string[] = [];
        const zeroWithQtyIds: string[] = [];
        // 타깃 locationId → 옮길 itemId들
        const moveByTarget = new Map<string, string[]>();

        for (const plan of planned.plans) {
          if (plan.action === "LEAVE") continue;

          // 세션 중 휴지통으로 간 아이템은 건드리지 않는다 — ZERO가 되살리면 의미가 반대다.
          // 체크만 FOUND로 올려 세션을 닫을 수 있게 한다.
          if (plan.deletedAt) {
            if (plan.action === "ZERO") zeroCheckIds.push(plan.checkId);
            else movePlans.push(plan);
            continue;
          }

          if (plan.action === "ZERO") {
            if (plan.quantity === 0) zeroAlreadyZeroIds.push(plan.itemId);
            else {
              zeroWithQtyIds.push(plan.itemId);
              movements.push({
                itemId: plan.itemId,
                delta: -plan.quantity,
                reason: "ADJUST",
                userId,
              });
            }
            webhookIds.push(plan.itemId);
            zeroCheckIds.push(plan.checkId);
            continue;
          }

          const target = plan.moveTo ?? sessionLocationId;
          const list = moveByTarget.get(target);
          if (list) list.push(plan.itemId);
          else moveByTarget.set(target, [plan.itemId]);
          webhookIds.push(plan.itemId);
          movePlans.push(plan);
        }

        if (zeroWithQtyIds.length > 0) {
          await tx.item.updateMany({
            where: { id: { in: zeroWithQtyIds } },
            data: { quantity: 0, lastAuditedAt: now },
          });
        }
        if (zeroAlreadyZeroIds.length > 0) {
          await tx.item.updateMany({
            where: { id: { in: zeroAlreadyZeroIds } },
            data: { lastAuditedAt: now },
          });
        }
        for (const [target, itemIds] of moveByTarget) {
          await tx.item.updateMany({
            where: { id: { in: itemIds } },
            data: { locationId: target, lastAuditedAt: now },
          });
        }

        if (movements.length > 0) {
          await tx.stockMovement.createMany({ data: movements });
        }
        if (zeroCheckIds.length > 0) {
          await tx.auditCheck.updateMany({
            where: { id: { in: zeroCheckIds } },
            data: { status: "FOUND", actualQuantity: 0, checkedAt: now },
          });
        }
        // MOVE 체크의 actualQuantity는 아이템마다 달라 일괄값이 안 된다 — 건수만 남는다.
        for (const plan of movePlans) {
          await tx.auditCheck.update({
            where: { id: plan.checkId },
            data: {
              status: "FOUND",
              actualQuantity: plan.deletedAt ? undefined : plan.quantity,
              checkedAt: now,
            },
          });
        }

        const completedSession = await tx.auditSession.update({
          where: { id: session.id },
          data: { status: "COMPLETED", completedAt: now },
          include: sessionInclude(),
        });

        return { completed: completedSession, webhookItemIds: webhookIds };
      },
      { timeout: 30_000 },
    );

    // 트랜잭션 밖 — 실패해도 재고는 이미 맞음. 라벨(전자잉크)이 낡은 수량을 붙잡지 않게.
    // finish는 한 번에 많이 나가므로 순차 발송(백그라운드). 동시 100발은 수신 자동화를 짓누른다.
    if (webhookItemIds.length > 0) {
      const items = await prisma.item.findMany({
        where: { id: { in: webhookItemIds } },
        include: ITEM_INCLUDE,
      });
      void (async () => {
        for (const item of items) {
          await fireInventoryWebhook("item.updated", item);
        }
      })();
    }

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
