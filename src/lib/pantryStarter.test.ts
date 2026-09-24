import { describe, it, expect } from "vitest";
import {
  PANTRY_STARTER_FOODS,
  buildStarterRows,
  isStarterSelectable,
  starterSelectionToFoods,
} from "./pantryStarter";
import type { Food, Kid } from "@/types";

const ava: Kid = { id: "k1", name: "Ava", allergens: ["peanuts"], allergen_severity: { peanuts: "severe" } } as Kid;
const ben: Kid = { id: "k2", name: "Ben", allergens: ["dairy"] } as Kid;

const rowFor = (rows: ReturnType<typeof buildStarterRows>, key: string) => {
  const row = rows.find((r) => r.food.key === key);
  if (!row) throw new Error(key);
  return row;
};

describe("buildStarterRows", () => {
  it("blocks a food that hits any kid's allergen, and marks a severe one", () => {
    const rows = buildStarterRows({ kids: [ava, ben], pantryFoods: [] });
    const pb = rowFor(rows, "peanutButter");
    expect(pb.blocks.map((b) => b.kid.name)).toEqual(["Ava"]);
    expect(pb.severe).toBe(true);
    expect(isStarterSelectable(pb)).toBe(false);

    const cheese = rowFor(rows, "cheese");
    expect(cheese.blocks).toEqual([expect.objectContaining({ allergen: "milk", severity: null })]);
    expect(cheese.severe).toBe(false);
    expect(isStarterSelectable(cheese)).toBe(false);

    expect(isStarterSelectable(rowFor(rows, "bananas"))).toBe(true);
  });

  it("scores every kid, so each row carries a per-kid fit", () => {
    const rows = buildStarterRows({ kids: [ava, ben], pantryFoods: [] });
    expect(rowFor(rows, "rice").fit?.perKid).toHaveLength(2);
    expect(rowFor(rows, "rice").fit?.allergenStatus).toBe("safe");
  });

  it("has no fit without kids, and blocks nothing", () => {
    const rows = buildStarterRows({ kids: [], pantryFoods: [] });
    expect(rows.every((r) => r.fit === undefined && r.blocks.length === 0)).toBe(true);
  });

  it("marks a food already in the pantry and does not offer it again", () => {
    const pantry: Food[] = [{ id: "f1", name: "bananas", category: "fruit", is_safe: true, is_try_bite: false }];
    const bananas = rowFor(buildStarterRows({ kids: [], pantryFoods: pantry }), "bananas");
    expect(bananas.inPantry).toBe(true);
    expect(isStarterSelectable(bananas)).toBe(false);
  });

  it("lists allergens for the foods whose names do not say them", () => {
    const byKey = new Map(PANTRY_STARTER_FOODS.map((f) => [f.key, f]));
    expect(byKey.get("crackers")?.allergens).toContain("wheat");
    expect(byKey.get("hummus")?.allergens).toContain("sesame");
  });

  it("blocks bread and crackers for a soy-allergic kid (soy lecithin / soy flour is the usual case)", () => {
    const cal = { id: "k3", name: "Cal", allergens: ["soy"] } as Kid;
    const rows = buildStarterRows({ kids: [cal], pantryFoods: [] });
    for (const key of ["bread", "crackers", "grahamCrackers"]) {
      expect(isStarterSelectable(rowFor(rows, key))).toBe(false);
    }
  });
});

describe("starterSelectionToFoods", () => {
  it("adds ticked foods at quantity 1, not safe and not a try bite (US-803)", () => {
    const rows = buildStarterRows({ kids: [ava], pantryFoods: [] });
    const foods = starterSelectionToFoods(rows, new Set(["rice", "bananas"]));
    expect(foods).toHaveLength(2);
    for (const f of foods) {
      expect(f.quantity).toBe(1);
      expect(f.is_safe).toBe(false);
      expect(f.is_try_bite).toBe(false);
    }
  });

  it("drops a blocked row even if it was somehow selected", () => {
    const rows = buildStarterRows({ kids: [ava], pantryFoods: [] });
    expect(starterSelectionToFoods(rows, new Set(["peanutButter"]))).toEqual([]);
  });

  it("uses the display name it is given", () => {
    const rows = buildStarterRows({ kids: [], pantryFoods: [] });
    const [food] = starterSelectionToFoods(rows, new Set(["rice"]), (f) => `${f.name}!`);
    expect(food.name).toBe("Rice!");
  });
});
