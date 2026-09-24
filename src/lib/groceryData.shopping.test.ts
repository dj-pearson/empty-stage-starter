import { describe, it, expect } from "vitest";
import {
  filterItemsForKid,
  isRowForKid,
  kidsWithRows,
  nextAisleAfter,
  partitionForCheckout,
} from "./groceryData";
import type { GroceryItem } from "@/types";

const row = (id: string, name: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({
  id, name, checked: false, quantity: 1, unit: "", category: "snack", ...extra,
});

describe("partitionForCheckout (Item 16)", () => {
  it("keeps receipt-credited rows out of what checkout credits", () => {
    const rows = [row("a", "Milk", { pantry_credited_at: "2026-09-26T10:00:00Z" }), row("b", "Bread"), row("c", "Eggs", { pantry_credited_at: null })];
    const { toCredit, alreadyCredited } = partitionForCheckout(rows);
    expect(toCredit.map((r) => r.id)).toEqual(["b", "c"]);
    expect(alreadyCredited.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("kid filter (Item 42)", () => {
  const index = new Map<string, string[]>([
    ["apples", ["ava"]],
    ["pasta", ["ava", "sam"]],
    ["fish fingers", ["sam"]],
  ]);
  const items = [row("1", "Apples"), row("2", "Pasta "), row("3", "Fish fingers"), row("4", "Nappies")];

  it("keeps everything when no kid is chosen", () => {
    expect(filterItemsForKid(items, index, null)).toEqual({ shown: items, hidden: 0 });
  });

  it("keeps one kid's rows, drops hand-added ones, and counts what it hid", () => {
    const { shown, hidden } = filterItemsForKid(items, index, "ava");
    expect(shown.map((i) => i.id)).toEqual(["1", "2"]);
    expect(hidden).toBe(2);
    expect(isRowForKid(items[3], index, "ava")).toBe(false);
  });

  it("offers only kids who have a row on the list, in household order", () => {
    expect(kidsWithRows(items, index, ["sam", "ava", "zoe"])).toEqual(["sam", "ava"]);
    expect(kidsWithRows([items[3]], index, ["sam", "ava"])).toEqual([]);
  });
});

describe("nextAisleAfter (Item 18)", () => {
  const walk = ["Produce", "Bakery", "Dairy", "Frozen"];

  it("stays on the aisle while it still has rows", () => {
    expect(nextAisleAfter(walk, "Bakery", walk)).toBe("Bakery");
  });

  it("moves forward in the walk when the current aisle empties", () => {
    expect(nextAisleAfter(walk, "Bakery", ["Produce", "Dairy", "Frozen"])).toBe("Dairy");
    // Dairy emptied too before we got there: skip on to Frozen.
    expect(nextAisleAfter(walk, "Bakery", ["Produce", "Frozen"])).toBe("Frozen");
  });

  it("goes back for a skipped aisle when nothing after is left", () => {
    expect(nextAisleAfter(walk, "Frozen", ["Produce"])).toBe("Produce");
  });

  it("starts at the first aisle, and is null when the list is done", () => {
    expect(nextAisleAfter([], null, walk)).toBe("Produce");
    expect(nextAisleAfter(walk, "Frozen", [])).toBeNull();
  });
});
