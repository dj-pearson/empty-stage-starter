import { describe, it, expect } from "vitest";
import { buildWeekPlan, generateGroceryList } from "./mealPlanner";
import { resolveFood, type EffectiveFood } from "./effectiveFood";
import type { Food, MealSlot, PlanEntry } from "@/types";

const food = (id: string, over: Partial<Food> = {}): Food => ({
  id,
  name: id,
  category: "protein",
  unit: "servings",
  quantity: 0,
  is_safe: true,
  is_try_bite: false,
  ...over,
});

const effectiveOf = (foods: Food[]): Record<string, EffectiveFood> =>
  Object.fromEntries(foods.map((f) => [f.id, resolveFood(f, null)]));

/** Deterministic PRNG so a failure reproduces. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("generateGroceryList: family recipe dedupe", () => {
  const foods = [food("pasta", { name: "Pasta" }), food("sauce", { name: "Sauce" }), food("apple", { name: "Apple" })];

  it("counts a 3-kid family dinner once", () => {
    const entries: PlanEntry[] = ["k1", "k2", "k3"].flatMap((kid) =>
      ["pasta", "sauce"].map((f) => ({
        id: `${kid}-${f}`,
        kid_id: kid,
        date: "2026-09-08",
        meal_slot: "dinner" as MealSlot,
        food_id: f,
        recipe_id: "r-spag",
        result: null,
      })),
    );
    const rows = generateGroceryList(entries, foods, effectiveOf(foods));
    expect(rows.map((r) => [r.name, r.quantity]).sort()).toEqual([
      ["Pasta", 1],
      ["Sauce", 1],
    ]);
  });

  it("still counts plain foods per kid", () => {
    const entries: PlanEntry[] = ["k1", "k2", "k3"].map((kid) => ({
      id: `${kid}-apple`,
      kid_id: kid,
      date: "2026-09-08",
      meal_slot: "snack1",
      food_id: "apple",
      result: null,
    }));
    expect(generateGroceryList(entries, foods, effectiveOf(foods))[0].quantity).toBe(3);
  });

  it("counts the same recipe on two different days twice", () => {
    const entries: PlanEntry[] = ["2026-09-08", "2026-09-10"].map((date, i) => ({
      id: `e${i}`,
      kid_id: "k1",
      date,
      meal_slot: "dinner",
      food_id: "pasta",
      recipe_id: "r-spag",
      result: null,
    }));
    expect(generateGroceryList(entries, foods, effectiveOf(foods))[0].quantity).toBe(2);
  });
});

describe("buildWeekPlan: per-kid choosing", () => {
  const PANTRY: Food[] = [
    ...["chicken", "rice", "pasta", "eggs", "toast", "yogurt", "banana", "cheese"].map((id) => food(id)),
    food("broccoli"),
    food("pear", { is_safe: false, is_try_bite: true }),
    food("kiwi", { is_safe: false, is_try_bite: true }),
  ];
  const KID = { id: "maya", allergens: [], disliked_foods: ["broccoli", "Kiwi"], always_eats_foods: ["pasta"] };
  const START = new Date("2026-09-06T00:00:00");

  it("never places a disliked food, matched by id or by name", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const ids = new Set(buildWeekPlan(KID, PANTRY, [], START, seeded(seed)).map((e) => e.food_id));
      expect(ids.has("broccoli")).toBe(false);
      expect(ids.has("kiwi")).toBe(false);
    }
  });

  it("does not repeat a food in the same slot within 3 days", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const plan = buildWeekPlan(KID, PANTRY, [], START, seeded(seed));
      const bySlot = new Map<string, string[]>();
      for (const e of plan) {
        if (e.meal_slot === "try_bite") continue;
        const list = bySlot.get(e.meal_slot) ?? [];
        list.push(e.food_id);
        bySlot.set(e.meal_slot, list);
      }
      for (const [, ids] of bySlot) {
        for (let d = 0; d < ids.length; d++) {
          expect(ids[d]).not.toBe(ids[d + 1]);
          expect(ids[d]).not.toBe(ids[d + 2]);
        }
      }
    }
  });

  it("gives each day two different snacks", () => {
    const plan = buildWeekPlan(KID, PANTRY, [], START, seeded(7));
    const days = [...new Set(plan.map((e) => e.date))];
    for (const day of days) {
      const s1 = plan.find((e) => e.date === day && e.meal_slot === "snack1")?.food_id;
      const s2 = plan.find((e) => e.date === day && e.meal_slot === "snack2")?.food_id;
      expect(s1).not.toBe(s2);
    }
  });

  it("respects this kid's history just before the week, and ignores other kids'", () => {
    const history: PlanEntry[] = [
      // Maya had chicken for dinner yesterday: it may not open this week's dinners.
      { id: "h1", kid_id: "maya", date: "2026-09-05", meal_slot: "dinner", food_id: "chicken", result: "ate" },
      // A sibling had rice for dinner yesterday: that must not constrain Maya.
      { id: "h2", kid_id: "leo", date: "2026-09-05", meal_slot: "dinner", food_id: "rice", result: "ate" },
    ];
    let riceFirst = false;
    for (let seed = 1; seed <= 60; seed++) {
      const plan = buildWeekPlan(KID, PANTRY, history, START, seeded(seed));
      const firstDinner = plan.find((e) => e.date === "2026-09-06" && e.meal_slot === "dinner");
      expect(firstDinner?.food_id).not.toBe("chicken");
      if (firstDinner?.food_id === "rice") riceFirst = true;
    }
    expect(riceFirst).toBe(true);
  });

  it("weights toward foods the kid eats and away from refused ones", () => {
    const small: Food[] = [food("loved"), food("refused"), food("pear", { is_safe: false, is_try_bite: true })];
    const history: PlanEntry[] = [];
    for (let i = 0; i < 5; i++) {
      const date = `2026-08-0${i + 1}`;
      history.push({ id: `a${i}`, kid_id: "maya", date, meal_slot: "lunch", food_id: "loved", result: "ate" });
      history.push({ id: `r${i}`, kid_id: "maya", date, meal_slot: "lunch", food_id: "refused", result: "refused" });
    }
    let loved = 0;
    let refused = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const e of buildWeekPlan({ id: "maya" }, small, history, START, seeded(seed))) {
        if (e.food_id === "loved") loved++;
        if (e.food_id === "refused") refused++;
      }
    }
    expect(loved).toBeGreaterThan(refused);
  });
});
