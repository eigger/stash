import { describe, expect, it } from "vitest";
import { computeConfirmXp, computeQualityXp, QUALITY_XP, sumQualityXp } from "@stash/shared";

describe("computeQualityXp", () => {
  it("이름만 있는 소모품은 0", () => {
    expect(computeQualityXp({ itemType: "CONSUMABLE" }).total).toBe(0);
  });

  it("위치·카테고리·바코드를 채우면 대충 입력보다 높다", () => {
    const sparse = computeQualityXp({ itemType: "CONSUMABLE" });
    const rich = computeQualityXp({
      itemType: "CONSUMABLE",
      locationId: "loc1",
      categoryId: "cat1",
      barcodes: [{ source: "EXISTING" }],
      photoUrl: "/x",
      price: 1200,
      minQuantity: 2,
      expiryDate: "2026-12-01",
    });
    expect(sparse.total).toBe(0);
    expect(rich.total).toBeGreaterThan(50);
    expect(rich.breakdown.map((b) => b.reason)).toEqual(
      expect.arrayContaining(["location", "category", "barcode", "expiryDate"]),
    );
  });

  it("자산에 유통기한·minQuantity 미입력이 감점/요구되지 않는다", () => {
    const asset = computeQualityXp({
      itemType: "ASSET",
      locationId: "loc1",
      barcodes: [{ source: "SERIAL" }],
      warrantyExpiresAt: "2027-01-01",
    });
    expect(asset.breakdown.map((b) => b.reason)).not.toContain("expiryDate");
    expect(asset.breakdown.map((b) => b.reason)).not.toContain("minQuantity");
    expect(asset.breakdown.map((b) => b.reason)).toEqual(
      expect.arrayContaining(["location", "serial", "warrantyExpiresAt"]),
    );
  });

  it("토스트용 델타: 이미 채워진 필드는 previous 대비 제외", () => {
    const prev = {
      itemType: "CONSUMABLE" as const,
      locationId: "loc1",
      barcodes: [{ source: "EXISTING" as const }],
    };
    const next = { ...prev, categoryId: "cat1", price: 100 };
    const delta = computeQualityXp(next, prev);
    expect(delta.breakdown.map((b) => b.reason)).toEqual(["category", "price"]);
    expect(delta.total).toBe(QUALITY_XP.category + QUALITY_XP.price);
  });

  it("파생 합계라 비웠다 채워도 가구 총점은 안 오른다", () => {
    const filled = {
      itemType: "CONSUMABLE" as const,
      locationId: "loc1",
    };
    const empty = { itemType: "CONSUMABLE" as const, locationId: null };
    const before = sumQualityXp([filled]);
    const afterToggle = sumQualityXp([empty]);
    const restored = sumQualityXp([filled]);
    expect(before).toBe(QUALITY_XP.location);
    expect(afterToggle).toBe(0);
    expect(restored).toBe(before);
  });
});

describe("sumQualityXp", () => {
  it("아이템 상태 합", () => {
    expect(
      sumQualityXp([
        { itemType: "CONSUMABLE", locationId: "a" },
        { itemType: "ASSET", locationId: "b", barcodes: [{ source: "SERIAL" }] },
      ]),
    ).toBe(QUALITY_XP.location + QUALITY_XP.location + QUALITY_XP.serial);
  });
});

describe("computeConfirmXp", () => {
  it("위치·수량 모두 맞으면 합산", () => {
    const both = computeConfirmXp({ locationMatched: true, quantityMatched: true });
    expect(both.total).toBe(50);
    expect(both.breakdown).toHaveLength(2);
  });

  it("위치만 맞으면 수량 XP 없음", () => {
    const only = computeConfirmXp({ locationMatched: true, quantityMatched: false });
    expect(only.breakdown.map((b) => b.reason)).toEqual(["confirmLocation"]);
  });
});
