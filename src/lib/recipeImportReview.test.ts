import { describe, it, expect } from "vitest";
import type { Recipe } from "@/types";
import {
  draftsFromImportRows,
  findLikelyDuplicate,
  mergeReviewedImport,
  normalizeRecipeName,
  normalizeSourceUrl,
} from "./recipeImportReview";
import { toIngredientPayloads } from "./recipeIngredients";

const existing: Recipe[] = [
  { id: "r1", name: "Mac & Cheese!", food_ids: [] },
  { id: "r2", name: "Tacos", food_ids: [], source_url: "https://www.example.com/tacos/?utm_source=pin#top" },
];

describe("normalizers", () => {
  it("ignores case, punctuation, accents and '&'", () => {
    expect(normalizeRecipeName("  Mac  and   Cheese ")).toBe("mac and cheese");
    expect(normalizeRecipeName("Mac & Cheese!")).toBe("mac and cheese");
    expect(normalizeRecipeName("Crème brûlée")).toBe("creme brulee");
  });

  it("reduces a URL to the page it names", () => {
    expect(normalizeSourceUrl("http://example.com/tacos?utm_medium=x")).toBe("example.com/tacos");
    expect(normalizeSourceUrl("https://www.example.com/tacos/?b=2&a=1")).toBe("example.com/tacos?a=1&b=2");
    expect(normalizeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeSourceUrl("not a url")).toBeNull();
  });
});

describe("findLikelyDuplicate", () => {
  it("matches the same source page first", () => {
    const hit = findLikelyDuplicate({ name: "Fish tacos", source_url: "http://example.com/tacos" }, existing);
    expect(hit).toEqual({ recipe: existing[1], reason: "source" });
  });

  it("falls back to a normalized name match", () => {
    const hit = findLikelyDuplicate({ name: "mac and cheese", source_url: "https://other.test/x" }, existing);
    expect(hit?.recipe.id).toBe("r1");
    expect(hit?.reason).toBe("name");
  });

  it("returns null for something new", () => {
    expect(findLikelyDuplicate({ name: "Pancakes" }, existing)).toBeNull();
  });
});

describe("draftsFromImportRows", () => {
  it("round-trips through the payload builder without inventing row ids", () => {
    const drafts = draftsFromImportRows([
      { food_id: "egg", sort_order: 1, name: "Eggs", quantity: 3, unit: null, group_label: null, optional_notes: "beaten" },
      { food_id: null, sort_order: 0, name: "Chives", quantity: null, unit: "tbsp", group_label: "Topping", optional_notes: "optional" },
    ]);
    expect(drafts.map((d) => d.name)).toEqual(["Chives", "Eggs"]);
    expect(drafts[0]).toMatchObject({ isOptional: true, prepNotes: "", section: "Topping", unit: "tbsp" });
    expect(drafts[1]).toMatchObject({ food_id: "egg", quantity: "3", prepNotes: "beaten" });
    const payloads = toIngredientPayloads(drafts);
    expect(payloads.every((p) => !("id" in p))).toBe(true);
  });
});

describe("mergeReviewedImport", () => {
  it("keeps draft-only fields and takes the reviewed ones", () => {
    const merged = mergeReviewedImport(
      { name: "Pie", food_ids: [], source_type: "website", total_time_minutes: 90, description: "old" },
      { name: "Apple pie", food_ids: ["apple"], description: undefined },
    );
    expect(merged).toMatchObject({ name: "Apple pie", food_ids: ["apple"], source_type: "website", total_time_minutes: 90 });
    expect(merged.description).toBeUndefined();
  });

  it("drops a parsed total when the parent cleared the prep and cook times it came with", () => {
    const merged = mergeReviewedImport(
      { name: "Pie", food_ids: [], prepTime: "20", cookTime: "70", total_time_minutes: 90 },
      { name: "Pie", food_ids: [], prepTime: undefined, cookTime: undefined },
    );
    expect(merged.total_time_minutes).toBeUndefined();
  });
});
