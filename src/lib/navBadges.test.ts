import { describe, it, expect } from "vitest";
import type { GroceryItem, PlanEntry } from "@/types";
import {
  countBadge,
  countGroceryLeft,
  countPastDueUnlogged,
  formatBadgeCount,
  isDinnerUnplanned,
  nextBadgeBoundary,
} from "./navBadges";
import { navBadgeFor } from "./navigation";

const TODAY = "2026-09-24";
const at = (hour: number, minute = 0) => new Date(2026, 8, 24, hour, minute);

let seq = 0;
function entry(p: Partial<PlanEntry> & Pick<PlanEntry, "kid_id" | "meal_slot">): PlanEntry {
  seq += 1;
  return { id: `e${seq}`, date: TODAY, food_id: `f${seq}`, result: null, ...p } as PlanEntry;
}

function item(p: Partial<GroceryItem>): GroceryItem {
  seq += 1;
  return { id: `g${seq}`, name: "milk", quantity: 1, unit: "", checked: false, category: "dairy", ...p } as GroceryItem;
}

describe("countGroceryLeft", () => {
  it("counts unchecked items on the default list, null-list rows included", () => {
    const items = [
      item({ grocery_list_id: "default" }),
      item({ grocery_list_id: undefined }),
      item({ grocery_list_id: "default", checked: true }),
      item({ grocery_list_id: "party" }),
    ];
    expect(countGroceryLeft(items, "default")).toBe(2);
  });

  it("counts every unchecked item while the default list is unknown, like Home does", () => {
    const items = [item({ grocery_list_id: "a" }), item({ grocery_list_id: "b" }), item({ checked: true })];
    expect(countGroceryLeft(items, null)).toBe(2);
  });
});

describe("isDinnerUnplanned", () => {
  const kids = [{ id: "maya" }, { id: "leo" }];

  it("is true when no kid has a dinner today", () => {
    const entries = [entry({ kid_id: "maya", meal_slot: "lunch" }), entry({ kid_id: "maya", meal_slot: "dinner", date: "2026-09-25" })];
    expect(isDinnerUnplanned(entries, kids, TODAY)).toBe(true);
  });

  it("is false once any kid in scope has dinner today", () => {
    expect(isDinnerUnplanned([entry({ kid_id: "leo", meal_slot: "dinner" })], kids, TODAY)).toBe(false);
  });

  it("ignores a dinner for a kid outside the scope", () => {
    expect(isDinnerUnplanned([entry({ kid_id: "leo", meal_slot: "dinner" })], [{ id: "maya" }], TODAY)).toBe(true);
  });

  it("reads a timestamped date by its day", () => {
    const e = entry({ kid_id: "maya", meal_slot: "dinner", date: `${TODAY}T00:00:00` });
    expect(isDinnerUnplanned([e], kids, TODAY)).toBe(false);
  });

  it("stays quiet with no kids: the setup checklist owns that", () => {
    expect(isDinnerUnplanned([], [], TODAY)).toBe(false);
  });
});

describe("countPastDueUnlogged", () => {
  const kids = [{ id: "maya" }, { id: "leo" }];
  const day = [
    entry({ kid_id: "maya", meal_slot: "breakfast" }),
    entry({ kid_id: "leo", meal_slot: "breakfast", result: "ate" }),
    entry({ kid_id: "maya", meal_slot: "lunch" }),
    entry({ kid_id: "leo", meal_slot: "lunch" }),
    entry({ kid_id: "maya", meal_slot: "dinner" }),
    entry({ kid_id: "maya", meal_slot: "try_bite" }),
    entry({ kid_id: "maya", meal_slot: "breakfast", date: "2026-09-23" }),
  ];

  it("counts per kid and slot once the hour has passed and nothing is logged", () => {
    // 13:00: Maya's breakfast and lunch, Leo's lunch. Leo ate breakfast.
    expect(countPastDueUnlogged(day, kids, at(13), TODAY)).toBe(3);
  });

  it("does not count a meal before its hour", () => {
    expect(countPastDueUnlogged(day, kids, at(6), TODAY)).toBe(0);
    expect(countPastDueUnlogged(day, kids, at(18), TODAY)).toBe(4);
  });

  it("leaves out try-bites and other days", () => {
    expect(countPastDueUnlogged(day, [{ id: "maya" }], at(23), TODAY)).toBe(3);
  });
});

describe("nextBadgeBoundary", () => {
  it("is the next slot hour today", () => {
    expect(nextBadgeBoundary(at(11, 30))).toEqual(at(12));
    expect(nextBadgeBoundary(at(7))).toEqual(at(10));
  });

  it("is local midnight after the last slot", () => {
    expect(nextBadgeBoundary(at(19))).toEqual(new Date(2026, 8, 25, 0, 0));
  });
});

describe("badge values", () => {
  it("drops a zero count", () => {
    expect(countBadge(0)).toBeUndefined();
    expect(countBadge(3)).toEqual({ kind: "count", count: 3 });
  });

  it("caps the figure at 99+", () => {
    expect(formatBadgeCount(7)).toBe("7");
    expect(formatBadgeCount(99)).toBe("99");
    expect(formatBadgeCount(100)).toBe("99+");
  });

  it("navBadgeFor reads the item's key and hides zero", () => {
    expect(navBadgeFor({ badge: "groceryLeft" }, { groceryLeft: { kind: "count", count: 2 } })).toEqual({
      kind: "count",
      count: 2,
    });
    expect(navBadgeFor({ badge: "groceryLeft" }, { groceryLeft: { kind: "count", count: 0 } })).toBeUndefined();
    expect(navBadgeFor({}, { groceryLeft: { kind: "count", count: 2 } })).toBeUndefined();
    expect(navBadgeFor({ badge: "dinnerUnplanned" }, undefined)).toBeUndefined();
  });
});
