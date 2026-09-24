import { describe, it, expect } from "vitest";
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import {
  bucketWeek,
  buildKidIndexes,
  cellFitChips,
  cellKey,
  kidDishFit,
  readFamilyCell,
} from "./familyWeekGrid";
import type { KidFit } from "./kidFit";

const KIDS: Kid[] = [
  { id: "sam", name: "Sam", allergens: [] },
  { id: "ada", name: "Ada", allergens: ["peanut"], allergen_severity: { peanut: "severe" } },
  { id: "leo", name: "Leo", allergens: [], disliked_foods: ["Peas"] },
];
const FOODS: Food[] = [
  { id: "pasta", name: "Pasta", category: "carb", is_safe: true, is_try_bite: false },
  { id: "peas", name: "Peas", category: "vegetable", is_safe: false, is_try_bite: true },
  { id: "pb", name: "Peanut butter", category: "protein", is_safe: true, is_try_bite: false, allergens: ["peanut"] },
  { id: "toast", name: "Toast", category: "carb", is_safe: true, is_try_bite: false },
];
const RECIPES: Recipe[] = [{ id: "mac", name: "Mac", food_ids: ["pasta", "peas"] }];
const foodById = new Map(FOODS.map((f) => [f.id, f]));
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

let n = 0;
const row = (kid: string, date: string, slot: PlanEntry["meal_slot"], food: string, extra: Partial<PlanEntry> = {}): PlanEntry => ({
  id: `r${++n}`,
  kid_id: kid,
  date,
  meal_slot: slot,
  food_id: food,
  result: null,
  ...extra,
});

describe("bucketWeek", () => {
  it("keeps only the week's dates and buckets by date and slot", () => {
    const rows = [
      row("sam", "2026-09-21", "dinner", "pasta"),
      row("ada", "2026-09-21", "dinner", "toast"),
      row("sam", "2026-09-28", "dinner", "pasta"),
    ];
    const b = bucketWeek(rows, ["2026-09-21", "2026-09-22"]);
    expect(b.get(cellKey("2026-09-21", "dinner"))?.map((r) => r.kid_id)).toEqual(["sam", "ada"]);
    expect([...b.keys()]).toEqual(["2026-09-21|dinner"]);
  });
});

describe("readFamilyCell", () => {
  const indexes = buildKidIndexes([], KIDS, "2026-09-24");

  it("names the family dish and each kid's line", () => {
    const rows = [
      row("sam", "2026-09-22", "dinner", "pasta", { recipe_id: "mac", is_primary_dish: true }),
      row("sam", "2026-09-22", "dinner", "peas", { recipe_id: "mac" }),
      row("leo", "2026-09-22", "dinner", "pasta", { recipe_id: "mac", is_primary_dish: true }),
      row("ada", "2026-09-22", "dinner", "toast"),
    ];
    const cell = readFamilyCell(rows, "dinner", KIDS, foodById, recipeById, indexes);
    expect(cell.group.familyKey).toBe("mac");
    expect(cell.lines.map((l) => [l.kid.id, l.status, l.key])).toEqual([
      ["sam", "family", "mac"],
      ["ada", "substitute", "toast"],
      ["leo", "family", "mac"],
    ]);
    expect(cell.familyKidIds).toEqual(["sam", "leo"]);
    // Every row of the family dish for the kids on it, and nothing of Ada's.
    expect(cell.familyRowIds).toHaveLength(3);
    expect(cell.everyoneShares).toBe(false);
    // Leo dislikes peas, which is in the recipe.
    expect(cell.lines[2].fit?.disliked).toBe(true);
  });

  it("marks an unplanned kid and says when everyone shares", () => {
    const rows = [row("sam", "2026-09-22", "lunch", "pasta"), row("ada", "2026-09-22", "lunch", "pasta"), row("leo", "2026-09-22", "lunch", "pasta")];
    expect(readFamilyCell(rows, "lunch", KIDS, foodById, recipeById, indexes).everyoneShares).toBe(true);
    const partial = readFamilyCell(rows.slice(0, 2), "lunch", KIDS, foodById, recipeById, indexes);
    expect(partial.lines[2].status).toBe("unplanned");
    expect(partial.lines[2].fit).toBeNull();
    expect(partial.everyoneShares).toBe(false);
  });

  it("has no family dish in the try-bite slot: every kid is their own line", () => {
    const rows = [row("sam", "2026-09-22", "try_bite", "peas"), row("ada", "2026-09-22", "try_bite", "peas")];
    const cell = readFamilyCell(rows, "try_bite", KIDS, foodById, recipeById, indexes);
    expect(cell.lines.slice(0, 2).map((l) => l.status)).toEqual(["substitute", "substitute"]);
    expect(cell.familyKidIds).toEqual([]);
    expect(cell.everyoneShares).toBe(false);
  });

  it("flags a severe allergen on the kid it affects", () => {
    const rows = [row("sam", "2026-09-22", "snack1", "pb"), row("ada", "2026-09-22", "snack1", "pb")];
    const cell = readFamilyCell(rows, "snack1", KIDS, foodById, recipeById, indexes);
    const chips = cellFitChips(cell.lines[1].fit);
    expect(chips[0]).toMatchObject({ kind: "allergen", allergen: "peanut", severe: true });
    expect(cellFitChips(cell.lines[0].fit).some((c) => c.kind === "allergen")).toBe(false);
  });
});

describe("history counts only what already happened", () => {
  it("ignores today's and future rows", () => {
    const rows = [
      row("sam", "2026-09-20", "dinner", "pasta", { result: "ate" }),
      row("sam", "2026-09-22", "dinner", "pasta", { result: "refused" }),
      row("sam", "2026-09-24", "dinner", "pasta", { result: "ate" }),
      row("sam", "2026-09-26", "dinner", "pasta"),
    ];
    const idx = buildKidIndexes(rows, KIDS, "2026-09-24").get("sam")!;
    const fit = kidDishFit(KIDS[0], "pasta", foodById, recipeById, idx);
    expect(fit).toMatchObject({ tries: 2, ate: 1 });
    expect(kidDishFit(KIDS[0], "nope", foodById, recipeById, idx)).toBeNull();
  });
});

describe("cellFitChips", () => {
  const base: KidFit = {
    allergen: null,
    disliked: false,
    alwaysEats: false,
    safe: false,
    tryBite: false,
    tries: 0,
    ate: 0,
    offered: 0,
    lastResult: null,
  };

  it("puts the allergen first and caps at two", () => {
    const chips = cellFitChips({ ...base, allergen: "milk", disliked: true, tries: 3, ate: 1 });
    expect(chips.map((c) => c.kind)).toEqual(["allergen", "dislike"]);
  });

  it("shows a go-to over a try bite, then history", () => {
    expect(cellFitChips({ ...base, alwaysEats: true, tryBite: true, tries: 4, ate: 4 }).map((c) => c.kind)).toEqual([
      "goTo",
      "history",
    ]);
    expect(cellFitChips({ ...base, tryBite: true }).map((c) => c.kind)).toEqual(["tryBite"]);
  });

  it("never calls an allergen dish a go-to or a try bite", () => {
    expect(cellFitChips({ ...base, allergen: "egg", alwaysEats: true, tryBite: true }).map((c) => c.kind)).toEqual([
      "allergen",
    ]);
  });

  it("is empty for an unknown dish or a plain one", () => {
    expect(cellFitChips(null)).toEqual([]);
    expect(cellFitChips(base)).toEqual([]);
  });
});
