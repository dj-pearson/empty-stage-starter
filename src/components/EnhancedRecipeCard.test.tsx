import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Food, Kid, Recipe } from "@/types";
import { getKidRecipeFit, summarizeKidFits } from "@/lib/kidFit";
import { EnhancedRecipeCard } from "./EnhancedRecipeCard";

const ava: Kid = { id: "k-ava", name: "Ava", allergens: ["peanuts"] };
const peanutButter: Food = {
  id: "f-pb",
  name: "Peanut butter",
  category: "protein",
  is_safe: true,
  is_try_bite: false,
  allergens: ["en:peanuts"],
};
const recipe: Recipe = {
  id: "r1",
  name: "PB Toast",
  food_ids: ["f-pb"],
  total_time_minutes: 10,
  servings: "2",
};
const foodById = new Map([[peanutButter.id, peanutButter]]);
const fit = summarizeKidFits([{ kid: ava, fit: getKidRecipeFit(ava, recipe, foodById, []) }]);

function setup(overrides: Partial<React.ComponentProps<typeof EnhancedRecipeCard>> = {}) {
  const handlers = {
    onView: vi.fn(),
    onPlan: vi.fn(),
    onAddMissing: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
  };
  render(<EnhancedRecipeCard recipe={recipe} fit={fit} missingCount={2} {...handlers} {...overrides} />);
  return handlers;
}

describe("EnhancedRecipeCard", () => {
  it("names the kid an allergen rules the recipe out for", () => {
    setup();
    expect(screen.getByText(/Not for Ava/)).toBeInTheDocument();
    expect(screen.queryByText(/Safe for/)).not.toBeInTheDocument();
  });

  it("calls onDelete once from the menu and shows no confirm dialog of its own", async () => {
    const user = userEvent.setup();
    const { onDelete } = setup();
    await user.click(screen.getByRole("button", { name: /More for PB Toast/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(recipe);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("opens the recipe when Enter is pressed on the title", async () => {
    const user = userEvent.setup();
    const { onView, onPlan } = setup();
    screen.getByRole("button", { name: "PB Toast" }).focus();
    await user.keyboard("{Enter}");
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onPlan).not.toHaveBeenCalled();
  });

  it("Plan calls onPlan and not onView", async () => {
    const user = userEvent.setup();
    const { onPlan, onView } = setup();
    await user.click(screen.getByRole("button", { name: /Plan PB Toast/ }));
    expect(onPlan).toHaveBeenCalledWith(recipe);
    expect(onView).not.toHaveBeenCalled();
  });

  it("Missing shows the count and is disabled as All on hand at 0", async () => {
    const user = userEvent.setup();
    const { onAddMissing } = setup();
    await user.click(screen.getByRole("button", { name: /Missing \(2\)/ }));
    expect(onAddMissing).toHaveBeenCalledTimes(1);
  });

  it("disables Missing at 0", () => {
    setup({ missingCount: 0 });
    expect(screen.getByRole("button", { name: /All on hand/ })).toBeDisabled();
  });

  it("appends no JSON-LD script (the page is noindex)", () => {
    setup();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
  });
});
