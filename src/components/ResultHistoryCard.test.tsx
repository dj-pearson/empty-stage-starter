import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import "@/i18n/appLocale";
import type { Food, PlanEntry } from "@/types";
import { ResultHistoryCard } from "./ResultHistoryCard";

const foods: Food[] = [
  { id: "f-rice", name: "Rice", category: "carb", is_safe: true, is_try_bite: false },
  { id: "f-beans", name: "Beans", category: "protein", is_safe: true, is_try_bite: false },
  { id: "f-apple", name: "Apple", category: "fruit", is_safe: true, is_try_bite: false },
] as Food[];

function entry(over: Partial<PlanEntry>): PlanEntry {
  return {
    id: "e1",
    kid_id: "k1",
    date: "2026-09-20",
    meal_slot: "dinner",
    food_id: "f-apple",
    result: null,
    ...over,
  } as PlanEntry;
}

function renderCard(entries: PlanEntry[]) {
  return render(
    <MemoryRouter>
      <ResultHistoryCard entries={entries} foods={foods} recipes={[{ id: "r-bowl", name: "Rice bowl" }]} />
    </MemoryRouter>
  );
}

describe("ResultHistoryCard", () => {
  it("names a recipe entry after the recipe, once", () => {
    renderCard([
      entry({ id: "e1", food_id: "f-rice", recipe_id: "r-bowl", result: "ate" }),
      entry({ id: "e2", food_id: "f-beans", recipe_id: "r-bowl", result: null }),
    ]);
    expect(screen.getAllByText("Rice bowl")).toHaveLength(1);
    expect(screen.queryByText("Beans")).toBeNull();
  });

  it("renders the translated result, not the stored value", () => {
    renderCard([entry({ result: "ate" })]);
    expect(screen.getByText("Ate")).toBeInTheDocument();
    expect(screen.queryByText("ate")).toBeNull();
  });

  it("labels the slot from mealSlots", () => {
    renderCard([entry({ meal_slot: "snack1", result: "tasted" })]);
    expect(screen.getByText(/Morning snack/)).toBeInTheDocument();
    expect(screen.getByText("Tasted")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is logged", () => {
    renderCard([entry({ result: null })]);
    expect(screen.getByText("Recent meal history")).toBeInTheDocument();
    expect(screen.getByText(/No logged meals yet/)).toBeInTheDocument();
  });
});
