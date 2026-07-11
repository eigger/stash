import { describe, expect, it } from "vitest";
import { encodeCsvRow, parseCsv } from "./csv.js";

describe("encodeCsvRow", () => {
  it("joins plain fields with commas", () => {
    expect(encodeCsvRow(["a", 1, null, undefined])).toBe("a,1,,\r\n");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    expect(encodeCsvRow(['has,comma', 'has"quote', "has\nnewline"])).toBe(
      '"has,comma","has""quote","has\nnewline"\r\n',
    );
  });
});

describe("parseCsv", () => {
  it("parses a simple header + row", () => {
    expect(parseCsv("name,quantity\n우유,2\n")).toEqual([
      ["name", "quantity"],
      ["우유", "2"],
    ]);
  });

  it("handles quoted fields with embedded commas and escaped quotes", () => {
    const text = 'name,notes\n"우유","브랜드: ""서울우유"", 1L"\n';
    expect(parseCsv(text)).toEqual([
      ["name", "notes"],
      ["우유", '브랜드: "서울우유", 1L'],
    ]);
  });

  it("ignores trailing blank lines", () => {
    expect(parseCsv("name\na\nb\n\n")).toEqual([["name"], ["a"], ["b"]]);
  });
});
