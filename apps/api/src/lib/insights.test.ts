import { describe, expect, it } from "vitest";
import {
  currentLocalMonthRange,
  duplicatePurchases,
  findUntouchedItems,
  inRange,
  localDayKey,
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
  it("서로 다른 날 RESTOCK이 2일 이상만", () => {
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

  it("같은 날 연속 스캔은 하루로 묶는다", () => {
    const movements = [
      { itemId: "water", delta: 1, reason: "RESTOCK" as const, occurredAt: "2026-08-05T01:00:00.000Z" },
      { itemId: "water", delta: 1, reason: "RESTOCK" as const, occurredAt: "2026-08-05T01:00:05.000Z" },
      { itemId: "water", delta: 1, reason: "RESTOCK" as const, occurredAt: "2026-08-05T01:00:10.000Z" },
      { itemId: "water", delta: 1, reason: "RESTOCK" as const, occurredAt: "2026-08-05T01:00:15.000Z" },
      { itemId: "water", delta: 1, reason: "RESTOCK" as const, occurredAt: "2026-08-05T01:00:20.000Z" },
      { itemId: "water", delta: 1, reason: "RESTOCK" as const, occurredAt: "2026-08-05T01:00:25.000Z" },
    ];
    expect(duplicatePurchases(movements, rangeAug2026)).toEqual([]);
  });

  it("같은 날 여러 번 + 다른 날 한 번이면 2일", () => {
    const movements = [
      { itemId: "water", delta: 1, reason: "RESTOCK" as const, occurredAt: "2026-08-05T01:00:00.000Z" },
      { itemId: "water", delta: 1, reason: "RESTOCK" as const, occurredAt: "2026-08-05T01:00:05.000Z" },
      { itemId: "water", delta: 2, reason: "RESTOCK" as const, occurredAt: "2026-08-18T12:00:00.000Z" },
    ];
    expect(duplicatePurchases(movements, rangeAug2026)).toEqual([
      { itemId: "water", restockCount: 2, restockQty: 4 },
    ]);
  });

  it("KST 로컬 같은 날이 UTC로는 갈라져도 1일로 묶인다", () => {
    // 8/5 08:00 KST = 8/4 23:00Z, 8/5 20:00 KST = 8/5 11:00Z — UTC dayKey면 2일 오탐
    const kstOffset = -540;
    expect(localDayKey("2026-08-04T23:00:00.000Z", kstOffset)).toBe("2026-08-05");
    expect(localDayKey("2026-08-05T11:00:00.000Z", kstOffset)).toBe("2026-08-05");
    const movements = [
      { itemId: "water", delta: 1, reason: "RESTOCK" as const, occurredAt: "2026-08-04T23:00:00.000Z" },
      { itemId: "water", delta: 1, reason: "RESTOCK" as const, occurredAt: "2026-08-05T11:00:00.000Z" },
    ];
    expect(duplicatePurchases(movements, rangeAug2026, 10, kstOffset)).toEqual([]);
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

  it("합계는 목록 limit과 무관하게 전체 기준", () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      id: `i${i}`,
      name: `item ${i}`,
      itemType: "CONSUMABLE" as const,
      price: 100,
      currency: "KRW",
      createdAt: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const summary = purchasedInRange(items, rangeAug2026, 50);
    expect(summary.items).toHaveLength(50);
    expect(summary.totalByCurrency).toEqual({ KRW: 6000 });
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
