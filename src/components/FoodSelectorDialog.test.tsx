import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Real i18n instance, so t() interpolates the defaultValue copy.
import "@/i18n";
import type { Food, PlanEntry, Recipe } from "@/types";
import { FoodSelectorDialog, type FoodSelectorKid } from "./FoodSelectorDialog";

const food = (id: string, name: string, over: Partial<Food> = {}): Food => ({
  id,
  name,
  category: "protein",
  is_safe: true,
  is_try_bite: false,
  quantity: 2,
  unit: "servings",
  ...over,
});

const FOODS: Food[] = [
  food("f-chicken", "Chicken", { quantity: 0 }),
  food("f-rice", "Rice"),
  food("f-pb", "Peanut butter", { allergens: ["en:peanuts"] }),
  food("f-broc", "Broccoli", { category: "vegetable" }),
];

const RECIPES: Recipe[] = [
  { id: "r-stirfry", name: "Stir fry", food_ids: ["f-chicken", "f-rice"] },
  { id: "r-pbj", name: "PB sandwich", food_ids: ["f-pb"] },
];

const KID: FoodSelectorKid = {
  id: "k1",
  name: "Maya",
  allergens: ["peanuts"],
  disliked_foods: ["broccoli"],
  always_eats_foods: ["f-rice"],
};

const HISTORY: PlanEntry[] = [
  { id: "h1", kid_id: "k1", date: "2026-09-01", meal_slot: "dinner", food_id: "f-rice", result: "ate" },
  { id: "h2", kid_id: "k1", date: "2026-09-02", meal_slot: "dinner", food_id: "f-rice", result: "refused" },
  { id: "h3", kid_id: "k2", date: "2026-09-02", meal_slot: "dinner", food_id: "f-rice", result: "ate" },
];

function setup(extra: Partial<Parameters<typeof FoodSelectorDialog>[0]> = {}) {
  const onSelectFood = vi.fn();
  const onSelectRecipe = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <FoodSelectorDialog
      open
      onOpenChange={onOpenChange}
      foods={FOODS}
      recipes={RECIPES}
      slot="dinner"
      date="2026-09-08"
      onSelectFood={onSelectFood}
      onSelectRecipe={onSelectRecipe}
      kid={KID}
      planEntries={HISTORY}
      {...extra}
    />,
  );
  return { onSelectFood, onSelectRecipe, onOpenChange };
}

describe("FoodSelectorDialog", () => {
  it("lists an out-of-stock food and lets it be selected", async () => {
    const { onSelectFood } = setup();
    const chicken = screen.getByRole("button", { name: /Chicken/ });
    expect(chicken).toHaveTextContent(/Need to buy/);
    expect(chicken).not.toHaveAttribute("aria-disabled");
    await userEvent.click(chicken);
    expect(onSelectFood).toHaveBeenCalledWith("f-chicken");
  });

  it("blocks a food carrying the kid's allergen and says why", async () => {
    const { onSelectFood } = setup();
    const pb = screen.getByRole("button", { name: /Peanut butter/ });
    expect(pb).toHaveAttribute("aria-disabled", "true");
    const reasonId = pb.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId as string)).toHaveTextContent(/Contains peanut, Maya is allergic/);
    await userEvent.click(pb);
    expect(onSelectFood).not.toHaveBeenCalled();
  });

  it("groups by how the kid eats, with this kid's ate count", () => {
    setup();
    expect(screen.getByRole("heading", { name: /Always eats/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Dislikes/ })).toBeInTheDocument();
    // Rice: one ate out of two tries for Maya; the sibling's entry is ignored.
    expect(screen.getByRole("button", { name: /Rice/ })).toHaveTextContent("ate 1/2");
  });

  it("does not lock an out-of-stock recipe and counts what to buy", async () => {
    const { onSelectRecipe } = setup();
    await userEvent.click(screen.getByRole("tab", { name: /Recipes/ }));
    const stirFry = screen.getByRole("button", { name: /Stir fry/ });
    expect(stirFry).toHaveTextContent("Need to buy (1)");
    expect(stirFry).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /PB sandwich/ })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(stirFry);
    expect(onSelectRecipe).toHaveBeenCalledWith("r-stirfry");
  });
});
