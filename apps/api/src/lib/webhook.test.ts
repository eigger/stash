import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildLabelImageUrl,
  buildWebhookPayload,
  isWebhookRetryableFailure,
  signWebhookBody,
  webhookBackoffMs,
} from "./webhook.js";

describe("buildLabelImageUrl", () => {
  it("builds a public label.png URL from the given base URL", () => {
    expect(buildLabelImageUrl("barcode123", "https://stash.example.com")).toBe(
      "https://stash.example.com/api/barcodes/barcode123/label.png",
    );
  });

  it("strips a trailing slash from the base URL", () => {
    expect(buildLabelImageUrl("barcode123", "https://stash.example.com/")).toBe(
      "https://stash.example.com/api/barcodes/barcode123/label.png",
    );
  });
});

describe("buildWebhookPayload", () => {
  const baseUrl = "https://stash.example.com";

  it("includes the primary barcode's value/symbology and a label image URL", () => {
    const payload = buildWebhookPayload(
      "item.updated",
      {
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
      },
      baseUrl,
    );

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
    const payload = buildWebhookPayload(
      "item.print_requested",
      {
        id: "item2",
        name: "물티슈",
        quantity: 1,
        unit: null,
        locationId: null,
        barcodes: [{ id: "b3", value: "222", symbology: "CODE128", isPrimary: false }],
      },
      baseUrl,
    );

    expect(payload.barcodeValue).toBe("222");
    expect(payload.labelImageUrl).toBe("https://stash.example.com/api/barcodes/b3/label.png");
  });

  it("targets the given barcodeId instead of the primary one when provided", () => {
    const payload = buildWebhookPayload(
      "item.print_requested",
      {
        id: "item4",
        name: "건전지",
        quantity: 4,
        unit: "개",
        locationId: null,
        barcodes: [
          { id: "b4", value: "333", symbology: "OTHER", isPrimary: true },
          { id: "b5", value: "http://localhost/i/item4", symbology: "QR", isPrimary: false },
        ],
      },
      baseUrl,
      "b5",
    );

    expect(payload.barcodeValue).toBe("http://localhost/i/item4");
    expect(payload.symbology).toBe("QR");
    expect(payload.labelImageUrl).toBe("https://stash.example.com/api/barcodes/b5/label.png");
  });

  it("sends null barcode fields when the item has no barcode at all", () => {
    const payload = buildWebhookPayload(
      "item.updated",
      {
        id: "item3",
        name: "새 물건",
        quantity: 1,
        unit: null,
        locationId: null,
        barcodes: [],
      },
      baseUrl,
    );

    expect(payload.barcodeValue).toBeNull();
    expect(payload.symbology).toBeNull();
    expect(payload.labelImageUrl).toBeNull();
  });
});

describe("signWebhookBody", () => {
  it("produces a stable HMAC over timestamp.body", () => {
    const body = JSON.stringify({ event: "item.updated", itemId: "x" });
    const sig = signWebhookBody("test-secret", 1700000000, body);
    expect(sig).toBe(
      "sha256=" +
        createHmac("sha256", "test-secret").update(`1700000000.${body}`).digest("hex"),
    );
  });

  it("changes when the body or timestamp changes", () => {
    const a = signWebhookBody("s", 1, '{"a":1}');
    const b = signWebhookBody("s", 2, '{"a":1}');
    const c = signWebhookBody("s", 1, '{"a":2}');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("isWebhookRetryableFailure", () => {
  it("retries network errors (no status) and 5xx", () => {
    expect(isWebhookRetryableFailure(undefined)).toBe(true);
    expect(isWebhookRetryableFailure(500)).toBe(true);
    expect(isWebhookRetryableFailure(503)).toBe(true);
  });

  it("does not retry 4xx", () => {
    expect(isWebhookRetryableFailure(400)).toBe(false);
    expect(isWebhookRetryableFailure(404)).toBe(false);
    expect(isWebhookRetryableFailure(422)).toBe(false);
  });
});

describe("webhookBackoffMs", () => {
  it("uses 0 / 1s / 4s for the three planned attempts", () => {
    expect(webhookBackoffMs(0)).toBe(0);
    expect(webhookBackoffMs(1)).toBe(1000);
    expect(webhookBackoffMs(2)).toBe(4000);
  });
});
