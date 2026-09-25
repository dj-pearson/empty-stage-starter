import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import { toISODate } from "@/lib/date-utils";

const state: {
  kids: Kid[];
  activeKidId: string | null;
  foods: Food[];
  recipes: Recipe[];
  planEntries: PlanEntry[];
} = { kids: [], activeKidId: null, foods: [], recipes: [], planEntries: [] };

vi.mock("@/contexts/AppContext", () => ({
  useKids: () => ({ kids: state.kids, activeKidId: state.activeKidId }),
  useFoods: () => ({ foods: state.foods }),
  useRecipes: () => ({ recipes: state.recipes }),
  usePlan: () => ({ planEntries: state.planEntries }),
}));

import { useTonightPlan } from "./useTonightPlan";

const TODAY = toISODate(new Date());

const food = (id: string, name: string, allergens?: string[]): Food => ({
  id,
  name,
  category: "protein",
  is_safe: true,
  is_try_bite: false,
  ...(allergens ? { allergens } : {}),
});

const dinner = (id: string, kidId: string, foodId: string, recipeId: string, primary = false): PlanEntry => ({
  id,
  kid_id: kidId,
  date: TODAY,
  meal_slot: "dinner",
  food_id: foodId,
  recipe_id: recipeId,
  is_primary_dish: primary,
  result: null,
});

beforeEach(() => {
  state.foods = [food("chicken", "Chicken", []), food("sauce", "Peanut sauce", ["peanut"])];
  state.recipes = [{ id: "satay", name: "Chicken satay", food_ids: ["chicken", "sauce"] } as Recipe];
  state.kids = [
    { id: "maya", name: "Maya", age: 5, allergens: ["Peanuts"] } as Kid,
    { id: "leo", name: "Leo", age: 3, allergens: [] } as Kid,
  ];
  state.activeKidId = null;
  state.planEntries = [
    dinner("m1", "maya", "chicken", "satay", true),
    dinner("m2", "maya", "sauce", "satay"),
    dinner("l1", "leo", "chicken", "satay", true),
    dinner("l2", "leo", "sauce", "satay"),
  ];
});

describe("useTonightPlan", () => {
  it("gives one row per kid in Family mode", () => {
    const { result } = renderHook(() => useTonightPlan());
    expect(result.current.rows.map((r) => r.kid.name)).toEqual(["Maya", "Leo"]);
    expect(result.current.rows.every((r) => r.dishName === "Chicken satay")).toBe(true);
    expect(result.current.anyDinner).toBe(true);
  });

  it("narrows to the active kid when one is picked", () => {
    state.activeKidId = "leo";
    const { result } = renderHook(() => useTonightPlan());
    expect(result.current.rows.map((r) => r.kid.id)).toEqual(["leo"]);
  });

  it("reports an allergen hit through canonical matching (Peanuts vs peanut)", () => {
    const { result } = renderHook(() => useTonightPlan());
    const maya = result.current.rows.find((r) => r.kid.id === "maya");
    const leo = result.current.rows.find((r) => r.kid.id === "leo");
    expect(maya?.allergenStatus).toBe("hit");
    expect(maya?.conflicts.map((c) => c.food.name)).toEqual(["Peanut sauce"]);
    expect(leo?.allergenStatus).toBe("safe");
    expect(result.current.allergenRows.map((r) => r.kid.id)).toEqual(["maya"]);
  });

  it("says unknown, never safe, for a kid with no allergy info", () => {
    state.kids = [{ id: "leo", name: "Leo", age: 3 } as Kid];
    state.planEntries = [dinner("l1", "leo", "chicken", "satay", true)];
    state.recipes = [{ id: "satay", name: "Chicken satay", food_ids: ["chicken"] } as Recipe];
    const { result } = renderHook(() => useTonightPlan());
    expect(result.current.rows[0].allergenStatus).toBe("unknown");
    expect(result.current.rows[0].fit?.safeForAll).toBe(false);
  });

  it("names a single-food dinner by its food and reports no dinner as null", () => {
    state.planEntries = [
      { id: "x", kid_id: "maya", date: TODAY, meal_slot: "dinner", food_id: "chicken", result: null },
    ];
    const { result } = renderHook(() => useTonightPlan());
    expect(result.current.rows[0].dishName).toBe("Chicken");
    expect(result.current.rows[1].dish).toBeNull();
    expect(result.current.rows[1].allergenStatus).toBeNull();
  });
});
