import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  parseFoodRows,
  parseKidRows,
  parsePlanEntryRows,
  parseGroceryItemRows,
  parseFoodRow,
} from "./normalizeEntities";

describe("US-536: Zod validation at the data boundary", () => {
  it("parseFoodRows keeps valid rows and DROPS rows missing id or name", () => {
    const rows = [
      { id: "f1", name: "Milk", category: "dairy", is_safe: true },
      { name: "No id" }, // missing id -> dropped
      { id: "f3" }, // missing name -> dropped
      { id: "", name: "Empty id" }, // empty id -> dropped
      { id: "f5", name: "Eggs", category: null, is_safe: null }, // nullable fields OK
    ];
    const out = parseFoodRows(rows);
    expect(out.map((f) => f.id)).toEqual(["f1", "f5"]);
    expect(out[1].category).toBe("snack"); // null category defaulted by normalizer
  });

  it("parseFoodRow returns null for an invalid row", () => {
    expect(parseFoodRow({ name: "no id" } as Record<string, unknown>)).toBeNull();
    expect(parseFoodRow({ id: "ok", name: "Milk" } as Record<string, unknown>)?.id).toBe("ok");
  });

  it("parseKidRows drops rows without an id/name", () => {
    const out = parseKidRows([{ id: "k1", name: "Sam" }, { id: "k2" }, {}]);
    expect(out.map((k) => k.id)).toEqual(["k1"]);
  });

  it("parsePlanEntryRows requires id + kid_id", () => {
    const out = parsePlanEntryRows([
      { id: "p1", kid_id: "k1", date: "2026-06-01" },
      { id: "p2", date: "2026-06-01" }, // no kid_id -> dropped
      { kid_id: "k1" }, // no id -> dropped
    ]);
    expect(out.map((e) => e.id)).toEqual(["p1"]);
  });

  it("parseGroceryItemRows drops rows without id/name", () => {
    const out = parseGroceryItemRows([
      { id: "g1", name: "Milk", quantity: 2 },
      { id: "g2", quantity: 1 }, // no name -> dropped
    ]);
    expect(out.map((g) => g.id)).toEqual(["g1"]);
  });

  it("passes through unknown extra columns (a new DB column never rejects a row)", () => {
    const out = parseFoodRows([{ id: "f1", name: "Milk", brand_new_column: "x" }]);
    expect(out).toHaveLength(1);
  });
});
