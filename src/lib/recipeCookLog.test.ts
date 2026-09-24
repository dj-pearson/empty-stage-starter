import { describe, it, expect } from "vitest";
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import { cookLogGate, findTodayRecipeEntry, primaryForKid } from "./recipeCookLog";

const TODAY = "2026-09-24";
const row = (id: string, extra: Partial<PlanEntry> = {}): PlanEntry => ({
  id,
  kid_id: "k",
  date: TODAY,
  meal_slot: "dinner",
  food_id: "f",
  result: null,
  recipe_id: "r1",
  ...extra,
});

describe("findTodayRecipeEntry", () => {
  const lunch = row("lunch-primary", { meal_slot: "lunch", is_primary_dish: true });
  const lunchSide = row("lunch-side", { meal_slot: "lunch", food_id: "g" });
  const dinner = row("dinner-primary", { is_primary_dish: true });
  const plan = [lunchSide, lunch, dinner, row("other-kid", { kid_id: "x" }), row("yesterday", { date: "2026-09-23" })];

  it("prefers the slot for this time of day, on its primary row", () => {
    expect(findTodayRecipeEntry(plan, "r1", "k", TODAY, new Date(2026, 8, 24, 12, 0))?.id).toBe("lunch-primary");
    expect(findTodayRecipeEntry(plan, "r1", "k", TODAY, new Date(2026, 8, 24, 19, 0))?.id).toBe("dinner-primary");
  });

  it("falls back to the first slot nobody has logged", () => {
    const logged = [{ ...lunch, result: "ate" as const }, lunchSide, dinner];
    expect(findTodayRecipeEntry(logged, "r1", "k", TODAY, new Date(2026, 8, 24, 8, 0))?.id).toBe("dinner-primary");
  });

  it("is undefined when the recipe is not on today's plan for that kid", () => {
    expect(findTodayRecipeEntry(plan, "r2", "k", TODAY, new Date())).toBeUndefined();
    expect(findTodayRecipeEntry(plan, "r1", "nobody", TODAY, new Date())).toBeUndefined();
  });
});

describe("primaryForKid", () => {
  it("picks the kid's primary among freshly scheduled rows", () => {
    const rows = [row("a"), row("b", { is_primary_dish: true }), row("c", { kid_id: "z", is_primary_dish: true })];
    expect(primaryForKid(rows, "k")?.id).toBe("b");
    expect(primaryForKid(rows, "none")).toBeUndefined();
  });
});

describe("cookLogGate", () => {
  const foods = new Map<string, Food>([
    ["pb", { id: "pb", name: "Peanut butter", category: "protein", is_safe: true, is_try_bite: false, allergens: ["peanuts"] }],
  ]);
  const recipe: Recipe = { id: "r1", name: "PB", food_ids: ["pb"] };

  it("stops an allergen hit, naming it and its severity", () => {
    const kid: Kid = { id: "k", name: "K", allergens: ["peanut"], allergen_severity: { peanut: "severe" } };
    expect(cookLogGate(kid, recipe, foods, [])).toEqual({
      reason: "allergen",
      allergen: expect.any(String),
      severe: true,
      severityRecorded: true,
    });
  });

  it("stops an unrated hit as severe and says the severity was not recorded (item 3a)", () => {
    const kid: Kid = { id: "k", name: "K", allergens: ["peanut"] };
    expect(cookLogGate(kid, recipe, foods, [])).toEqual({
      reason: "allergen",
      allergen: expect.any(String),
      severe: true,
      severityRecorded: false,
    });
    const mild: Kid = { ...kid, allergen_severity: { peanut: "mild" } };
    expect(cookLogGate(mild, recipe, foods, [])).toMatchObject({ severe: false, severityRecorded: true });
  });

  it("stops unknown allergy data and a recipe with no foods", () => {
    expect(cookLogGate({ id: "k", name: "K" }, recipe, foods, [])).toEqual({ reason: "unknown" });
    expect(cookLogGate({ id: "k", name: "K", allergens: [] }, { ...recipe, food_ids: [] }, foods, [])).toEqual({
      reason: "no-foods",
    });
  });

  it("lets a kid with no hit through", () => {
    expect(cookLogGate({ id: "k", name: "K", allergens: ["milk"] }, recipe, foods, [])).toBeNull();
  });
});
