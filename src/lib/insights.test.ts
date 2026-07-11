import { describe, it, expect } from "vitest";
import { computeInsights, EMPTY_INSIGHTS } from "./insights";
import type { Food, Kid, PlanEntry } from "@/types";

const NOW = new Date("2026-06-30T00:00:00Z");
const recent = "2026-06-20"; // within 30 days of NOW
const old = "2026-01-01"; // outside window

const food = (id: string, over: Partial<Food> = {}): Food =>
  ({ id, name: id, category: "protein", is_safe: true, is_try_bite: false, allergens: [], ...over } as Food);
const kid = (id: string, over: Partial<Kid> = {}): Kid =>
  ({ id, name: id, allergens: [], ...over } as unknown as Kid);
const entry = (over: Partial<PlanEntry>): PlanEntry =>
  ({ id: Math.random().toString(), kid_id: "k1", date: recent, meal_slot: "dinner", food_id: "f1", result: "ate", ...over } as unknown as PlanEntry);

describe("computeInsights (US-540)", () => {
  it("returns EMPTY_INSIGHTS when no active kid and not family mode", () => {
    expect(computeInsights({ activeKid: undefined, isFamilyMode: false, kids: [], foods: [], planEntries: [], now: NOW }))
      .toEqual(EMPTY_INSIGHTS);
  });

  it("computes per-kid safe foods, coverage, and 30-day success metrics", () => {
    const foods: Food[] = [
      food("f1", { category: "protein", is_safe: true }),
      food("f2", { category: "fruit", is_safe: true, is_try_bite: true }),
      food("f3", { category: "protein", is_safe: true, allergens: ["peanut"] }), // unsafe for kid
    ];
    const activeKid = kid("k1", { allergens: ["peanut"] });
    const planEntries: PlanEntry[] = [
      entry({ food_id: "f1", result: "ate", date: recent }),
      entry({ food_id: "f2", result: "tasted", date: recent }),
      entry({ food_id: "f1", result: "refused", date: recent }),
      entry({ food_id: "f1", result: "ate", date: old }), // outside window, ignored
    ];
    const ins = computeInsights({ activeKid, isFamilyMode: false, kids: [activeKid], foods, planEntries, now: NOW });

    expect(ins.safeFoodsCount).toBe(2); // f1, f2 (f3 excluded by allergen)
    expect(ins.tryBitesCount).toBe(1); // f2
    expect(ins.totalTracked).toBe(3); // 3 recent entries
    expect(ins.completedMeals).toBe(1);
    expect(ins.tastedMeals).toBe(1);
    expect(ins.refusedMeals).toBe(1);
    expect(Math.round(ins.successRate)).toBe(67); // (1+1)/3
    expect(ins.uniqueFoodsTried).toBe(2); // f1, f2
    expect(ins.totalTryBites).toBe(1); // f2 entry
    expect(ins.successfulTryBites).toBe(1); // f2 tasted
    expect(ins.coverage?.find((c) => c.category === "protein")?.count).toBe(1); // only f1 safe protein
  });

  it("aggregates across the household in family mode", () => {
    const foods: Food[] = [food("f1", { is_safe: true }), food("f2", { is_safe: true, is_try_bite: true })];
    const planEntries: PlanEntry[] = [
      entry({ kid_id: "k1", result: "ate", date: recent }),
      entry({ kid_id: "k2", result: "refused", date: recent }),
    ];
    const kids = [kid("k1"), kid("k2")];
    const ins = computeInsights({ activeKid: undefined, isFamilyMode: true, kids, foods, planEntries, now: NOW });
    expect(ins.familyMode).toBe(true);
    expect(ins.totalTracked).toBe(2);
    expect(ins.coverage).toBeUndefined(); // no per-category coverage in family mode
  });
});
