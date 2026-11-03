import { describe, expect, it } from "vitest";
import { auditFinishSchema, itemInputSchema, itemUpdateSchema } from "@stash/shared";

describe("Zod 4 request compatibility", () => {
  it("keeps creation defaults without adding them to partial item updates", () => {
    expect(itemInputSchema.parse({ name: "Item" })).toMatchObject({
      quantity: 1,
      itemType: "CONSUMABLE",
    });
    expect(itemUpdateSchema.parse({})).toEqual({});
    expect(itemUpdateSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
  });

  it("validates explicit quantity and type updates", () => {
    expect(itemUpdateSchema.parse({ quantity: 0, itemType: "ASSET" })).toEqual({
      quantity: 0,
      itemType: "ASSET",
    });
    expect(itemUpdateSchema.safeParse({ quantity: -1 }).success).toBe(false);
    expect(itemUpdateSchema.safeParse({ itemType: "INVALID" }).success).toBe(false);
  });

  it("preserves the fieldErrors and formErrors response structure", () => {
    const result = itemInputSchema.safeParse({ name: "", quantity: -1 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Invalid item unexpectedly passed validation");
    expect(result.error.flatten()).toEqual({
      formErrors: [],
      fieldErrors: { name: [expect.any(String)], quantity: [expect.any(String)] },
    });
  });

  it("still rejects audit MOVE exceptions without a destination", () => {
    const result = auditFinishSchema.safeParse({
      defaultAction: "ZERO",
      exceptions: [{ itemId: "item-1", action: "MOVE" }],
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Invalid MOVE unexpectedly passed validation");
    expect(result.error.issues[0].path).toEqual(["exceptions", 0, "moveToLocationId"]);
  });
});
