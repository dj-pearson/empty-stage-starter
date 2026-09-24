import { describe, it, expect } from "vitest";
import {
  KID_ALLERGEN_PICKER,
  canonicalAllergen,
  normalizeKidAllergenInput,
  pruneAllergenSeverity,
} from "./allergens";

describe("KID_ALLERGEN_PICKER", () => {
  it("lists the nine picker allergens, each with its own canonical key", () => {
    expect(KID_ALLERGEN_PICKER.map((p) => p.value)).toEqual([
      "peanuts", "tree nuts", "milk", "eggs", "fish", "shellfish", "soy", "wheat", "sesame",
    ]);
    expect(new Set(KID_ALLERGEN_PICKER.map((p) => canonicalAllergen(p.value))).size).toBe(9);
    expect(KID_ALLERGEN_PICKER.find((p) => p.value === "tree nuts")?.labelKey).toBe("allergens.tree_nuts");
  });
});

describe("normalizeKidAllergenInput", () => {
  it("drops blanks, snaps synonyms onto the picker and dedupes", () => {
    expect(normalizeKidAllergenInput(["  ", "dairy", "Milk", "Kiwi"])).toEqual(["milk", "Kiwi"]);
  });

  it("keeps an unknown allergen as typed rather than its singularized key", () => {
    expect(normalizeKidAllergenInput(["Citrus"])).toEqual(["Citrus"]);
  });

  it("stores picker spellings for plural or prefixed variants", () => {
    expect(normalizeKidAllergenInput(["Peanut", "en:tree-nuts", "gluten"])).toEqual(["peanuts", "tree nuts", "wheat"]);
  });

  it("caps each entry at 50 characters", () => {
    expect(normalizeKidAllergenInput(["y".repeat(80)])[0]).toHaveLength(50);
  });
});

describe("pruneAllergenSeverity", () => {
  it("drops a key whose allergen is no longer on the list", () => {
    expect(pruneAllergenSeverity(["milk"], { milk: "mild", peanuts: "severe" })).toEqual({ milk: "mild" });
  });

  it("keeps a severity whose key differs only in spelling, under the list's spelling", () => {
    expect(pruneAllergenSeverity(["peanuts"], { Peanuts: "severe" })).toEqual({ peanuts: "severe" });
  });

  it("drops a value that is not a known severity", () => {
    expect(pruneAllergenSeverity(["milk"], { milk: "very bad" })).toEqual({});
  });
});
