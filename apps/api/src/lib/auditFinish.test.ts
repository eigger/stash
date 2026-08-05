import { describe, expect, it } from "vitest";
import { buildFinishPlans } from "../routes/audit.js";

describe("buildFinishPlans", () => {
  const pending = [
    { id: "c1", itemId: "i1", item: { quantity: 2, deletedAt: null } },
    { id: "c2", itemId: "i2", item: { quantity: 1, deletedAt: null } },
  ];

  it("default MOVE without target fails before any mutation plan", () => {
    expect(buildFinishPlans(pending, "MOVE", undefined, [])).toEqual({
      ok: false,
      reason: "move_target_required",
    });
  });

  it("exception MOVE without target fails even when default is ZERO", () => {
    expect(
      buildFinishPlans(pending, "ZERO", undefined, [{ itemId: "i2", action: "MOVE" }]),
    ).toEqual({ ok: false, reason: "move_target_required" });
  });

  it("exception MOVE can inherit default moveToLocationId", () => {
    const result = buildFinishPlans(pending, "ZERO", "loc-b", [
      { itemId: "i2", action: "MOVE" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plans[1]).toMatchObject({ itemId: "i2", action: "MOVE", moveTo: "loc-b" });
  });

  it("builds ZERO/LEAVE plans", () => {
    const result = buildFinishPlans(pending, "LEAVE", undefined, [
      { itemId: "i1", action: "ZERO" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plans.map((p) => p.action)).toEqual(["ZERO", "LEAVE"]);
  });
});
