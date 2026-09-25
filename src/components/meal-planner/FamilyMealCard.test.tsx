import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import { FamilyMealCard } from "./FamilyMealCard";

const KIDS: Kid[] = [
  { id: "sam", name: "Sam" },
  { id: "ada", name: "Ada" },
];
const FOODS: Food[] = [
  { id: "pasta", name: "Pasta", category: "carb", is_safe: true, is_try_bite: false, quantity: 2 },
  { id: "cheese", name: "Cheese", category: "dairy", is_safe: true, is_try_bite: false, quantity: 0 },
];
const RECIPES: Recipe[] = [{ id: "mac", name: "Mac and cheese", food_ids: ["pasta", "cheese"] }];
const foodById = new Map(FOODS.map((f) => [f.id, f]));
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

const entry = (id: string, kid: string, food: string, primary: boolean, date: string): PlanEntry => ({
  id,
  kid_id: kid,
  date,
  meal_slot: "dinner",
  food_id: food,
  recipe_id: "mac",
  is_primary_dish: primary,
  result: null,
});

function renderCard(date: string, extra: Partial<Parameters<typeof FamilyMealCard>[0]> = {}) {
  const onMarkResult = vi.fn();
  const onDeleteEntries = vi.fn();
  const entries = [
    entry("s-cheese", "sam", "cheese", false, date),
    entry("s-pasta", "sam", "pasta", true, date),
    entry("a-pasta", "ada", "pasta", true, date),
    entry("a-cheese", "ada", "cheese", false, date),
  ];
  render(
    <FamilyMealCard
      slot="dinner"
      label="Dinner"
      date={date}
      today="2026-09-24"
      entries={entries}
      kids={KIDS}
      foodById={foodById}
      recipeById={recipeById}
      singleKidMode={false}
      activeKidId={null}
      onTapAdd={vi.fn()}
      onTapChangeFamilyMeal={vi.fn()}
      onTapKidSubstitute={vi.fn()}
      onMarkResult={onMarkResult}
      onDeleteEntries={onDeleteEntries}
      {...extra}
    />,
  );
  return { onMarkResult, onDeleteEntries, entries };
}

describe("FamilyMealCard, family of two", () => {
  it("shows outcome controls for both kids and logs on that kid's primary row", async () => {
    const user = userEvent.setup();
    const { onMarkResult } = renderCard("2026-09-24");

    const sam = screen.getByRole("group", { name: "How did Sam do?" });
    const ada = screen.getByRole("group", { name: "How did Ada do?" });
    expect(within(sam).getAllByRole("button")).toHaveLength(3);
    expect(within(ada).getByRole("button", { name: "Ate" })).toHaveAttribute("aria-pressed", "false");

    await user.click(within(ada).getByRole("button", { name: "Tasted" }));
    expect(onMarkResult).toHaveBeenCalledTimes(1);
    expect(onMarkResult.mock.calls[0][0].id).toBe("a-pasta");
    expect(onMarkResult.mock.calls[0][1]).toBe("tasted");
  });

  it("offers Everyone ate it when both share the meal", async () => {
    const user = userEvent.setup();
    const { onMarkResult } = renderCard("2026-09-23");
    await user.click(screen.getByRole("button", { name: /Everyone ate it/ }));
    expect(onMarkResult.mock.calls.map((c) => [c[0].id, c[1]])).toEqual([
      ["s-pasta", "ate"],
      ["a-pasta", "ate"],
    ]);
  });

  it("has no outcome controls on a future date", () => {
    renderCard("2026-09-25");
    expect(screen.queryByRole("group", { name: /How did/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Everyone ate it/ })).not.toBeInTheDocument();
  });

  it("shows Need to buy instead of a destructive Out badge, and removes per kid", async () => {
    const user = userEvent.setup();
    const onNeedToBuy = vi.fn();
    const { onDeleteEntries } = renderCard("2026-09-25", { onNeedToBuy });
    expect(screen.queryByText("Out")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Need to buy" }));
    expect(onNeedToBuy).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove Sam's Dinner" }));
    expect(onDeleteEntries).toHaveBeenCalledWith(["s-cheese", "s-pasta"]);
  });

  it("renders one add row per kid for a try bite", () => {
    const onTapAdd = vi.fn();
    render(
      <FamilyMealCard
        slot="try_bite"
        label="Try Bite"
        date="2026-09-24"
        today="2026-09-24"
        entries={[]}
        kids={KIDS}
        foodById={foodById}
        recipeById={recipeById}
        singleKidMode={false}
        activeKidId={null}
        onTapAdd={onTapAdd}
        onTapChangeFamilyMeal={vi.fn()}
        onTapKidSubstitute={vi.fn()}
        onMarkResult={vi.fn()}
      />,
    );
    expect(screen.queryByText("Add family meal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Try Bite for Sam" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Try Bite for Ada" })).toBeInTheDocument();
  });
});
