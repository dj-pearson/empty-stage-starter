import { describe, it, expect } from "vitest";
import type { Food, Kid, PlanEntry } from "@/types";
import { buildTryBiteStrip, foodTrackerHref, monthStartOf } from "./tryBiteStrip";

const KIDS: Kid[] = [
  { id: "sam", name: "Sam" },
  { id: "ada", name: "Ada" },
];
const FOODS: Food[] = [
  { id: "peas", name: "Peas", category: "vegetable", is_safe: false, is_try_bite: true },
  { id: "kiwi", name: "Kiwi", category: "fruit", is_safe: false, is_try_bite: false },
  { id: "pasta", name: "Pasta", category: "carb", is_safe: true, is_try_bite: false },
];
const foodById = new Map(FOODS.map((f) => [f.id, f]));

let n = 0;
const row = (kid: string, date: string, slot: PlanEntry["meal_slot"], food: string, result: PlanEntry["result"] = null): PlanEntry => ({
  id: `r${++n}`,
  kid_id: kid,
  date,
  meal_slot: slot,
  food_id: food,
  result,
});

const WEEK = "2026-09-21";
const TODAY = "2026-09-24";

describe("buildTryBiteStrip", () => {
  it("lists try-slot foods and flagged try bites planned this week, per kid", () => {
    const rows = [
      row("sam", "2026-09-23", "try_bite", "kiwi"),
      row("sam", "2026-09-25", "dinner", "peas"),
      row("sam", "2026-09-25", "dinner", "pasta"),
      row("sam", "2026-09-29", "try_bite", "pasta"), // next week
      row("ada", "2026-09-22", "lunch", "pasta"),
    ];
    const strip = buildTryBiteStrip(rows, KIDS, foodById, WEEK, TODAY);
    expect(strip.map((k) => k.kid.id)).toEqual(["sam"]);
    expect(strip[0].items.map((i) => [i.food.id, i.plannedDates])).toEqual([
      ["kiwi", ["2026-09-23"]],
      ["peas", ["2026-09-25"]],
    ]);
  });

  it("counts this month's logged tries up to today, not last month's or future ones", () => {
    const rows = [
      row("sam", "2026-08-30", "try_bite", "peas", "ate"), // last month
      row("sam", "2026-09-03", "try_bite", "peas", "refused"),
      row("sam", "2026-09-10", "dinner", "peas", "tasted"),
      row("sam", "2026-09-17", "dinner", "peas", null), // offered, not logged
      row("sam", "2026-09-24", "try_bite", "peas", "ate"), // today counts
      row("sam", "2026-09-26", "try_bite", "peas", "ate"), // future, impossible but ignored
      row("ada", "2026-09-10", "try_bite", "peas", "ate"), // another kid
    ];
    const [sam] = buildTryBiteStrip(rows, KIDS, foodById, WEEK, TODAY);
    expect(sam.items[0]).toMatchObject({ tries: 3, ate: 1, tasted: 1, refused: 1, lastResult: "ate" });
  });

  it("reports a planned try bite with no tries yet", () => {
    const [sam] = buildTryBiteStrip([row("sam", "2026-09-26", "try_bite", "kiwi")], KIDS, foodById, WEEK, TODAY);
    expect(sam.items[0]).toMatchObject({ tries: 0, lastResult: null });
  });

  it("is empty when no try bite is planned", () => {
    expect(buildTryBiteStrip([row("sam", "2026-09-22", "lunch", "pasta")], KIDS, foodById, WEEK, TODAY)).toEqual([]);
  });

  it("works for a Sunday week too: the window is whatever start it is given", () => {
    const rows = [row("sam", "2026-09-20", "try_bite", "kiwi")];
    expect(buildTryBiteStrip(rows, KIDS, foodById, "2026-09-20", TODAY)).toHaveLength(1);
    expect(buildTryBiteStrip(rows, KIDS, foodById, WEEK, TODAY)).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("monthStartOf and foodTrackerHref", () => {
    expect(monthStartOf("2026-09-24")).toBe("2026-09-01");
    expect(foodTrackerHref("a b")).toBe("/dashboard/food-tracker?food=a%20b");
  });
});
