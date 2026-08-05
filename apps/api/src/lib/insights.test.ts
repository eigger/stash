import { describe, expect, it } from "vitest";
import {
  currentLocalMonthRange,
  duplicatePurchases,
  findUntouchedItems,
  inRange,
  parseYearMonth,
  purchasedInRange,
  topConsumed,
  UNTOUCHED_DAYS_DEFAULT,
} from "@stash/shared";

const rangeAug2026 = {
  start: new Date("2026-08-01T00:00:00.000Z"),
  end: new Date("2026-09-01T00:00:00.000Z"),
};

describe("parseYearMonth", () => {
  it("YYYY-MM을 파싱한다", () => {
    expect(parseYearMonth("2026-08")).toEqual({ year: 2026, month: 8 });
  });

  it("잘못된 값은 null", () => {
    expect(parseYearMonth("2026-13")).toBeNull();
    expect(parseYearMonth("08-2026")).toBeNull();
  });
});

describe("inRange", () => {
  it("[start, end) 반개구간", () => {
    expect(inRange("2026-08-01T00:00:00.000Z", rangeAug2026)).toBe(true);
    expect(inRange("2026-08-31T23:59:59.999Z", rangeAug2026)).toBe(true);
    expect(inRange("2026-09-01T00:00:00.000Z", rangeAug2026)).toBe(false);
    expect(inRange("2026-07-31T23:59:59.999Z", rangeAug2026)).toBe(false);
  });
});

describe("findUntouchedItems", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");

  it("1년 이상 미터치만, 오래된 순", () => {
    const items = [
      {
        id: "a",
        name: "드라이버",
        itemType: "ASSET" as const,
        price: null,
        currency: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        lastAuditedAt: null,
      },
      {
        id: "b",
        name: "우유",
        itemType: "CONSUMABLE" as const,
        price: null,
        currency: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        lastAuditedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "c",
        name: "망치",
        itemType: "ASSET" as const,
        price: null,
        currency: null,
        createdAt: "2020-01-01T00:00:00.000Z",
        lastAuditedAt: "2023-01-01T00:00:00.000Z",
      },
    ];
    const out = findUntouchedItems(items, now, UNTOUCHED_DAYS_DEFAULT);
    expect(out.map((x) => x.id)).toEqual(["c", "a"]);
    expect(out[0].daysSinceTouch).toBeGreaterThan(out[1].daysSinceTouch);
  });

  it("soft-deleted는 제외", () => {
    const items = [
      {
        id: "gone",
        name: "삭제됨",
        itemType: "ASSET" as const,
        price: null,
        currency: null,
        createdAt: "2020-01-01T00:00:00.000Z",
        deletedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(findUntouchedItems(items, now)).toEqual([]);
  });

  it("lastAuditedAt이 있으면 createdAt보다 우선", () => {
    const items = [
      {
        id: "x",
        name: "최근 확인",
        itemType: "ASSET" as const,
        price: null,
        currency: null,
        createdAt: "2020-01-01T00:00:00.000Z",
        lastAuditedAt: "2026-07-01T00:00:00.000Z",
      },
    ];
    expect(findUntouchedItems(items, now)).toEqual([]);
  });
});

describe("topConsumed", () => {
  it("CONSUME만 합산하고 상위 정렬", () => {
    const movements = [
      { itemId: "milk", delta: -2, reason: "CONSUME" as const, occurredAt: "2026-08-10T00:00:00.000Z" },
      { itemId: "milk", delta: -1, reason: "CONSUME" as const, occurredAt: "2026-08-12T00:00:00.000Z" },
      { itemId: "eggs", delta: -5, reason: "CONSUME" as const, occurredAt: "2026-08-05T00:00:00.000Z" },
      { itemId: "milk", delta: 3, reason: "RESTOCK" as const, occurredAt: "2026-08-11T00:00:00.000Z" },
      { itemId: "old", delta: -9, reason: "CONSUME" as const, occurredAt: "2026-07-01T00:00:00.000Z" },
      { itemId: "fix", delta: -1, reason: "ADJUST" as const, occurredAt: "2026-08-15T00:00:00.000Z" },
    ];
    expect(topConsumed(movements, rangeAug2026)).toEqual([
      { itemId: "eggs", consumedQty: 5 },
      { itemId: "milk", consumedQty: 3 },
    ]);
  });
});

describe("duplicatePurchases", () => {
  it("RESTOCK 2회 이상만", () => {
    const movements = [
      { itemId: "rice", delta: 1, reason: "RESTOCK" as const, occurredAt: "2026-08-02T00:00:00.000Z" },
      { itemId: "rice", delta: 2, reason: "RESTOCK" as const, occurredAt: "2026-08-20T00:00:00.000Z" },
      { itemId: "once", delta: 5, reason: "RESTOCK" as const, occurredAt: "2026-08-10T00:00:00.000Z" },
      { itemId: "adj", delta: 1, reason: "ADJUST" as const, occurredAt: "2026-08-03T00:00:00.000Z" },
      { itemId: "adj", delta: 1, reason: "ADJUST" as const, occurredAt: "2026-08-04T00:00:00.000Z" },
    ];
    expect(duplicatePurchases(movements, rangeAug2026)).toEqual([
      { itemId: "rice", restockCount: 2, restockQty: 3 },
    ]);
  });
});

describe("purchasedInRange", () => {
  it("purchaseDate 우선, 없으면 createdAt. 통화별 합", () => {
    const items = [
      {
        id: "1",
        name: "새 것",
        itemType: "CONSUMABLE" as const,
        price: 1000,
        currency: "KRW",
        createdAt: "2026-08-05T00:00:00.000Z",
        purchaseDate: null,
      },
      {
        id: "2",
        name: "늦게 등록",
        itemType: "ASSET" as const,
        price: 50,
        currency: "USD",
        createdAt: "2026-09-01T00:00:00.000Z",
        purchaseDate: "2026-08-15T00:00:00.000Z",
      },
      {
        id: "3",
        name: "가격 없음",
        itemType: "CONSUMABLE" as const,
        price: null,
        currency: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "4",
        name: "다른 달",
        itemType: "CONSUMABLE" as const,
        price: 999,
        currency: "KRW",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ];
    const summary = purchasedInRange(items, rangeAug2026);
    expect(summary.items.map((i) => i.id)).toEqual(["3", "2", "1"]);
    expect(summary.totalByCurrency).toEqual({ KRW: 1000, USD: 50 });
  });
});

describe("currentLocalMonthRange", () => {
  it("시작 ≤ now < 끝", () => {
    const now = new Date("2026-08-05T12:00:00");
    const { start, end } = currentLocalMonthRange(now);
    expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(end.getTime()).toBeGreaterThan(now.getTime());
  });
});
