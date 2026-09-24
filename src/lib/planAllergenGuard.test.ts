import { describe, it, expect } from "vitest";
import type { Food } from "@/types";
import { allergenConflictsFor, dropAllergenEntries, manualAddPrompt, type GuardKid } from "./planAllergenGuard";

const food = (id: string, name: string, allergens: string[] = []): Food =>
  ({ id, name, category: "protein", is_safe: true, is_try_bite: false, allergens }) as Food;

const foods = [food("pb", "Peanut butter"), food("yog", "Yogurt"), food("rice", "Rice"), food("mix", "Trail mix", ["almonds"])];
const byId = new Map(foods.map((f) => [f.id, f]));

const maya: GuardKid = { id: "m", name: "Maya", allergens: ["peanuts", "milk"], allergen_severity: { peanuts: "severe", milk: "mild" } };
const leo: GuardKid = { id: "l", name: "Leo", allergens: ["tree nuts"] };

describe("manualAddPrompt", () => {
  it("is null when nothing conflicts", () => {
    expect(manualAddPrompt([maya, leo], ["rice"], byId)).toBeNull();
  });

  it("leads with the severe conflict so the confirm can name child and allergen", () => {
    const p = manualAddPrompt([maya], ["yog", "pb"], byId)!;
    expect(p.severe).toBe(true);
    expect(p.lead?.kid.name).toBe("Maya");
    expect(p.lead?.allergen).toBe("peanut");
    expect(p.conflicts.map((c) => c.food.id)).toEqual(["pb", "yog"]);
  });

  it("is not severe for a mild or unrated hit, but still asks", () => {
    const p = manualAddPrompt([maya, leo], ["yog", "mix"], byId)!;
    expect(p.severe).toBe(false);
    expect(p.lead).toBeNull();
    expect(p.conflicts.map((c) => `${c.kid.id}:${c.allergen}`)).toEqual(["m:milk", "l:tree nut"]);
  });
});

describe("allergenConflictsFor", () => {
  it("orders severe conflicts first", () => {
    const out = allergenConflictsFor([maya], ["yog", "pb"], byId);
    expect(out.map((c) => c.severity)).toEqual(["severe", "mild"]);
  });
});

describe("dropAllergenEntries", () => {
  it("drops only the entries that hit that entry's kid", () => {
    const entries = [
      { kid_id: "m", food_id: "pb", date: "2026-01-01" },
      { kid_id: "m", food_id: "pb", date: "2026-01-02" },
      { kid_id: "m", food_id: "rice", date: "2026-01-01" },
      { kid_id: "l", food_id: "pb", date: "2026-01-01" },
      { kid_id: "l", food_id: "mix", date: "2026-01-01" },
    ];
    const { kept, dropped } = dropAllergenEntries(entries, [maya, leo], byId);
    expect(kept.map((e) => `${e.kid_id}:${e.food_id}`)).toEqual(["m:rice", "l:pb"]);
    expect(dropped.map((c) => `${c.kid.id}:${c.food.id}`)).toEqual(["m:pb", "l:mix"]);
  });

  it("keeps entries for kids it was not given and foods it does not know", () => {
    const { kept } = dropAllergenEntries([{ kid_id: "x", food_id: "pb" }, { kid_id: "m", food_id: "ghost" }], [maya], byId);
    expect(kept).toHaveLength(2);
  });
});
