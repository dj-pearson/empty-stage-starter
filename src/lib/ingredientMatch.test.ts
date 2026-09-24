import { describe, it, expect } from "vitest";
import { matchIngredientToFood } from "./ingredientMatch";

const foods = [
  { id: "eggplant", name: "Eggplant" },
  { id: "graham", name: "Graham crackers" },
  { id: "cheddar", name: "Cheddar cheese" },
  { id: "swiss", name: "Swiss cheese" },
  { id: "cream-cheese", name: "Cream cheese" },
];

describe("matchIngredientToFood", () => {
  it("does not link egg to eggplant", () => {
    expect(matchIngredientToFood("egg", foods)).toBeNull();
    expect(matchIngredientToFood("eggs", [...foods, { id: "egg", name: "Egg" }])?.id).toBe("egg");
  });

  it("does not link ham to graham crackers", () => {
    expect(matchIngredientToFood("ham", foods)).toBeNull();
    expect(matchIngredientToFood("ham", [...foods, { id: "ham", name: "Ham" }])?.id).toBe("ham");
  });

  it("links 'cheese' to at most one food", () => {
    const match = matchIngredientToFood("cheese", foods);
    expect(match).not.toBeNull();
    expect(["cheddar", "swiss", "cream-cheese"]).toContain(match!.id);
  });

  it("prefers an exact match, then the longest whole-word food", () => {
    const withPlain = [...foods, { id: "cheese", name: "Cheese" }];
    expect(matchIngredientToFood("Cheese", withPlain)?.id).toBe("cheese");
    expect(matchIngredientToFood("shredded cheddar cheese", withPlain)?.id).toBe("cheddar");
  });

  it("never matches an empty or missing name", () => {
    const withBlank = [...foods, { id: "blank", name: "" }];
    expect(matchIngredientToFood("", withBlank)).toBeNull();
    expect(matchIngredientToFood("   ", withBlank)).toBeNull();
    expect(matchIngredientToFood(undefined, withBlank)).toBeNull();
    expect(matchIngredientToFood(null, withBlank)).toBeNull();
  });
});
