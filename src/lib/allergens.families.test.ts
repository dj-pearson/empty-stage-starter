import { describe, it, expect } from "vitest";
import {
  allergenFamilyOf,
  allergenFamilyMembers,
  allergensInText,
  allergenSeverityFor,
  isAllergenSafeFor,
  isSevereAllergen,
  matchingAllergen,
  matchingFoodAllergen,
  matchingFoodAllergens,
  worstFoodAllergen,
} from "./allergens";

// Item 28: allergen families. One way only: the family catches its members.

const FAMILIES: Record<string, string[]> = {
  "tree nuts": ["almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "macadamia", "brazil nut", "chestnut"],
  shellfish: ["shrimp", "crab", "lobster", "prawn", "crayfish"],
  fish: ["salmon", "tuna", "cod", "tilapia", "trout", "halibut", "sardine", "anchovies"],
  milk: ["cheese", "butter", "yogurt", "cream", "whey", "casein"],
  wheat: ["spelt", "semolina", "durum", "couscous", "bulgur"],
};

describe("allergen families: food tags", () => {
  for (const [family, members] of Object.entries(FAMILIES)) {
    it.each(members)(`a food tagged %s hits a kid's ${family}`, (member) => {
      expect(matchingAllergen([family], [member])).not.toBeNull();
      // Plural and OpenFoodFacts spellings too.
      const plural = member.endsWith("s") ? member : `${member}s`;
      expect(matchingAllergen([family], [`en:${plural.replace(/\s+/g, "-")}`])).not.toBeNull();
    });
  }

  it("dairy and gluten reach the same families as milk and wheat", () => {
    expect(matchingAllergen(["dairy"], ["whey"])).toBe("milk");
    expect(matchingAllergen(["gluten"], ["semolina"])).toBe("wheat");
  });

  it("returns the kid-side family key", () => {
    expect(matchingAllergen(["tree nuts"], ["Almonds"])).toBe("tree nut");
    expect(allergenFamilyOf("en:cashews")).toBe("tree nut");
    expect(allergenFamilyOf("peanut")).toBeNull();
  });

  it("is one way: an almond allergy does not flag every tree nut", () => {
    expect(matchingAllergen(["almond"], ["tree nuts"])).toBeNull();
    expect(matchingAllergen(["almond"], ["cashew"])).toBeNull();
    expect(matchingAllergen(["almond"], ["almonds"])).toBe("almond");
    expect(matchingAllergen(["shrimp"], ["shellfish"])).toBeNull();
    expect(matchingAllergen(["cheese"], ["milk"])).toBeNull();
  });

  it("keeps fish, shellfish and peanut apart", () => {
    expect(matchingAllergen(["fish"], ["shrimp"])).toBeNull();
    expect(matchingAllergen(["shellfish"], ["salmon"])).toBeNull();
    expect(matchingAllergen(["peanuts"], ["almond"])).toBeNull();
    expect(matchingAllergen(["tree nuts"], ["peanut"])).toBeNull();
  });

  it("exposes the members of a family and none for a plain allergen", () => {
    expect(allergenFamilyMembers("tree nuts")).toContain("macadamia");
    expect(allergenFamilyMembers("peanut")).toEqual([]);
  });
});

describe("allergen families: food names", () => {
  it.each([
    ["tree nuts", "Almond flour"],
    ["tree nuts", "Roasted cashews"],
    ["tree nuts", "Mixed nuts"],
    ["tree nuts", "Almond milk"],
    ["shellfish", "Garlic shrimp"],
    ["shellfish", "Crab cakes"],
    ["fish", "Fish sticks"],
    ["fish", "Baked salmon"],
    ["milk", "Mac and cheese"],
    ["milk", "Greek yogurt"],
    ["milk", "Ice cream"],
    ["milk", "Butter"],
    ["milk", "Sugar-free yogurt"],
    ["wheat", "Whole wheat bread"],
    ["wheat", "Couscous salad"],
    ["peanuts", "Peanut butter"],
    ["eggs", "Scrambled eggs"],
    ["sesame", "Tahini dip"],
    ["soy", "Tofu stir fry"],
  ])("kid %s: %s is a hit", (kid, name) => {
    expect(matchingFoodAllergen([kid], { name, allergens: [] })).not.toBeNull();
    expect(isAllergenSafeFor({ allergens: [kid] }, { name, allergens: null })).toBe(false);
  });

  it.each([
    ["tree nuts", "Butternut squash"],
    ["tree nuts", "Coconut"],
    ["tree nuts", "Coconut milk"],
    ["tree nuts", "Nutmeg"],
    ["tree nuts", "Water chestnuts"],
    ["tree nuts", "Doughnut"],
    ["tree nuts", "Peanut butter"],
    ["tree nuts", "Nut-free granola"],
    ["peanuts", "Almonds"],
    ["milk", "Peanut butter"],
    ["milk", "Almond milk"],
    ["milk", "Oat milk"],
    ["milk", "Coconut cream"],
    ["milk", "Cocoa butter"],
    ["milk", "Butter beans"],
    ["milk", "Butternut squash"],
    ["milk", "Cream of tartar"],
    ["milk", "Dairy-free cheese"],
    ["milk", "Non-dairy creamer"],
    ["eggs", "Eggplant"],
    ["eggs", "Egg-free pasta"],
    ["wheat", "Buckwheat pancakes"],
    ["wheat", "Gluten free spelt bread"],
    ["fish", "Swedish fish"],
    ["fish", "Goldfish crackers"],
    ["fish", "Shellfish stock"],
    ["shellfish", "Crab apple jelly"],
  ])("kid %s: %s is not a hit", (kid, name) => {
    expect(matchingFoodAllergen([kid], { name, allergens: [] })).toBeNull();
  });

  it("reads allergen tags written as phrases", () => {
    expect(matchingFoodAllergen(["peanuts"], { name: "Stir fry", allergens: ["Peanut Oil"] })).toBe("peanut");
  });

  it("matches a custom allergen by whole word", () => {
    expect(matchingFoodAllergen(["Kiwis"], { name: "Kiwi slices" })).toBe("kiwi");
    expect(matchingFoodAllergen(["kiwi"], { name: "Kiwifruit" })).toBeNull();
  });

  it("names nothing in a text with no allergen words", () => {
    expect(allergensInText("Butternut squash soup").size).toBe(0);
    expect([...allergensInText("Almond butter")].sort()).toEqual(["almond", "tree nut"]);
  });

  it("is null without a kid list or a food", () => {
    expect(matchingFoodAllergen([], { name: "Peanuts" })).toBeNull();
    expect(matchingFoodAllergen(null, { name: "Peanuts" })).toBeNull();
    expect(matchingFoodAllergen(["peanuts"], null)).toBeNull();
  });
});

describe("allergen severity", () => {
  const kid = { allergens: ["Peanuts", "milk"], allergen_severity: { Peanuts: "severe", milk: "mild", junk: "bad" } };

  it("looks severity up canonically", () => {
    expect(allergenSeverityFor(kid, "peanut")).toBe("severe");
    expect(allergenSeverityFor(kid, "dairy")).toBe("mild");
    expect(allergenSeverityFor(kid, "egg")).toBeNull();
    expect(allergenSeverityFor({}, "peanut")).toBeNull();
    expect(allergenSeverityFor(kid, "junk")).toBeNull();
  });

  it("isSevereAllergen is true only for a recorded severe", () => {
    expect(isSevereAllergen(kid, "peanut")).toBe(true);
    expect(isSevereAllergen(kid, "milk")).toBe(false);
    expect(isSevereAllergen(kid, null)).toBe(false);
    expect(isSevereAllergen(null, "peanut")).toBe(false);
  });
});

describe("worst hit per food (item 29)", () => {
  const kid = { allergens: ["milk", "eggs", "tree nuts"], allergen_severity: { milk: "mild", eggs: "severe" } };

  it("lists every kid-side key the food hits", () => {
    expect(matchingFoodAllergens(kid.allergens, { name: "Cheese omelette", allergens: ["milk", "eggs"] })).toEqual([
      "milk",
      "egg",
    ]);
    expect(matchingFoodAllergens(kid.allergens, { name: "Apple", allergens: [] })).toEqual([]);
  });

  it("returns the severe hit when a mild one is listed first", () => {
    expect(worstFoodAllergen(kid, { name: "Cheese omelette", allergens: ["milk", "eggs"] })).toEqual({
      allergen: "egg",
      severity: "severe",
    });
  });

  it("prefers a rated hit over an unrated one and returns null for a safe food", () => {
    expect(worstFoodAllergen(kid, { name: "Almond milk latte", allergens: ["almonds", "milk"] })).toEqual({
      allergen: "milk",
      severity: "mild",
    });
    expect(worstFoodAllergen(kid, { name: "Rice", allergens: [] })).toBeNull();
  });
});

describe("plural folding and guard edge cases (item 28 review)", () => {
  it("a custom allergen matches its regular plural in a food name", () => {
    expect(matchingFoodAllergen(["strawberry"], { name: "Strawberries", allergens: [] })).toBe("strawberry");
    expect(matchingFoodAllergen(["tomato"], { name: "Roasted tomatoes", allergens: [] })).toBe("tomato");
    expect(matchingFoodAllergen(["peach"], { name: "Canned peaches", allergens: [] })).toBe("peach");
    expect(matchingFoodAllergen(["strawberries"], { name: "Strawberry jam", allergens: [] })).toBe("strawberry");
  });

  it("cocoa milk is dairy, cocoa butter is not", () => {
    expect(matchingFoodAllergen(["milk"], { name: "Cocoa milk", allergens: [] })).toBe("milk");
    expect(matchingFoodAllergen(["milk"], { name: "Cocoa butter", allergens: [] })).toBeNull();
  });

  it("free-range is not a free-of claim", () => {
    expect(matchingFoodAllergen(["peanuts"], { name: "Peanut free-range chicken", allergens: [] })).toBe("peanut");
    expect(matchingFoodAllergen(["peanuts"], { name: "Peanut-free granola", allergens: [] })).toBeNull();
  });
});
