import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import { useRecipeFilters, totalMinutes, type RecipeQuickFilter } from "./useRecipeFilters";

const food = (p: Partial<Food> & Pick<Food, "id" | "name">): Food => ({
  category: "protein",
  is_safe: true,
  is_try_bite: false,
  quantity: 1,
  ...p,
});
const recipe = (p: Partial<Recipe> & Pick<Recipe, "id" | "name">): Recipe => ({ food_ids: [], ...p });
const kid = (p: Partial<Kid> & Pick<Kid, "id">): Kid => ({ name: p.id, allergens: [], ...p });

let seq = 0;
const entry = (p: Partial<PlanEntry> & Pick<PlanEntry, "kid_id" | "food_id">): PlanEntry => ({
  id: `e${++seq}`,
  date: "2026-01-01",
  meal_slot: "dinner",
  result: null,
  ...p,
});

const ids = (rs: Recipe[]) => rs.map((r) => r.id);

beforeEach(() => {
  window.localStorage.clear();
});

describe("time", () => {
  it("excludes '1 hour' from Quick", () => {
    expect(totalMinutes({ prepTime: "1 hour" })).toBe(60);
    const recipes = [
      recipe({ id: "hour", name: "Hour", prepTime: "1 hour" }),
      recipe({ id: "fast", name: "Fast", prepTime: "10 min", cookTime: "15 min" }),
      recipe({ id: "none", name: "None" }),
    ];
    const { result } = renderHook(() => useRecipeFilters({ recipes, foods: [] }));
    act(() => result.current.toggleQuickFilter("quick"));
    expect(ids(result.current.filteredRecipes)).toEqual(["fast"]);
  });

  it("sorts a recipe with no time last by cook time", () => {
    const recipes = [
      recipe({ id: "none", name: "A none" }),
      recipe({ id: "long", name: "Long", cookTime: "1 hr 10 min" }),
      recipe({ id: "short", name: "Short", total_time_minutes: 20 }),
    ];
    const { result } = renderHook(() => useRecipeFilters({ recipes, foods: [] }));
    act(() => result.current.setSortBy("cook-time"));
    expect(ids(result.current.filteredRecipes)).toEqual(["short", "long", "none"]);
  });
});

describe("ready to cook", () => {
  it("does not count an imported recipe with empty food_ids", () => {
    const foods = [food({ id: "rice", name: "Rice" }), food({ id: "out", name: "Out", quantity: 0 })];
    const recipes = [
      recipe({
        id: "imported",
        name: "Imported",
        recipe_ingredients: [{ id: "ri", recipe_id: "imported", sort_order: 0, name: "Flour", food_id: null }],
      }),
      recipe({ id: "empty", name: "Empty" }),
      recipe({ id: "ready", name: "Ready", food_ids: ["rice"] }),
      recipe({ id: "short", name: "Short", food_ids: ["rice", "out"] }),
      recipe({ id: "gone", name: "Gone", food_ids: ["missing"] }),
    ];
    const { result } = renderHook(() => useRecipeFilters({ recipes, foods }));
    act(() => result.current.toggleQuickFilter("ready-to-cook"));
    expect(ids(result.current.filteredRecipes)).toEqual(["ready"]);
  });
});

describe("search", () => {
  it("finds a recipe by a recipe_ingredients name", async () => {
    const recipes = [
      recipe({
        id: "r1",
        name: "Pancakes",
        recipe_ingredients: [{ id: "ri", recipe_id: "r1", sort_order: 0, name: "Buttermilk", food_id: null }],
      }),
      recipe({ id: "r2", name: "Toast" }),
    ];
    const { result } = renderHook(() => useRecipeFilters({ recipes, foods: [] }));
    act(() => result.current.setSearchQuery("buttermilk"));
    await new Promise((r) => setTimeout(r, 350));
    expect(ids(result.current.filteredRecipes)).toEqual(["r1"]);
    expect(result.current.hasActiveFilters).toBe(true);

    // Clearing applies at once, with no debounce wait.
    act(() => result.current.setSearchQuery(""));
    expect(result.current.resultCount).toBe(2);
    expect(result.current.hasActiveFilters).toBe(false);
  });
});

describe("kid filters", () => {
  const foods = [
    food({ id: "pb", name: "Peanut butter", allergens: ["en:peanuts"] }),
    food({ id: "bread", name: "Bread" }),
    food({ id: "kale", name: "Kale", is_safe: false, is_try_bite: true }),
  ];
  const recipes = [
    recipe({ id: "pbj", name: "PBJ", food_ids: ["pb", "bread"] }),
    recipe({ id: "toast", name: "Toast", food_ids: ["bread"] }),
    recipe({ id: "mystery", name: "Mystery", food_ids: ["bread", "unknown-food"] }),
    recipe({ id: "kale", name: "Kale chips", food_ids: ["kale"] }),
  ];
  const kids = [kid({ id: "k1", allergens: ["peanuts"] })];

  it("allergen-safe excludes a hit and an unknown", () => {
    const { result } = renderHook(() => useRecipeFilters({ recipes, foods, kids }));
    act(() => result.current.toggleQuickFilter("allergen-safe"));
    expect(ids(result.current.filteredRecipes).sort()).toEqual(["kale", "toast"]);
    expect(result.current.fitByRecipeId.get("pbj")?.allergenStatus).toBe("hit");
    expect(result.current.fitByRecipeId.get("mystery")?.allergenStatus).toBe("unknown");
    expect(result.current.foodById.get("bread")?.name).toBe("Bread");
  });

  it("safe-foods and try-bite use the kid fit", () => {
    const { result } = renderHook(() => useRecipeFilters({ recipes, foods, kids }));
    act(() => result.current.toggleQuickFilter("safe-foods"));
    expect(ids(result.current.filteredRecipes)).toEqual(["toast"]);
    act(() => result.current.clearFilters());
    act(() => result.current.toggleQuickFilter("try-bite"));
    expect(ids(result.current.filteredRecipes)).toEqual(["kale"]);
  });

  it("maps a persisted 'kid-approved' to 'safe-foods'", () => {
    const { result } = renderHook(() =>
      useRecipeFilters({ recipes, foods, kids, initialQuickFilters: ["kid-approved"] }),
    );
    expect(result.current.quickFilters).toEqual<RecipeQuickFilter[]>(["safe-foods"]);
    expect(ids(result.current.filteredRecipes)).toEqual(["toast"]);
    act(() => result.current.toggleQuickFilter("kid-approved"));
    expect(result.current.quickFilters).toEqual([]);
  });

  it("defaults to best-fit with kids and no stored sort", () => {
    const { result } = renderHook(() => useRecipeFilters({ recipes, foods, kids }));
    expect(result.current.sortBy).toBe("best-fit");
    expect(ids(result.current.filteredRecipes)).toEqual(["toast", "kale", "mystery", "pbj"]);
  });
});

describe("stored preferences", () => {
  it("falls back to newest and grid when the stored values are invalid", () => {
    window.localStorage.setItem("recipe-sort", JSON.stringify("bogus"));
    window.localStorage.setItem("recipe-view", JSON.stringify("carousel"));
    const { result } = renderHook(() =>
      useRecipeFilters({ recipes: [], foods: [], kids: [kid({ id: "k" })] }),
    );
    expect(result.current.sortBy).toBe("newest");
    expect(result.current.viewMode).toBe("grid");
  });

  it("uses newest with no kids and no stored sort", () => {
    const { result } = renderHook(() => useRecipeFilters({ recipes: [], foods: [] }));
    expect(result.current.sortBy).toBe("newest");
  });
});

describe("kids-eat-most", () => {
  it("orders by history, with allergen hits last", () => {
    const foods = [
      food({ id: "rice", name: "Rice" }),
      food({ id: "peas", name: "Peas" }),
      food({ id: "beans", name: "Beans" }),
      food({ id: "nut", name: "Nut", allergens: ["peanut"] }),
    ];
    const recipes = [
      recipe({ id: "peas", name: "Peas", food_ids: ["peas"] }),
      recipe({ id: "nut", name: "Nut", food_ids: ["nut"] }),
      recipe({ id: "rice", name: "Rice", food_ids: ["rice"] }),
      recipe({ id: "beans", name: "Beans", food_ids: ["beans"] }),
    ];
    const kids = [kid({ id: "k1", allergens: ["peanuts"] })];
    const planEntries = [
      entry({ kid_id: "k1", food_id: "rice", result: "ate" }),
      entry({ kid_id: "k1", food_id: "rice", result: "ate" }),
      entry({ kid_id: "k1", food_id: "peas", result: "refused" }),
      entry({ kid_id: "k1", food_id: "nut", result: "ate" }),
    ];
    const { result } = renderHook(() => useRecipeFilters({ recipes, foods, kids, planEntries }));
    act(() => result.current.setSortBy("kids-eat-most"));
    // rice (ate) > beans (untried) > peas (refused) > nut (allergen, however well eaten)
    expect(ids(result.current.filteredRecipes)).toEqual(["rice", "beans", "peas", "nut"]);
  });
});
