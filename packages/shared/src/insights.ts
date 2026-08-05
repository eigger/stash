/**
 * Phase 3-D 회고/발견 — 게임 요소를 걷어내도 "처분 후보·소비·구매" 사실이 남는다.
 *
 * 판단·훈계 문구는 UI 쪽 금지(지시서 §P3-D). 여기 헬퍼는 집계만 한다.
 * 달 경계는 호출측이 from/to로 넘긴다 — 서버가 가구 타임존을 추측하지 않는다.
 */

export type InsightsMovementReason = "RESTOCK" | "CONSUME" | "ADJUST";

export type InsightsMovement = {
  itemId: string;
  delta: number;
  reason: InsightsMovementReason;
  occurredAt: Date | string;
};

export type InsightsItem = {
  id: string;
  name: string;
  itemType: "CONSUMABLE" | "ASSET";
  price: number | null;
  currency: string | null;
  purchaseDate?: Date | string | null;
  createdAt: Date | string;
  lastAuditedAt?: Date | string | null;
  deletedAt?: Date | string | null;
};

export type DateRange = { start: Date; end: Date };

/** 처분 후보 기본 임계 — "1년째 손 안 댐". ASSET 신선도(365일)와 맞춰 같은 감각. */
export const UNTOUCHED_DAYS_DEFAULT = 365;

export function toDate(value: Date | string): Date | null {
  const d = typeof value === "string" ? new Date(value) : value;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d;
}

export function inRange(at: Date | string, range: DateRange): boolean {
  const d = toDate(at);
  if (!d) return false;
  const t = d.getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

/** 마지막 손댄 시각: 재점검/스캔 > 등록. freshness와 동일 폴백. */
export function effectiveTouchAt(
  lastAuditedAt: Date | string | null | undefined,
  createdAt: Date | string,
): Date | null {
  return toDate(lastAuditedAt ?? createdAt);
}

export function daysSinceTouch(
  lastAuditedAt: Date | string | null | undefined,
  createdAt: Date | string,
  now: Date = new Date(),
): number | null {
  const at = effectiveTouchAt(lastAuditedAt, createdAt);
  if (!at) return null;
  return Math.max(0, (now.getTime() - at.getTime()) / (1000 * 60 * 60 * 24));
}

export type UntouchedCandidate = {
  id: string;
  name: string;
  itemType: "CONSUMABLE" | "ASSET";
  lastTouchAt: string;
  daysSinceTouch: number;
};

/**
 * 임계일 이상 손 안 댄 살아 있는 아이템. 오래된 순.
 * soft-deleted는 제외(휴지통은 회고 대상이 아님).
 */
export function findUntouchedItems(
  items: InsightsItem[],
  now: Date = new Date(),
  daysThreshold: number = UNTOUCHED_DAYS_DEFAULT,
  limit = 20,
): UntouchedCandidate[] {
  const out: UntouchedCandidate[] = [];
  for (const item of items) {
    if (item.deletedAt) continue;
    const days = daysSinceTouch(item.lastAuditedAt, item.createdAt, now);
    if (days === null || days < daysThreshold) continue;
    const at = effectiveTouchAt(item.lastAuditedAt, item.createdAt)!;
    out.push({
      id: item.id,
      name: item.name,
      itemType: item.itemType,
      lastTouchAt: at.toISOString(),
      daysSinceTouch: Math.floor(days),
    });
  }
  out.sort((a, b) => b.daysSinceTouch - a.daysSinceTouch);
  return out.slice(0, limit);
}

export type ConsumedRank = {
  itemId: string;
  consumedQty: number;
};

/** 기간 내 CONSUME만. delta는 음수 → 소비량은 -delta 합. ADJUST/RESTOCK 제외. */
export function topConsumed(
  movements: InsightsMovement[],
  range: DateRange,
  limit = 10,
): ConsumedRank[] {
  const byItem = new Map<string, number>();
  for (const m of movements) {
    if (m.reason !== "CONSUME" || m.delta >= 0) continue;
    if (!inRange(m.occurredAt, range)) continue;
    byItem.set(m.itemId, (byItem.get(m.itemId) ?? 0) + -m.delta);
  }
  return [...byItem.entries()]
    .map(([itemId, consumedQty]) => ({ itemId, consumedQty }))
    .sort((a, b) => b.consumedQty - a.consumedQty || a.itemId.localeCompare(b.itemId))
    .slice(0, limit);
}

export type DuplicatePurchase = {
  itemId: string;
  /** 서로 다른 UTC 날짜에 RESTOCK이 있었던 날 수(연속 스캔 여러 번은 하루로 묶음). */
  restockCount: number;
  restockQty: number;
};

/** UTC 달력일 키 — 같은 날 연속 스캔을 한 번의 장보기로 묶기 위함. */
export function utcDayKey(at: Date | string): string | null {
  const d = toDate(at);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * 같은 아이템이 기간 내 **서로 다른 날**에 RESTOCK(delta>0)된 경우.
 * 연속 스캔으로 같은 날 6번 찍어도 1일로 센다 — "한 달에 두 번 사 온 것"에 가깝게.
 * ADJUST는 보정이지 구매가 아니라 제외. 영수증이 없어 날짜 단위로 근사한다.
 */
export function duplicatePurchases(
  movements: InsightsMovement[],
  range: DateRange,
  limit = 10,
): DuplicatePurchase[] {
  const byItem = new Map<string, { days: Set<string>; qty: number }>();
  for (const m of movements) {
    if (m.reason !== "RESTOCK" || m.delta <= 0) continue;
    if (!inRange(m.occurredAt, range)) continue;
    const day = utcDayKey(m.occurredAt);
    if (!day) continue;
    const cur = byItem.get(m.itemId) ?? { days: new Set<string>(), qty: 0 };
    cur.days.add(day);
    cur.qty += m.delta;
    byItem.set(m.itemId, cur);
  }
  return [...byItem.entries()]
    .filter(([, v]) => v.days.size >= 2)
    .map(([itemId, v]) => ({
      itemId,
      restockCount: v.days.size,
      restockQty: v.qty,
    }))
    .sort(
      (a, b) =>
        b.restockCount - a.restockCount ||
        b.restockQty - a.restockQty ||
        a.itemId.localeCompare(b.itemId),
    )
    .slice(0, limit);
}

export type PurchasedEntry = {
  id: string;
  name: string;
  price: number | null;
  currency: string | null;
  purchasedAt: string;
};

export type PurchasedSummary = {
  items: PurchasedEntry[];
  totalByCurrency: Record<string, number>;
};

/**
 * 기간 내 "산 것". purchasedAt = purchaseDate ?? createdAt
 * (폼에 purchaseDate UI가 아직 없어 대부분 createdAt 폴백).
 * 총액은 단가(price) 합 — 수량 곱이 아님(등록 1건 = 1회 구매 기록으로 본다).
 * `/items/stats`의 총 자산가치(price×quantity)와 다르다.
 * 합계는 전체 entries 기준, 목록만 limit으로 자른다(표시용).
 * 통화 없으면 "?" 키(stats와 동일).
 */
export function purchasedInRange(
  items: InsightsItem[],
  range: DateRange,
  limit = 50,
): PurchasedSummary {
  const entries: PurchasedEntry[] = [];
  for (const item of items) {
    if (item.deletedAt) continue;
    const purchasedAt = toDate(item.purchaseDate ?? item.createdAt);
    if (!purchasedAt || !inRange(purchasedAt, range)) continue;
    entries.push({
      id: item.id,
      name: item.name,
      price: item.price,
      currency: item.currency,
      purchasedAt: purchasedAt.toISOString(),
    });
  }
  entries.sort(
    (a, b) =>
      new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime() ||
      a.name.localeCompare(b.name),
  );
  const totalByCurrency: Record<string, number> = {};
  for (const e of entries) {
    if (e.price == null || !Number.isFinite(e.price)) continue;
    const key = e.currency?.trim() || "?";
    totalByCurrency[key] = (totalByCurrency[key] ?? 0) + e.price;
  }
  return { items: entries.slice(0, limit), totalByCurrency };
}

/**
 * 브라우저/로컬 달력의 year-month → [start, end) UTC Date.
 * 호출 환경의 로컬 오프셋을 쓴다(대시보드·회고 페이지용).
 */
export function localMonthRange(year: number, month: number, now = new Date()): DateRange {
  const y = year;
  const m = month;
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    const ny = now.getFullYear();
    const nm = now.getMonth() + 1;
    return {
      start: new Date(ny, nm - 1, 1),
      end: new Date(ny, nm, 1),
    };
  }
  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m, 1),
  };
}

export function currentLocalMonthRange(now = new Date()): DateRange {
  return localMonthRange(now.getFullYear(), now.getMonth() + 1, now);
}

/** YYYY-MM 파싱. 실패 시 null. */
export function parseYearMonth(value: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return { year, month };
}
