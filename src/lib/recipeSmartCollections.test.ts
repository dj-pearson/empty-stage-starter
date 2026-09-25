import { describe, it, expect } from "vitest";
import type { Food, Kid, Recipe } from "@/types";
import {
  buildSmartCollections,
  isSmartCollectionId,
  smartSafeId,
  SMART_EVERYONE_ID,
  SMART_QUICK_ID,
  SMART_UNFILED_ID,
} from "./recipeSmartCollections";

const food = (id: string, extra: Partial<Food> = {}): Food => ({
  id,
  name: id,
  category: "protein",
  is_safe: false,
  is_try_bite: false,
  allergens: [],
  ...extra,
});

const foods = [
  food("pasta", { is_safe: true }),
  food("cheese", { is_safe: true, allergens: ["milk"] }),
  food("broccoli", { is_try_bite: true }),
  food("rice", { is_safe: true }),
];
const foodById = new Map(foods.map((f) => [f.id, f]));

const robin: Kid = { id: "robin", name: "Robin", allergens: [] };
const sam: Kid = { id: "sam", name: "Sam", allergens: ["milk"] };

const recipe = (id: string, food_ids: string[], extra: Partial<Recipe> = {}): Recipe => ({
  id,
  name: id,
  food_ids,
  ...extra,
});

const recipes = [
  recipe("mac", ["pasta", "cheese"], { total_time_minutes: 20 }),
  recipe("rice-bowl", ["rice"], { prepTime: "10 min", cookTime: "25 min" }),
  recipe("rice-broc", ["rice", "broccoli"], { total_time_minutes: 30 }),
  recipe("mystery", ["unknown-food"]),
];

function build(kids: Kid[], collectionIdsByRecipe: Record<string, string[]> = {}, includeUnfiled = true) {
  const list = buildSmartCollections({
    recipes,
    kids,
    foodById,
    planEntries: [],
    collectionIdsByRecipe,
    includeUnfiled,
    todayKey: "2026-09-24",
  });
  return new Map(list.map((c) => [c.id, c]));
}

describe("buildSmartCollections", () => {
  it("lists a Safe for collection per kid, allergen hits excluded", () => {
    const byId = build([robin, sam]);
    expect([...byId.get(smartSafeId("robin"))!.recipeIds].sort()).toEqual(["mac", "rice-bowl"]);
    // Sam is allergic to milk: mac is out, rice-bowl stays.
    expect([...byId.get(smartSafeId("sam"))!.recipeIds]).toEqual(["rice-bowl"]);
    expect(byId.get(smartSafeId("sam"))!.kid?.name).toBe("Sam");
  });

  it("Everyone can eat takes safe or trying for every kid and drops any allergen hit or unknown", () => {
    const byId = build([robin, sam]);
    const everyone = byId.get(SMART_EVERYONE_ID)!;
    expect([...everyone.recipeIds].sort()).toEqual(["rice-bowl", "rice-broc"]);
    // An ingredient that cannot be checked never reads as safe.
    expect(everyone.recipeIds.has("mystery")).toBe(false);
  });

  it("a kid whose allergy list is unknown makes nothing safe for everyone", () => {
    const unknown: Kid = { id: "u", name: "U" };
    const byId = build([robin, unknown]);
    expect(byId.get(SMART_EVERYONE_ID)!.count).toBe(0);
  });

  it("Quick is 30 minutes or less in total", () => {
    const byId = build([]);
    expect([...byId.get(SMART_QUICK_ID)!.recipeIds].sort()).toEqual(["mac", "rice-broc"]);
    // No kids: no per-kid or everyone collections.
    expect(byId.has(SMART_EVERYONE_ID)).toBe(false);
  });

  it("Unfiled is every recipe in no collection, and is left out while collections are unknown", () => {
    const byId = build([], { mac: ["c1"], "rice-bowl": [] });
    expect([...byId.get(SMART_UNFILED_ID)!.recipeIds].sort()).toEqual(["mystery", "rice-bowl", "rice-broc"]);
    expect(byId.get(SMART_UNFILED_ID)!.count).toBe(3);
    expect(build([], {}, false).has(SMART_UNFILED_ID)).toBe(false);
  });

  it("tells smart ids from collection ids", () => {
    expect(isSmartCollectionId(SMART_QUICK_ID)).toBe(true);
    expect(isSmartCollectionId("3f1c2b8e-0000-4000-8000-000000000000")).toBe(false);
    expect(isSmartCollectionId(null)).toBe(false);
  });
});
