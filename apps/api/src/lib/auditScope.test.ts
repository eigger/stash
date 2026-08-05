import { describe, expect, it } from "vitest";
import { collectLocationIds, computeAuditProgress } from "./auditScope.js";

describe("collectLocationIds", () => {
  const locations = [
    { id: "home", parentId: null },
    { id: "kitchen", parentId: "home" },
    { id: "fridge", parentId: "kitchen" },
    { id: "garage", parentId: "home" },
  ];

  it("includeChildren=false면 루트만", () => {
    expect(collectLocationIds(locations, "kitchen", false)).toEqual(["kitchen"]);
  });

  it("includeChildren=true면 하위까지 DFS", () => {
    expect(collectLocationIds(locations, "home", true)).toEqual([
      "home",
      "kitchen",
      "fridge",
      "garage",
    ]);
  });

  it("중간 노드에서 시작하면 그 하위만", () => {
    expect(collectLocationIds(locations, "kitchen", true)).toEqual(["kitchen", "fridge"]);
  });
});

describe("computeAuditProgress", () => {
  it("기대 목록만 분모로 쓰고 UNEXPECTED은 따로", () => {
    expect(
      computeAuditProgress([
        { status: "PENDING" },
        { status: "PENDING" },
        { status: "FOUND" },
        { status: "UNEXPECTED" },
      ]),
    ).toEqual({ expectedTotal: 3, foundExpected: 1, pending: 2, unexpected: 1 });
  });
});
