import { describe, expect, it } from "vitest";
import { computeConfirmXp, computeQualityXp, QUALITY_XP } from "@stash/shared";

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

  it("이미 채워진 필드는 수정 시 재지급하지 않는다", () => {
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
