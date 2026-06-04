import { describe, it, expect } from "vitest";
import {
  ingredientMatchKey,
  sumQuantities,
  splitIngredientBlock,
  planGroceryMerge,
  formatQuantity,
  type ExistingGroceryItem,
} from "./groceryMerge";

describe("ingredientMatchKey", () => {
  it("collapses fat-ratio qualifiers so ground beef variants match", () => {
    expect(ingredientMatchKey("ground beef 80/20")).toBe(ingredientMatchKey("ground beef"));
    expect(ingredientMatchKey("Ground Beef 85/15")).toBe(ingredientMatchKey("ground beef"));
  });

  it("ignores token order, case, and percentages", () => {
    expect(ingredientMatchKey("Beef, Ground")).toBe(ingredientMatchKey("ground beef"));
    expect(ingredientMatchKey("milk 2%")).toBe(ingredientMatchKey("milk"));
  });

  it("strips unit/packaging noise and leading quantities", () => {
    expect(ingredientMatchKey("2 lbs ground beef")).toBe(ingredientMatchKey("ground beef"));
    expect(ingredientMatchKey("3 cloves garlic")).toBe(ingredientMatchKey("garlic"));
  });

  it("keeps genuinely different items apart", () => {
    expect(ingredientMatchKey("red onion")).not.toBe(ingredientMatchKey("onion"));
    expect(ingredientMatchKey("almond milk")).not.toBe(ingredientMatchKey("milk"));
  });

  it("aligns simple plural/singular forms", () => {
    expect(ingredientMatchKey("eggs")).toBe(ingredientMatchKey("egg"));
    expect(ingredientMatchKey("tomatoes")).toBe(ingredientMatchKey("tomato"));
  });
});

describe("sumQuantities", () => {
  it("adds same-unit masses (1 lb + 1 lb = 2 lb)", () => {
    expect(sumQuantities([{ quantity: 1, unit: "lb" }, { quantity: 1, unit: "lb" }])).toEqual({
      quantity: 2,
      unit: "lb",
    });
  });

  it("adds across compatible mass units (1 lb + 8 oz = 1.5 lb)", () => {
    const r = sumQuantities([{ quantity: 1, unit: "lb" }, { quantity: 8, unit: "oz" }]);
    expect(r.unit).toBe("lb");
    expect(r.quantity).toBeCloseTo(1.5, 1);
  });

  it("sums unitless counts", () => {
    expect(sumQuantities([{ quantity: 2, unit: "" }, { quantity: 1, unit: "" }])).toEqual({
      quantity: 3,
      unit: "",
    });
  });

  it("falls back to a raw sum for incomparable units", () => {
    const r = sumQuantities([{ quantity: 1, unit: "lb" }, { quantity: 2, unit: "" }]);
    expect(r.quantity).toBe(3);
  });

  it("passes a single item through untouched", () => {
    expect(sumQuantities([{ quantity: 3, unit: "cups" }])).toEqual({ quantity: 3, unit: "cups" });
  });
});

describe("splitIngredientBlock", () => {
  it("splits a multi-line blob into separate items with qty/unit parsed", () => {
    const items = splitIngredientBlock("2 lbs ground beef\n1 onion\n3 cloves garlic");
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ name: "ground beef", quantity: 2, unit: "lbs" });
    expect(items[2]).toMatchObject({ name: "garlic", quantity: 3, unit: "cloves" });
  });

  it("handles comma/semicolon/bullet separated blobs", () => {
    const items = splitIngredientBlock("salt; pepper • paprika");
    expect(items.map((i) => i.name)).toEqual(["salt", "pepper", "paprika"]);
  });

  it("defaults quantity to 1 and unit to empty when absent", () => {
    const items = splitIngredientBlock("bay leaf");
    expect(items[0]).toMatchObject({ name: "bay leaf", quantity: 1, unit: "" });
  });
});

describe("planGroceryMerge", () => {
  it("stacks two ground-beef adds into one insert with summed quantity", () => {
    const plan = planGroceryMerge(
      [
        { name: "ground beef", quantity: 1, unit: "lb", category: "protein" },
        { name: "ground beef 80/20", quantity: 1, unit: "lb", category: "protein" },
      ],
      []
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts[0]).toMatchObject({ name: "ground beef", quantity: 2, unit: "lb" });
  });

  it("folds into an existing unchecked row instead of inserting", () => {
    const existing: ExistingGroceryItem[] = [
      { id: "g1", name: "Ground Beef", quantity: 1, unit: "lb", checked: false },
    ];
    const plan = planGroceryMerge([{ name: "ground beef 80/20", quantity: 1, unit: "lb" }], existing);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toEqual([{ id: "g1", quantity: 2, unit: "lb", name: "Ground Beef" }]);
  });

  it("does NOT merge into a checked (already-bought) row", () => {
    const existing: ExistingGroceryItem[] = [
      { id: "g1", name: "ground beef", quantity: 1, unit: "lb", checked: true },
    ];
    const plan = planGroceryMerge([{ name: "ground beef", quantity: 1, unit: "lb" }], existing);
    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0].quantity).toBe(1);
  });

  it("keeps distinct ingredients as separate inserts", () => {
    const plan = planGroceryMerge(
      [
        { name: "ground beef", quantity: 1, unit: "lb" },
        { name: "red onion", quantity: 2, unit: "" },
      ],
      []
    );
    expect(plan.inserts).toHaveLength(2);
  });

  it("carries recipe provenance from the first stamped item", () => {
    const plan = planGroceryMerge(
      [
        { name: "ground beef", quantity: 1, unit: "lb", added_via: "recipe", source_recipe_id: "r1" },
        { name: "ground beef", quantity: 1, unit: "lb" },
      ],
      []
    );
    expect(plan.inserts[0]).toMatchObject({ added_via: "recipe", source_recipe_id: "r1" });
  });
});

describe("formatQuantity", () => {
  it("strips trailing zeros", () => {
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(1.5)).toBe("1.5");
    expect(formatQuantity(0.25)).toBe("0.25");
  });
});
