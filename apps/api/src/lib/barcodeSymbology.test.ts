import { describe, expect, it } from "vitest";
import { guessSymbology } from "./barcodeSymbology.js";

describe("guessSymbology", () => {
  it("detects EAN13 for 13-digit values", () => {
    expect(guessSymbology("0049000028911")).toBe("EAN13");
  });

  it("detects UPCA for 12-digit values", () => {
    expect(guessSymbology("012345678905")).toBe("UPCA");
  });

  it("detects CODE128 for other numeric values with 6+ digits", () => {
    expect(guessSymbology("123456")).toBe("CODE128");
    expect(guessSymbology("1234567890")).toBe("CODE128");
  });

  it("falls back to OTHER for short or non-numeric values", () => {
    expect(guessSymbology("12345")).toBe("OTHER");
    expect(guessSymbology("HD-abc123")).toBe("OTHER");
    expect(guessSymbology("http://localhost:3000/i/abc123")).toBe("OTHER");
  });
});
