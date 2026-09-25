import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  STORE_WALK_ORDER,
  aislePosition,
  aisleRawValue,
  isUnplaced,
  parseAisleOverrides,
  sortAisleGroupNames,
  typicalStoreAisleNames,
  type WalkOrderContext,
} from "./storeWalkOrder";
import { AISLE_DISPLAY_NAMES } from "./effectiveFood";

const custom = (aisles: Array<[string, number, string?]>): WalkOrderContext => ({
  kind: "custom",
  storeId: "store-1",
  aisles: aisles.map(([aisle_name, sort_order, aisle_number], i) => ({
    id: `a${i}`,
    aisle_name,
    sort_order,
    aisle_number: aisle_number ?? null,
  })),
});

describe("STORE_WALK_ORDER", () => {
  it("matches storeWalkOrder in GroceryAisle.swift for every raw value", () => {
    const swift = readFileSync(
      path.resolve(__dirname, "../../ios/EatPal/EatPal/Models/GroceryAisle.swift"),
      "utf8",
    );
    const block = swift.slice(swift.indexOf("var storeWalkOrder"));
    const cases = [...swift.matchAll(/case (\w+)(?: = "(\w+)")?\n/g)].map((m) => [m[1], m[2] ?? m[1]]);
    const rawByCase = Object.fromEntries(cases);
    const swiftOrder: Record<string, number> = {};
    for (const m of block.matchAll(/case \.(\w+): return (\d+)/g)) swiftOrder[rawByCase[m[1]]] = Number(m[2]);
    expect(swiftOrder).toEqual(STORE_WALK_ORDER);
    expect(Object.keys(STORE_WALK_ORDER).sort()).toEqual(Object.keys(AISLE_DISPLAY_NAMES).sort());
  });

  it("maps display names back to raw values", () => {
    expect(aisleRawValue("Meat & Deli")).toBe("meat_deli");
    expect(aisleRawValue("canned goods")).toBe("canned");
    expect(aisleRawValue("frozen_veg")).toBe("frozen_veg");
    expect(aisleRawValue("Spaceship parts")).toBeNull();
  });
});

describe("sortAisleGroupNames", () => {
  it("uses the universal order with no store", () => {
    expect(sortAisleGroupNames(["Snacks", "Dairy", "Produce", "Frozen Meals"], null)).toEqual([
      "Produce",
      "Dairy",
      "Frozen Meals",
      "Snacks",
    ]);
  });

  it("puts Uncategorized last, even after unmatched names", () => {
    expect(sortAisleGroupNames(["Uncategorized", "Mystery", "Produce", "Other"], null)).toEqual([
      "Produce",
      "Other",
      "Mystery",
      "Uncategorized",
    ]);
  });

  it("walks a custom store by sort_order, matching names loosely", () => {
    const ctx = custom([
      ["dairy", 1],
      ["  Meat &  Deli ", 2],
      ["PRODUCE", 3],
    ]);
    expect(sortAisleGroupNames(["Produce", "Meat & Deli", "Dairy", "Uncategorized"], ctx)).toEqual([
      "Dairy",
      "Meat & Deli",
      "Produce",
      "Uncategorized",
    ]);
  });

  it("puts names a custom store does not have after the ones it does", () => {
    const ctx = custom([["Produce", 5]]);
    expect(sortAisleGroupNames(["Snacks", "Bakery", "Produce"], ctx)).toEqual(["Produce", "Bakery", "Snacks"]);
  });

  it("applies a catalog chain's aisle_overrides on top of the universal order", () => {
    const ctx: WalkOrderContext = {
      kind: "catalog",
      storeId: "trader-joes",
      overrides: parseAisleOverrides({ frozen_meals: 30, produce: 200, bogus: "x" }),
    };
    expect(sortAisleGroupNames(["Produce", "Dairy", "Frozen Meals", "Bakery"], ctx)).toEqual([
      "Bakery",
      "Frozen Meals",
      "Dairy",
      "Produce",
    ]);
  });

  it("breaks ties by name", () => {
    const ctx = custom([
      ["Zucchini corner", 1],
      ["Apple wall", 1],
    ]);
    expect(sortAisleGroupNames(["Zucchini corner", "Apple wall"], ctx)).toEqual(["Apple wall", "Zucchini corner"]);
    expect(sortAisleGroupNames(["Zeta", "Alpha"], null)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("aislePosition", () => {
  it("reports a custom store's aisle number and place in the walk", () => {
    const ctx = custom([
      ["Dairy", 20, "7"],
      ["Produce", 10, "1"],
    ]);
    expect(aislePosition("dairy", ctx)).toEqual({ aisleNumber: "7", index: 1, total: 2 });
    expect(aislePosition("Snacks", ctx)).toBeNull();
    expect(aislePosition("Uncategorized", ctx)).toBeNull();
  });

  it("places universal aisles with no number", () => {
    expect(aislePosition("Produce", null)).toEqual({ aisleNumber: null, index: 0, total: 33 });
  });
});

describe("isUnplaced", () => {
  const ctx = custom([["Produce", 1]]);

  it("is true only for a custom store that lacks the aisle", () => {
    expect(isUnplaced("Snacks", ctx)).toBe(true);
    expect(isUnplaced(null, ctx)).toBe(true);
    expect(isUnplaced("produce", ctx)).toBe(false);
  });

  it("is false for the typical store, a catalog chain and an empty custom store", () => {
    expect(isUnplaced("Snacks", null)).toBe(false);
    expect(isUnplaced("Snacks", { kind: "catalog", storeId: "c", overrides: {} })).toBe(false);
    expect(isUnplaced("Snacks", custom([]))).toBe(false);
  });
});

describe("typicalStoreAisleNames", () => {
  it("seeds the universal aisles in walk order without the catch-all", () => {
    const names = typicalStoreAisleNames();
    expect(names[0]).toBe("Produce");
    expect(names).not.toContain("Other");
    expect(names).toHaveLength(32);
  });
});
