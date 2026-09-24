import { describe, it, expect, vi, afterEach } from "vitest";
import { buildRecipeShareText, safeSourceHref, shareRecipe } from "./recipeShareText";
import type { Recipe } from "@/types";

const RECIPE: Recipe = {
  id: "r1",
  name: "Pancakes",
  food_ids: [],
  servings: "4",
  instructions: JSON.stringify(["Mix", "Cook"]),
  source_url: "https://example.com/pancakes",
  recipe_ingredients: [
    { id: "i1", recipe_id: "r1", sort_order: 0, name: "Flour", quantity: 2, unit: "cup" },
  ],
};

describe("recipeShareText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("carries the recipe itself and no dead /recipes/:id link", () => {
    const text = buildRecipeShareText(RECIPE);
    expect(text).toContain("- 2 cup Flour");
    expect(text).toContain("2. Cook");
    expect(text).toContain("Source: https://example.com/pancakes");
    expect(text).not.toContain("/recipes/r1");
  });

  it("drops a source that is not an http(s) URL", () => {
    expect(safeSourceHref("allrecipes.com/x")).toBeNull();
    expect(safeSourceHref("javascript:alert(1)")).toBeNull();
    expect(safeSourceHref(undefined)).toBeNull();
  });

  it("shares title and text only, and falls back to the clipboard", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });
    expect(await shareRecipe(RECIPE)).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Pancakes", text: expect.stringContaining("Flour") });

    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await shareRecipe(RECIPE)).toBe("copied");
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
