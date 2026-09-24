import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Recipe } from "@/types";
import { RecipeListItem } from "./RecipeListItem";

const recipe: Recipe = { id: "r1", name: "Mac and cheese", food_ids: ["f1", "f2"] };

function setup(missingCount = 2) {
  const handlers = { onView: vi.fn(), onPlan: vi.fn(), onAddMissing: vi.fn() };
  render(<RecipeListItem recipe={recipe} missingCount={missingCount} {...handlers} />);
  return handlers;
}

describe("RecipeListItem", () => {
  it("Enter on the grocery button adds the missing items and does not open the recipe", async () => {
    const user = userEvent.setup();
    const { onAddMissing, onView } = setup();
    screen.getByRole("button", { name: /Add 2 missing/ }).focus();
    await user.keyboard("{Enter}");
    expect(onAddMissing).toHaveBeenCalledWith(recipe);
    expect(onView).not.toHaveBeenCalled();
  });

  it("the calendar button plans the recipe", async () => {
    const user = userEvent.setup();
    const { onPlan, onView } = setup();
    await user.click(screen.getByRole("button", { name: /Plan Mac and cheese/ }));
    expect(onPlan).toHaveBeenCalledWith(recipe);
    expect(onView).not.toHaveBeenCalled();
  });

  it("the name opens the recipe; the row itself is a listitem, not a button", async () => {
    const user = userEvent.setup();
    const { onView } = setup();
    expect(screen.getByRole("listitem")).not.toHaveAttribute("tabindex");
    await user.click(screen.getByRole("button", { name: "Mac and cheese" }));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("disables the grocery button when everything is on hand", () => {
    setup(0);
    expect(screen.getByRole("button", { name: /All on hand/ })).toBeDisabled();
  });
});
