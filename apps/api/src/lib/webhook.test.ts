import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildLabelImageUrl, buildWebhookPayload } from "./webhook.js";

describe("buildLabelImageUrl", () => {
  const originalEnv = process.env.APP_PUBLIC_URL;

  afterEach(() => {
    process.env.APP_PUBLIC_URL = originalEnv;
  });

  it("builds a public label.png URL from APP_PUBLIC_URL", () => {
    process.env.APP_PUBLIC_URL = "https://stash.example.com";
    expect(buildLabelImageUrl("barcode123")).toBe("https://stash.example.com/api/barcodes/barcode123/label.png");
  });

  it("strips a trailing slash from APP_PUBLIC_URL", () => {
    process.env.APP_PUBLIC_URL = "https://stash.example.com/";
    expect(buildLabelImageUrl("barcode123")).toBe("https://stash.example.com/api/barcodes/barcode123/label.png");
  });

  it("falls back to localhost:3000 when APP_PUBLIC_URL is unset", () => {
    delete process.env.APP_PUBLIC_URL;
    expect(buildLabelImageUrl("barcode123")).toBe("http://localhost:3000/api/barcodes/barcode123/label.png");
  });
});

describe("buildWebhookPayload", () => {
  beforeEach(() => {
    process.env.APP_PUBLIC_URL = "https://stash.example.com";
  });

  it("includes the primary barcode's value/symbology and a label image URL", () => {
    const payload = buildWebhookPayload("item.updated", {
      id: "item1",
      name: "우유",
      quantity: 2,
      unit: "개",
      locationId: "loc1",
      location: { name: "냉장고" },
      barcodes: [
        { id: "b1", value: "111", symbology: "OTHER", isPrimary: false },
        { id: "b2", value: "8801234567890", symbology: "EAN13", isPrimary: true },
      ],
    });

    expect(payload).toMatchObject({
      event: "item.updated",
      itemId: "item1",
      name: "우유",
      quantity: 2,
      unit: "개",
      locationId: "loc1",
      locationName: "냉장고",
      barcodeValue: "8801234567890",
      symbology: "EAN13",
      labelImageUrl: "https://stash.example.com/api/barcodes/b2/label.png",
    });
    expect(typeof payload.timestamp).toBe("string");
  });

  it("falls back to the first barcode when none is marked primary", () => {
    const payload = buildWebhookPayload("item.print_requested", {
      id: "item2",
      name: "물티슈",
      quantity: 1,
      unit: null,
      locationId: null,
      barcodes: [{ id: "b3", value: "222", symbology: "CODE128", isPrimary: false }],
    });

    expect(payload.barcodeValue).toBe("222");
    expect(payload.labelImageUrl).toBe("https://stash.example.com/api/barcodes/b3/label.png");
  });

  it("sends null barcode fields when the item has no barcode at all", () => {
    const payload = buildWebhookPayload("item.updated", {
      id: "item3",
      name: "새 물건",
      quantity: 1,
      unit: null,
      locationId: null,
      barcodes: [],
    });

    expect(payload.barcodeValue).toBeNull();
    expect(payload.symbology).toBeNull();
    expect(payload.labelImageUrl).toBeNull();
  });
});
