import { describe, it, expect } from "vitest";
import {
  CSV_MAX_BYTES,
  checkCsvFile,
  normalizeFoodCategory,
  parseCsv,
  parseCsvWithHeaders,
} from "./csv";

describe("parseCsv (RFC 4180)", () => {
  it("strips the byte-order mark Excel writes in front of the first header", () => {
    const excel = "\uFEFFname,category\r\nApple,fruit\r\n";
    const { headers, rows } = parseCsvWithHeaders(excel);
    expect(headers).toEqual(["name", "category"]);
    expect(rows).toEqual([{ rowNumber: 2, values: { name: "Apple", category: "fruit" } }]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('name,notes\n"Rice, brown",plain\n')).toEqual([
      ["name", "notes"],
      ["Rice, brown", "plain"],
    ]);
  });

  it('reads "" inside quotes as one quote character', () => {
    expect(parseCsv('name\n"The ""good"" yogurt"\n')).toEqual([["name"], ['The "good" yogurt']]);
  });

  it("handles CRLF without leaving a carriage return on the last column", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(rows.flat().some((f) => f.includes("\r"))).toBe(false);
  });

  it("drops an empty trailing line and blank lines", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a line break inside a quoted field", () => {
    expect(parseCsv('name,steps\nToast,"Toast bread\nAdd butter"\n')).toEqual([
      ["name", "steps"],
      ["Toast", "Toast bread\nAdd butter"],
    ]);
  });

  it("keeps an empty last field", () => {
    expect(parseCsv("a,b,c\n1,,\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", ""],
    ]);
  });

  it("numbers data rows the way a spreadsheet does", () => {
    const { rows } = parseCsvWithHeaders("name\nA\nB\n");
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });
});

describe("checkCsvFile", () => {
  it("accepts .CSV in any case and a blank or csv MIME type", () => {
    expect(checkCsvFile({ name: "FOODS.CSV", type: "", size: 10 })).toBeNull();
    expect(checkCsvFile({ name: "foods.csv", type: "text/csv", size: 10 })).toBeNull();
  });

  it("rejects other files and anything over 2 MB", () => {
    expect(checkCsvFile({ name: "foods.xlsx", type: "", size: 10 })).toBe("not-csv");
    expect(checkCsvFile({ name: "foods.csv", type: "image/png", size: 10 })).toBe("not-csv");
    expect(checkCsvFile({ name: "foods.csv", type: "text/csv", size: CSV_MAX_BYTES + 1 })).toBe(
      "too-large"
    );
  });
});

describe("normalizeFoodCategory", () => {
  it("lower-cases, trims and maps plurals", () => {
    expect(normalizeFoodCategory(" Fruits ")).toBe("fruit");
    expect(normalizeFoodCategory("CARBS")).toBe("carb");
    expect(normalizeFoodCategory("Vegetable")).toBe("vegetable");
  });

  it("returns undefined for blank or unknown text so a default applies", () => {
    expect(normalizeFoodCategory("")).toBeUndefined();
    expect(normalizeFoodCategory("   ")).toBeUndefined();
    expect(normalizeFoodCategory("dessert")).toBeUndefined();
    expect(normalizeFoodCategory(undefined)).toBeUndefined();
  });
});
