import { describe, it, expect } from "vitest";
import type { Food, PlanEntry, Recipe } from "@/types";
import {
  acceptanceWeight,
  buildResultIndex,
  getKidFoodFit,
  getKidRecipeFit,
  type KidFitKid,
} from "./kidFit";

const food = (p: Partial<Food> & Pick<Food, "id" | "name">): Food => ({
  category: "protein",
  is_safe: true,
  is_try_bite: false,
  ...p,
});

let seq = 0;
const entry = (p: Partial<PlanEntry> & Pick<PlanEntry, "kid_id" | "food_id" | "date">): PlanEntry => ({
  id: `e${++seq}`,
  meal_slot: "dinner",
  result: null,
  ...p,
});

const kid: KidFitKid = {
  id: "k1",
  allergens: ["peanuts", "sesame"],
  disliked_foods: ["f-broc", "Mushrooms "],
  always_eats_foods: ["f-pasta", "apple slices"],
};

describe("getKidFoodFit", () => {
  it("flags an allergen hit across OFF spelling", () => {
    const fit = getKidFoodFit(kid, food({ id: "f-bun", name: "Bun", allergens: ["en:sesame-seeds"] }), []);
    expect(fit.allergen).toBe("sesame");
  });

  it("matches a dislike by id and by name", () => {
    expect(getKidFoodFit(kid, food({ id: "f-broc", name: "Broccoli" }), []).disliked).toBe(true);
    expect(getKidFoodFit(kid, food({ id: "f-mush", name: "mushrooms" }), []).disliked).toBe(true);
    expect(getKidFoodFit(kid, food({ id: "f-rice", name: "Rice" }), []).disliked).toBe(false);
  });

  it("matches always_eats by id and by name", () => {
    expect(getKidFoodFit(kid, food({ id: "f-pasta", name: "Pasta" }), []).alwaysEats).toBe(true);
    expect(getKidFoodFit(kid, food({ id: "f-x", name: "Apple Slices" }), []).alwaysEats).toBe(true);
  });

  it("counts tries, ate and offers from this kid's history only", () => {
    const history = [
      entry({ kid_id: "k1", food_id: "f-rice", date: "2026-09-01", result: "ate" }),
      entry({ kid_id: "k1", food_id: "f-rice", date: "2026-09-03", result: "refused" }),
      entry({ kid_id: "k1", food_id: "f-rice", date: "2026-09-02", result: "ate" }),
      entry({ kid_id: "k1", food_id: "f-rice", date: "2026-09-05", result: null }),
      entry({ kid_id: "k2", food_id: "f-rice", date: "2026-09-06", result: "ate" }),
    ];
    const fit = getKidFoodFit(kid, food({ id: "f-rice", name: "Rice" }), history);
    expect(fit.tries).toBe(3);
    expect(fit.ate).toBe(2);
    expect(fit.offered).toBe(4);
    expect(fit.lastResult).toBe("refused");
  });
});

describe("getKidRecipeFit", () => {
  const foods = [
    food({ id: "f-pasta", name: "Pasta" }),
    food({ id: "f-pesto", name: "Pesto", allergens: ["tree nuts"] }),
    food({ id: "f-sauce", name: "Peanut sauce", allergens: ["Peanuts"] }),
  ];
  const foodById = new Map(foods.map((f) => [f.id, f]));

  it("reports the first allergen hit among the recipe foods", () => {
    const recipe: Pick<Recipe, "food_ids"> = { food_ids: ["f-pasta", "f-sauce", "f-pesto"] };
    expect(getKidRecipeFit(kid, recipe, foodById, []).allergen).toBe("peanut");
  });

  it("sums history over the recipe's foods", () => {
    const recipe: Pick<Recipe, "food_ids"> = { food_ids: ["f-pasta", "f-pesto"] };
    const history = [
      entry({ kid_id: "k1", food_id: "f-pasta", date: "2026-09-01", result: "ate" }),
      entry({ kid_id: "k1", food_id: "f-pesto", date: "2026-09-01", result: "tasted" }),
    ];
    const fit = getKidRecipeFit(kid, recipe, foodById, history);
    expect(fit.allergen).toBeNull();
    expect(fit.tries).toBe(2);
    expect(fit.ate).toBe(1);
    expect(fit.alwaysEats).toBe(false);
  });
});

describe("buildResultIndex / acceptanceWeight", () => {
  it("excludes entries on or after `before`", () => {
    const idx = buildResultIndex(
      [
        entry({ kid_id: "k1", food_id: "f", date: "2026-09-01", result: "ate" }),
        entry({ kid_id: "k1", food_id: "f", date: "2026-09-10", result: "ate" }),
      ],
      "k1",
      "2026-09-10",
    );
    expect(idx.get("f")?.ate).toBe(1);
  });

  it("orders ate > tasted > untried > refused", () => {
    const base = { tries: 1, ate: 0, tasted: 0, refused: 0, offered: 1, lastResult: null, lastDate: null };
    const ate = acceptanceWeight({ ...base, ate: 1 });
    const tasted = acceptanceWeight({ ...base, tasted: 1 });
    const untried = acceptanceWeight(undefined);
    const refused = acceptanceWeight({ ...base, refused: 1 });
    expect(ate).toBeGreaterThan(tasted);
    expect(tasted).toBeGreaterThan(untried);
    expect(untried).toBeGreaterThan(refused);
  });
});
