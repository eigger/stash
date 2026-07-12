import { describe, expect, it } from "vitest";
import { buildLowStockMessage } from "./lowStockSummary.js";

describe("buildLowStockMessage", () => {
  it("lists every name when under the display limit", () => {
    const { title, body } = buildLowStockMessage(["우유", "계란"], 2);
    expect(title).toBe("재고부족 아이템 2개");
    expect(body).toBe("우유, 계란");
  });

  it("truncates the name list and counts the remainder", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G"];
    const { body } = buildLowStockMessage(names, names.length);
    expect(body).toBe("A, B, C, D, E 외 2개");
  });

  it("defaults to Korean when no locale is given", () => {
    expect(buildLowStockMessage(["우유"], 1)).toEqual(buildLowStockMessage(["우유"], 1, "ko"));
  });

  it("returns English wording for locale=en", () => {
    const { title, body } = buildLowStockMessage(["Milk", "Eggs"], 2, "en");
    expect(title).toBe("2 item(s) low on stock");
    expect(body).toBe("Milk, Eggs");
  });

  it("truncates with English wording for locale=en", () => {
    const names = ["A", "B", "C", "D", "E", "F"];
    const { body } = buildLowStockMessage(names, names.length, "en");
    expect(body).toBe("A, B, C, D, E and 1 more");
  });

  it("falls back to Korean for any locale other than en", () => {
    expect(buildLowStockMessage(["우유"], 1, "fr").title).toBe("재고부족 아이템 1개");
  });
});
