import { describe, it, expect } from "vitest";
import type { PlanEntry } from "@/types";
import { groupSlot, isSubstitute, kidsOnFamilyMeal, entryKey } from "./familySlot";

let n = 0;
const row = (p: Partial<PlanEntry> & Pick<PlanEntry, "kid_id" | "food_id">): PlanEntry => ({
  id: p.id ?? `e${++n}`,
  date: "2026-09-24",
  meal_slot: "dinner",
  result: null,
  ...p,
});

describe("groupSlot", () => {
  it("groups a recipe's rows into one family key", () => {
    const entries = [
      row({ kid_id: "a", food_id: "pasta", recipe_id: "mac", is_primary_dish: true }),
      row({ kid_id: "a", food_id: "cheese", recipe_id: "mac" }),
      row({ kid_id: "b", food_id: "pasta", recipe_id: "mac", is_primary_dish: true }),
      row({ kid_id: "b", food_id: "cheese", recipe_id: "mac" }),
    ];
    const g = groupSlot(entries);
    expect(g.familyKey).toBe("mac");
    expect(g.familyTarget).toEqual({ kind: "recipe", id: "mac" });
    expect(g.perKid.get("a")?.rows).toHaveLength(2);
    expect(g.perKid.get("a")?.primary.food_id).toBe("pasta");
    expect(kidsOnFamilyMeal(g, ["a", "b"])).toEqual(["a", "b"]);
  });

  it("detects a kid on a substitute", () => {
    const entries = [
      row({ kid_id: "a", food_id: "pasta", recipe_id: "mac", is_primary_dish: true }),
      row({ kid_id: "b", food_id: "pasta", recipe_id: "mac", is_primary_dish: true }),
      row({ kid_id: "c", food_id: "toast" }),
    ];
    const g = groupSlot(entries);
    expect(g.familyKey).toBe("mac");
    expect(isSubstitute(g, "c")).toBe(true);
    expect(isSubstitute(g, "a")).toBe(false);
    expect(isSubstitute(g, "nobody")).toBe(false);
    expect(g.perKid.get("c")?.key).toBe("toast");
  });

  it("resolves mixed food and recipe rows by the primary, whatever the order", () => {
    const rows = [
      row({ id: "x1", kid_id: "a", food_id: "apple" }),
      row({ id: "x2", kid_id: "a", food_id: "cheese", recipe_id: "mac" }),
      row({ id: "x3", kid_id: "a", food_id: "pasta", recipe_id: "mac", is_primary_dish: true }),
    ];
    const forward = groupSlot(rows).perKid.get("a");
    const reversed = groupSlot([...rows].reverse()).perKid.get("a");
    expect(forward?.primary.id).toBe("x3");
    expect(reversed?.primary.id).toBe("x3");
    expect(forward?.key).toBe("mac");
    expect(forward?.rows.map((r) => r.id).sort()).toEqual(["x2", "x3"]);
    expect(forward?.allRows).toHaveLength(3);
  });

  it("breaks a tie between a food and a recipe toward the recipe", () => {
    const g = groupSlot([
      row({ kid_id: "a", food_id: "toast" }),
      row({ kid_id: "b", food_id: "pasta", recipe_id: "mac", is_primary_dish: true }),
    ]);
    expect(g.familyKey).toBe("mac");
  });

  it("is empty for an empty slot", () => {
    const g = groupSlot([]);
    expect(g.familyKey).toBeNull();
    expect(g.perKid.size).toBe(0);
  });

  it("keys a plain food row by its food", () => {
    expect(entryKey(row({ kid_id: "a", food_id: "f", recipe_id: null }))).toBe("f");
  });
});
