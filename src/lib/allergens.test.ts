import { describe, it, expect } from "vitest";
import { normalizeAllergen, matchingAllergen, isAllergenSafeFor } from "./allergens";

describe("normalizeAllergen", () => {
  it.each([
    ["Peanuts", "peanut"],
    ["peanut", "peanut"],
    ["en:peanuts", "peanut"],
    [" Tree Nuts ", "tree nut"],
    ["tree_nuts", "tree nut"],
    ["en:tree-nuts", "tree nut"],
    ["Eggs", "egg"],
    ["shellfish", "shellfish"],
    ["fish", "fish"],
    ["sesame", "sesame"],
    ["soy", "soy"],
    ["milk", "milk"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeAllergen(input)).toBe(expected);
  });
});

describe("matchingAllergen", () => {
  it("matches across spelling and case", () => {
    expect(matchingAllergen(["peanuts"], ["Peanut Oil", "PEANUTS"])).toBe("peanut");
    expect(matchingAllergen(["tree nuts"], ["en:tree-nuts"])).toBe("tree nut");
  });

  it("does not treat fish as shellfish or the other way round", () => {
    expect(matchingAllergen(["fish"], ["shellfish"])).toBeNull();
    expect(matchingAllergen(["shellfish"], ["fish"])).toBeNull();
  });

  it("is null when either side is empty or missing", () => {
    expect(matchingAllergen([], ["peanuts"])).toBeNull();
    expect(matchingAllergen(undefined, ["peanuts"])).toBeNull();
    expect(matchingAllergen(["peanuts"], null)).toBeNull();
  });
});

describe("isAllergenSafeFor", () => {
  it("rejects a food with the child's allergen", () => {
    expect(isAllergenSafeFor({ allergens: ["milk"] }, { allergens: ["Milk"] })).toBe(false);
    expect(isAllergenSafeFor({ allergens: ["milk"] }, { allergens: ["wheat"] })).toBe(true);
    expect(isAllergenSafeFor({}, { allergens: ["milk"] })).toBe(true);
  });
});
