import { describe, it, expect } from "vitest";
import type { Food, Kid, PlanEntry, Recipe, RecipeIngredient } from "@/types";
import {
  acceptanceWeight,
  buildRecipeFits,
  buildResultIndex,
  countUncheckedIngredients,
  findAllergenConflicts,
  fitGroup,
  getKidFoodFit,
  getKidRecipeFit,
  selectReliableFoods,
  selectTryNextFromResults,
  summarizeKidFits,
  type KidFit,
  type KidFitKid,
  type KidHit,
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

const fitOf = (p: Partial<KidFit> = {}): KidFit => ({
  allergen: null,
  disliked: false,
  alwaysEats: false,
  safe: false,
  tryBite: false,
  tries: 0,
  ate: 0,
  offered: 0,
  lastResult: null,
  ...p,
});
const kidOf = (id: string, p: Partial<Kid> = {}): Kid => ({ id, name: id.toUpperCase(), allergens: [], ...p });

describe("summarizeKidFits", () => {
  it("matches the old drawer summarize() output field for field", () => {
    const sam = kidOf("sam");
    const ada = kidOf("ada");
    const perKid: KidHit[] = [
      { kid: sam, fit: fitOf({ safe: true, tries: 3, lastResult: "ate" }) },
      { kid: ada, fit: fitOf({ alwaysEats: true, tries: 1 }) },
    ];
    // What MealQuickAddDrawer.summarize returned before the move.
    expect(summarizeKidFits(perKid)).toEqual({
      perKid,
      allergenKids: [],
      dislikeKids: [],
      goToKids: [ada],
      safeForAll: true,
      trying: false,
      tries: 3,
      lastResult: null,
      allergenStatus: "safe",
      unchecked: 0,
    });

    const hit = summarizeKidFits([
      { kid: sam, fit: fitOf({ allergen: "milk", tryBite: true }) },
      { kid: ada, fit: fitOf({ disliked: true, safe: true }) },
    ]);
    expect(hit.allergenKids.map((h) => h.kid.id)).toEqual(["sam"]);
    expect(hit.dislikeKids).toEqual([ada]);
    expect(hit.safeForAll).toBe(false);
    expect(hit.trying).toBe(false);
    expect(hit.allergenStatus).toBe("hit");

    const one = summarizeKidFits([{ kid: sam, fit: fitOf({ tryBite: true, lastResult: "tasted" }) }]);
    expect(one.trying).toBe(true);
    expect(one.lastResult).toBe("tasted");
    expect(summarizeKidFits([]).safeForAll).toBe(false);
  });

  it("treats a redacted kid (allergens undefined) as unknown, never safe", () => {
    const redacted = kidOf("r", { allergens: undefined });
    const fit = summarizeKidFits([{ kid: redacted, fit: fitOf({ safe: true }) }]);
    expect(fit.allergenStatus).toBe("unknown");
    expect(fit.safeForAll).toBe(false);
  });

  it("honors unknownKidIds and unchecked", () => {
    const k = kidOf("k");
    const perKid = [{ kid: k, fit: fitOf({ safe: true }) }];
    expect(summarizeKidFits(perKid, { unknownKidIds: ["k"] }).allergenStatus).toBe("unknown");
    const u = summarizeKidFits(perKid, { unchecked: 2 });
    expect(u.allergenStatus).toBe("unknown");
    expect(u.unchecked).toBe(2);
    expect(u.safeForAll).toBe(false);
    // A hit wins over unknown.
    expect(
      summarizeKidFits([{ kid: k, fit: fitOf({ allergen: "egg" }) }], { unchecked: 1 }).allergenStatus,
    ).toBe("hit");
  });
});

describe("fitGroup", () => {
  const k = kidOf("k");
  it("orders safe, then trying, then other, and an allergen hit is always other", () => {
    expect(fitGroup(summarizeKidFits([{ kid: k, fit: fitOf({ safe: true }) }]))).toBe("safe");
    expect(fitGroup(summarizeKidFits([{ kid: k, fit: fitOf({ tryBite: true }) }]))).toBe("trying");
    expect(fitGroup(summarizeKidFits([{ kid: k, fit: fitOf() }]))).toBe("other");
    expect(
      fitGroup(summarizeKidFits([{ kid: k, fit: fitOf({ safe: true, tryBite: true, allergen: "egg" }) }])),
    ).toBe("other");
    // Unknown allergy data drops a safe item to "trying"/"other", never "safe".
    expect(
      fitGroup(summarizeKidFits([{ kid: k, fit: fitOf({ safe: true }) }], { unchecked: 1 })),
    ).toBe("other");
  });
});

describe("countUncheckedIngredients", () => {
  const foodById = new Map([["f1", food({ id: "f1", name: "Rice" })]]);
  const ri = (p: Partial<RecipeIngredient>): RecipeIngredient => ({
    id: "ri", recipe_id: "r", sort_order: 0, name: "x", ...p,
  });

  it("counts unresolved food_ids and null-food recipe_ingredients", () => {
    expect(countUncheckedIngredients({ food_ids: ["f1"] }, foodById)).toBe(0);
    expect(countUncheckedIngredients({ food_ids: ["f1", "gone"] }, foodById)).toBe(1);
    expect(
      countUncheckedIngredients(
        { food_ids: ["f1"], recipe_ingredients: [ri({ food_id: "f1" }), ri({ food_id: null, name: "salt" })] },
        foodById,
      ),
    ).toBe(1);
  });

  it("makes buildRecipeFits report unknown for such a recipe", () => {
    const k = kidOf("k");
    const recipes: Recipe[] = [
      { id: "a", name: "A", food_ids: ["f1", "gone"] },
      { id: "b", name: "B", food_ids: ["f1"], recipe_ingredients: [ri({ food_id: null })] },
      { id: "c", name: "C", food_ids: ["f1"] },
    ];
    const fits = buildRecipeFits(recipes, [k], foodById, [], "2026-09-24");
    expect(fits.get("a")?.allergenStatus).toBe("unknown");
    expect(fits.get("b")?.allergenStatus).toBe("unknown");
    expect(fits.get("c")?.allergenStatus).toBe("safe");
    expect(fits.get("c")?.safeForAll).toBe(true);
  });
});

describe("findAllergenConflicts", () => {
  it("matches a kid's 'peanuts' against a food's 'en:peanuts'", () => {
    const pn = kidOf("pn", { allergens: ["peanuts"] });
    const none = kidOf("none");
    const foodById = new Map([
      ["sat", food({ id: "sat", name: "Satay", allergens: ["en:peanuts"] })],
      ["rice", food({ id: "rice", name: "Rice" })],
    ]);
    const hits = findAllergenConflicts([pn, none], ["sat", "rice", "missing"], foodById);
    expect(hits).toHaveLength(1);
    expect(hits[0].kid).toBe(pn);
    expect(hits[0].food.id).toBe("sat");
    expect(hits[0].allergen).toBe("peanut");
  });
});

describe("buildRecipeFits", () => {
  it("builds one result index per kid, not one per recipe", () => {
    const history = [
      entry({ kid_id: "k1", food_id: "f1", date: "2026-09-01", result: "ate" }),
      entry({ kid_id: "k2", food_id: "f1", date: "2026-09-01", result: "refused" }),
    ];
    let passes = 0;
    const counted = {
      [Symbol.iterator]() {
        passes++;
        return history[Symbol.iterator]();
      },
    } as unknown as PlanEntry[];
    const foodById = new Map([["f1", food({ id: "f1", name: "Rice" })]]);
    const recipes: Recipe[] = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, name: `R${i}`, food_ids: ["f1"] }));
    const fits = buildRecipeFits(recipes, [kidOf("k1"), kidOf("k2")], foodById, counted, "2026-09-24");
    expect(passes).toBe(2);
    expect(fits.size).toBe(6);
    expect(fits.get("r0")?.perKid.map((h) => h.fit.tries)).toEqual([1, 1]);
  });

  it("does not count history on or after todayKey", () => {
    const history = [entry({ kid_id: "k1", food_id: "f1", date: "2026-09-24", result: "ate" })];
    const foodById = new Map([["f1", food({ id: "f1", name: "Rice" })]]);
    const fits = buildRecipeFits([{ id: "r", name: "R", food_ids: ["f1"] }], [kidOf("k1")], foodById, history, "2026-09-24");
    expect(fits.get("r")?.tries).toBe(0);
  });
});

describe("buildResultIndex with before", () => {
  it("excludes a row dated on or after the bound", () => {
    const entries = [
      entry({ kid_id: "k1", food_id: "f1", date: "2026-09-20", result: "ate" }),
      entry({ kid_id: "k1", food_id: "f1", date: "2026-09-30" }),
    ];
    expect(buildResultIndex(entries, "k1").get("f1")?.offered).toBe(2);
    expect(buildResultIndex(entries, "k1", "2026-09-25").get("f1")?.offered).toBe(1);
  });
});

describe("selectReliableFoods", () => {
  const peanutKid: KidFitKid = { id: "k1", allergens: ["peanut"], disliked_foods: ["f-peas"], always_eats_foods: [] };
  const foods = [
    food({ id: "f-nuts", name: "Peanuts", allergens: ["peanuts"] }),
    food({ id: "f-rice", name: "Rice" }),
    food({ id: "f-toast", name: "Toast" }),
    food({ id: "f-peas", name: "Peas" }),
    food({ id: "f-corn", name: "Corn" }),
  ];
  const byId = new Map(foods.map((f) => [f.id, f]));
  const ate = (food_id: string, n: number, result: PlanEntry["result"] = "ate") =>
    Array.from({ length: n }, (_, i) =>
      entry({ kid_id: "k1", food_id, date: `2026-09-${String(10 + i).padStart(2, "0")}`, result }),
    );

  it("keeps foods eaten often enough and drops allergens, dislikes and thin history", () => {
    const index = buildResultIndex(
      [
        ...ate("f-nuts", 5),
        ...ate("f-rice", 4),
        ...ate("f-toast", 3),
        ...ate("f-toast", 1, "refused"),
        ...ate("f-peas", 5),
        ...ate("f-corn", 2),
      ],
      "k1",
    );
    const out = selectReliableFoods(index, byId, peanutKid);
    expect(out.map((r) => r.food.name)).toEqual(["Rice", "Toast"]);
  });

  it("drops a food whose ate share is under the bar", () => {
    const index = buildResultIndex([...ate("f-rice", 2), ...ate("f-rice", 2, "tasted")], "k1");
    expect(selectReliableFoods(index, byId, peanutKid)).toEqual([]);
  });
});

describe("selectTryNextFromResults", () => {
  const foods = [
    food({ id: "f-broc", name: "Broccoli", is_try_bite: true }),
    food({ id: "f-kiwi", name: "Kiwi", is_try_bite: true }),
    food({ id: "f-plum", name: "Plum", is_try_bite: true }),
    food({ id: "f-bread", name: "Bread", is_try_bite: false }),
  ];

  it("picks the most recent tasted try bite and ignores disliked foods", () => {
    const index = buildResultIndex(
      [
        entry({ kid_id: "k1", food_id: "f-broc", date: "2026-09-22", result: "tasted" }),
        entry({ kid_id: "k1", food_id: "f-kiwi", date: "2026-09-18", result: "tasted" }),
        entry({ kid_id: "k1", food_id: "f-plum", date: "2026-09-21", result: "refused" }),
        entry({ kid_id: "k1", food_id: "f-bread", date: "2026-09-23", result: "tasted" }),
      ],
      "k1",
    );
    expect(selectTryNextFromResults(index, foods, kid)?.food.id).toBe("f-kiwi");
  });

  it("returns null with no tasted try bite", () => {
    expect(selectTryNextFromResults(new Map(), foods, kid)).toBeNull();
  });
});
