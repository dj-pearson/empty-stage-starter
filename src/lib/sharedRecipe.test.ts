import { describe, it, expect } from "vitest";
import { splitSteps, toSharedRecipeView } from "./sharedRecipe";

describe("toSharedRecipeView", () => {
  it("shapes the RPC row: grouped ingredient lines, steps, times, servings", () => {
    const view = toSharedRecipeView([
      {
        name: "Mac and cheese",
        image_url: "https://img.example.com/mac.jpg",
        ingredients: [
          { name: "Macaroni", quantity: 2, unit: "cups", group: null },
          { name: "Cheddar", quantity: "1.5", unit: "cup", group: "Sauce" },
          { name: "", quantity: 1 },
          "not an object",
        ],
        instructions: '["Boil pasta","Stir in cheese"]',
        prep_time: "5",
        cook_time: "15 min",
        total_time_minutes: null,
        servings: "4",
      },
    ]);
    expect(view).toEqual({
      name: "Mac and cheese",
      imageUrl: "https://img.example.com/mac.jpg",
      groups: [
        { label: "", lines: ["2 cups Macaroni"] },
        { label: "Sauce", lines: ["1.5 cup Cheddar"] },
      ],
      steps: ["Boil pasta", "Stir in cheese"],
      prepMinutes: 5,
      cookMinutes: 15,
      totalMinutes: 20,
      servings: "4",
    });
  });

  it("drops an image that is not http(s)", () => {
    const view = toSharedRecipeView([{ name: "X", image_url: "javascript:alert(1)" }]);
    expect(view?.imageUrl).toBeNull();
  });

  it("is null when the RPC returned nothing (unknown or revoked token)", () => {
    expect(toSharedRecipeView([])).toBeNull();
    expect(toSharedRecipeView(null)).toBeNull();
  });

  it("splits plain-text steps and strips numbering", () => {
    expect(splitSteps("1. Boil\n2) Drain\n\nServe")).toEqual(["Boil", "Drain", "Serve"]);
  });
});
