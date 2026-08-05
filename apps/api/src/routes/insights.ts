import type { FastifyInstance } from "fastify";
import {
  duplicatePurchases,
  findUntouchedItems,
  purchasedInRange,
  topConsumed,
  UNTOUCHED_DAYS_DEFAULT,
  type InsightsItem,
  type InsightsMovement,
} from "@stash/shared";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function insightsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  /**
   * 회고 집계. from/to는 클라이언트가 로컬 달력으로 만든 [start, end) ISO.
   * 서버는 타임존을 추측하지 않는다(가구마다 OS/브라우저 로컬이 기준).
   */
  app.get("/", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const from = parseIsoDate(q.from);
    const to = parseIsoDate(q.to);
    if (!from || !to || to.getTime() <= from.getTime()) {
      return reply.code(400).send({ error: t("insightsRangeRequired", request.locale) });
    }
    // 과도한 구간으로 movements 전체를 긁지 않게 상한 — 회고는 월 단위가 기본.
    const maxMs = 92 * 24 * 60 * 60 * 1000; // ~3개월
    if (to.getTime() - from.getTime() > maxMs) {
      return reply.code(400).send({ error: t("insightsRangeTooLong", request.locale) });
    }

    const untouchedDays = Math.min(
      3650,
      Math.max(1, Number(q.untouchedDays) || UNTOUCHED_DAYS_DEFAULT),
    );
    // Date#getTimezoneOffset()과 동일 부호. 없으면 0(UTC) — from/to만 보낸 구클라이언트를 깨지 않음.
    const rawOffset = q.tzOffsetMinutes === undefined ? 0 : Number(q.tzOffsetMinutes);
    const tzOffsetMinutes =
      Number.isFinite(rawOffset) && Math.abs(rawOffset) <= 14 * 60 ? Math.trunc(rawOffset) : 0;
    const range = { start: from, end: to };
    const now = new Date();

    const [items, movements] = await Promise.all([
      prisma.item.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          itemType: true,
          price: true,
          currency: true,
          purchaseDate: true,
          createdAt: true,
          lastAuditedAt: true,
        },
      }),
      prisma.stockMovement.findMany({
        where: {
          occurredAt: { gte: from, lt: to },
          reason: { in: ["CONSUME", "RESTOCK"] },
        },
        select: {
          itemId: true,
          delta: true,
          reason: true,
          occurredAt: true,
        },
      }),
    ]);

    const itemRows = items as InsightsItem[];
    const movementRows = movements as InsightsMovement[];
    const nameById = new Map(itemRows.map((i) => [i.id, i.name]));

    const untouched = findUntouchedItems(itemRows, now, untouchedDays);
    const consumed = topConsumed(movementRows, range).map((row) => ({
      ...row,
      name: nameById.get(row.itemId) ?? row.itemId,
    }));
    const duplicates = duplicatePurchases(movementRows, range, 10, tzOffsetMinutes).map((row) => ({
      ...row,
      name: nameById.get(row.itemId) ?? row.itemId,
    }));
    const purchased = purchasedInRange(itemRows, range);

    return {
      range: { start: from.toISOString(), end: to.toISOString() },
      untouchedDays,
      tzOffsetMinutes,
      untouched,
      topConsumed: consumed,
      duplicatePurchases: duplicates,
      purchased,
    };
  });
}
