import { describe, it, expect } from "vitest";
import type { Food, FoodCategory, Kid, PlanEntry } from "@/types";
import type { LadderRow } from "@/hooks/useFoodLadder";
import { buildChainAnchors, type BuildChainAnchorsInput } from "./chainAnchors";

const food = (id: string, name: string, extra: Partial<Food> = {}, category: FoodCategory = "carb"): Food => ({
  id,
  name,
  category,
  is_safe: false,
  is_try_bite: false,
  ...extra,
});

const kid = (extra: Partial<Kid> = {}): Kid => ({ id: "k1", name: "Maya", allergens: [], ...extra });

const ladderRow = (foodId: string, status: LadderRow["status"], currentRung: LadderRow["currentRung"], kidId = "k1"): LadderRow => ({
  id: `row-${foodId}`,
  kidId,
  foodId,
  currentRung,
  consecutiveSuccesses: 0,
  consecutiveHolds: 0,
  consecutiveRefusals: 0,
  status,
  nextDueOn: null,
  lastAttemptAt: null,
  pairedSafeFoodId: null,
  preferredPrep: null,
  preferredMealSlot: null,
  pausedReason: null,
});

const attempts = (foodId: string, outcomes: string[]) => outcomes.map((outcome) => ({ food_id: foodId, outcome }));

const byId = (...foods: Food[]) => new Map(foods.map((f) => [f.id, f]));

function run(overrides: Partial<BuildChainAnchorsInput>) {
  return buildChainAnchors({
    kid: kid(),
    foodsById: new Map(),
    ladderRows: [],
    attempts: [],
    planEntries: [],
    todayIso: "2026-09-24",
    ...overrides,
  });
}

const pasta = food("pasta", "Plain pasta");
const toast = food("pbt", "Peanut butter toast");
const nuggets = food("nug", "Chicken nuggets", {}, "protein");

describe("buildChainAnchors", () => {
  it("counts refusals, so 1 success in 10 tries is not reliable", () => {
    const out = run({
      foodsById: byId(pasta),
      attempts: attempts("pasta", ["success", ...Array(9).fill("refused")]),
    });
    expect(out.find((a) => a.source === "reliable")).toBeUndefined();
  });

  it("marks a mostly-eaten food reliable and carries ate/tries", () => {
    const out = run({
      foodsById: byId(pasta),
      attempts: attempts("pasta", ["success", "success", "success", "tantrum"]),
    });
    expect(out).toEqual([{ foodId: "pasta", name: "Plain pasta", source: "reliable", ate: 3, tries: 4 }]);
  });

  it("merges plan results with attempts", () => {
    const plan: PlanEntry[] = ["2026-09-20", "2026-09-21"].map((date, i) => ({
      id: `p${i}`,
      kid_id: "k1",
      date,
      meal_slot: "dinner",
      food_id: "pasta",
      result: "ate",
    }));
    const out = run({ foodsById: byId(pasta), planEntries: plan, attempts: attempts("pasta", ["success"]) });
    expect(out[0]).toMatchObject({ source: "reliable", ate: 3, tries: 3 });
  });

  it("never anchors on a peanut food for a peanut-allergic kid", () => {
    const out = run({
      kid: kid({ allergens: ["peanut"], allergen_severity: { peanut: "mild" } }),
      foodsById: byId(toast),
      attempts: attempts("pbt", Array(5).fill("success")),
    });
    expect(out).toEqual([]);
  });

  it("drops it too when the allergy has no recorded severity", () => {
    const out = run({
      kid: kid({ allergens: ["peanut"], always_eats_foods: ["pbt"] }),
      foodsById: byId(toast),
      attempts: attempts("pbt", Array(5).fill("success")),
    });
    expect(out).toEqual([]);
  });

  it("drops disliked foods", () => {
    const out = run({
      kid: kid({ disliked_foods: ["plain pasta"] }),
      foodsById: byId(pasta, nuggets),
      ladderRows: [ladderRow("pasta", "mastered", "full_portion")],
      attempts: attempts("nug", Array(3).fill("success")),
    });
    expect(out.map((a) => a.foodId)).toEqual(["nug"]);
  });

  it("lists a food that is both always-eats and mastered once, as always", () => {
    const out = run({
      kid: kid({ always_eats_foods: ["pasta"] }),
      foodsById: byId(pasta),
      ladderRows: [ladderRow("pasta", "mastered", "full_portion")],
      attempts: attempts("pasta", Array(4).fill("success")),
    });
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("always");
  });

  it("resolves an always-eats entry given by name", () => {
    const out = run({ kid: kid({ always_eats_foods: ["  plain PASTA "] }), foodsById: byId(pasta) });
    expect(out).toEqual([{ foodId: "pasta", name: "Plain pasta", source: "always" }]);
  });

  it("drops ids missing from foodsById", () => {
    const out = run({
      kid: kid({ always_eats_foods: ["ghost"] }),
      foodsById: byId(pasta),
      ladderRows: [ladderRow("ghost2", "mastered", "full_portion"), ladderRow("ghost3", "active", "full_bite")],
      attempts: attempts("ghost4", Array(4).fill("success")),
    });
    expect(out).toEqual([]);
  });

  it("includes climbing rows at a full bite or portion, for this kid only", () => {
    const out = run({
      foodsById: byId(pasta, nuggets, toast),
      ladderRows: [
        ladderRow("pasta", "active", "full_bite"),
        ladderRow("nug", "active", "small_bite"),
        ladderRow("pbt", "active", "full_portion", "k2"),
      ],
    });
    expect(out).toEqual([{ foodId: "pasta", name: "Plain pasta", source: "climbing" }]);
  });

  it("uses household safe foods only when every other tier is empty", () => {
    const safeRice = food("rice", "Rice", { is_safe: true });
    const alone = run({ foodsById: byId(safeRice, pasta) });
    expect(alone.map((a) => [a.foodId, a.source])).toEqual([["rice", "household"]]);

    const withAlways = run({ kid: kid({ always_eats_foods: ["pasta"] }), foodsById: byId(safeRice, pasta) });
    expect(withAlways.map((a) => a.source)).toEqual(["always"]);
  });

  it("orders by tier, then ate, then name, the same way every time", () => {
    const a = food("a", "Apple");
    const b = food("b", "Banana");
    const c = food("c", "Carrot");
    const input: Partial<BuildChainAnchorsInput> = {
      kid: kid({ always_eats_foods: ["c"] }),
      foodsById: byId(a, b, c, pasta),
      ladderRows: [ladderRow("pasta", "mastered", "full_portion")],
      attempts: [...attempts("a", Array(3).fill("success")), ...attempts("b", Array(5).fill("success"))],
    };
    const out = run(input);
    expect(out.map((x) => x.foodId)).toEqual(["c", "pasta", "b", "a"]);
    expect(run({ ...input, foodsById: byId(pasta, c, b, a) })).toEqual(out);
  });
});
