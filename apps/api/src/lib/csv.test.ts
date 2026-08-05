import { describe, expect, it } from "vitest";
import { encodeCsvRow, parseCsv, stripCsvFormulaGuard } from "./csv.js";

describe("encodeCsvRow", () => {
  it("joins plain fields with commas", () => {
    expect(encodeCsvRow(["a", 1, null, undefined])).toBe("a,1,,\r\n");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    expect(encodeCsvRow(["has,comma", 'has"quote', "has\nnewline"])).toBe(
      '"has,comma","has""quote","has\nnewline"\r\n',
    );
  });

  it("neutralizes formula-like string values with a leading single quote", () => {
    expect(encodeCsvRow(["=cmd", "+1", "@SUM(A1)", "-5", "\t시작"])).toBe(
      "'=cmd,'+1,'@SUM(A1),'-5,'\t시작\r\n",
    );
  });

  it("does not alter numeric negatives (price/quantity columns)", () => {
    expect(encodeCsvRow(["item", -5, 1.5])).toBe("item,-5,1.5\r\n");
  });

  it("still quotes formula values that also contain commas", () => {
    expect(encodeCsvRow(['=HYPERLINK("http://x","a,b")'])).toBe(
      `"'=HYPERLINK(""http://x"",""a,b"")"\r\n`,
    );
  });
});

describe("stripCsvFormulaGuard", () => {
  it("strips a single leading quote only when the next char is formula-like", () => {
    expect(stripCsvFormulaGuard("'=cmd")).toBe("=cmd");
    expect(stripCsvFormulaGuard("'-5")).toBe("-5");
    expect(stripCsvFormulaGuard("'hello")).toBe("'hello");
    expect(stripCsvFormulaGuard("normal")).toBe("normal");
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

  it("round-trips formula-guarded names via stripCsvFormulaGuard", () => {
    const exported = encodeCsvRow(["=HYPERLINK", "ok"]);
    const [[name, notes]] = parseCsv(exported);
    expect(stripCsvFormulaGuard(name)).toBe("=HYPERLINK");
    expect(stripCsvFormulaGuard(notes)).toBe("ok");
  });
});
