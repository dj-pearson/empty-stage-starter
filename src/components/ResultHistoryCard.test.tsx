import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import "@/i18n/appLocale";
import type { Food, Kid, PlanEntry } from "@/types";
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

interface CardOpts {
  kidId?: string | null;
  kids?: Pick<Kid, "id" | "name">[];
  to?: string;
  todayIso?: string;
}

function renderCard(entries: PlanEntry[], opts: CardOpts = {}) {
  return render(
    <MemoryRouter>
      <ResultHistoryCard
        entries={entries}
        foods={foods}
        recipes={[{ id: "r-bowl", name: "Rice bowl" }]}
        {...opts}
      />
    </MemoryRouter>
  );
}

const twoKids = [
  { id: "k1", name: "Maya" },
  { id: "k2", name: "Sam" },
];

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

  it("hides a sibling's row in kid scope", () => {
    renderCard(
      [
        entry({ id: "e1", kid_id: "k1", food_id: "f-apple", result: "ate" }),
        entry({ id: "e2", kid_id: "k2", food_id: "f-rice", result: "ate" }),
      ],
      { kidId: "k1", kids: twoKids }
    );
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.queryByText("Rice")).toBeNull();
    expect(screen.queryByText(/Maya/)).toBeNull();
  });

  it("names each child on the same dish in family scope", () => {
    renderCard(
      [
        entry({ id: "e1", kid_id: "k1", result: "ate" }),
        entry({ id: "e2", kid_id: "k2", result: "refused" }),
      ],
      { kidId: null, kids: twoKids }
    );
    expect(screen.getAllByText("Apple")).toHaveLength(2);
    expect(screen.getByText(/^Maya · /)).toBeInTheDocument();
    expect(screen.getByText(/^Sam · /)).toBeInTheDocument();
  });

  it("falls back to a neutral name for a deleted child", () => {
    renderCard([entry({ id: "e1", kid_id: "k-gone", result: "ate" })], { kidId: null, kids: twoKids });
    expect(screen.getByText(/^Former child · /)).toBeInTheDocument();
  });

  it("scopes the View journal link to the child", () => {
    renderCard([entry({ result: "ate" })], { kidId: "k1", kids: twoKids });
    expect(screen.getByRole("link", { name: /food journal/i })).toHaveAttribute(
      "href",
      "/dashboard/food-journal?kid=k1"
    );
  });

  it("uses the to prop for the journal link when given", () => {
    renderCard([entry({ result: "ate" })], { to: "/dashboard/food-journal?range=30" });
    expect(screen.getByRole("link", { name: /food journal/i })).toHaveAttribute(
      "href",
      "/dashboard/food-journal?range=30"
    );
  });

  it("leaves out an entry dated after today", () => {
    renderCard(
      [
        entry({ id: "e1", date: "2026-09-20", food_id: "f-apple", result: "ate" }),
        entry({ id: "e2", date: "2026-09-21", food_id: "f-rice", result: "ate" }),
      ],
      { todayIso: "2026-09-20" }
    );
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.queryByText("Rice")).toBeNull();
  });

  it("omits the year for a date in the current year", () => {
    renderCard([entry({ date: "2026-09-20", result: "ate" })], { todayIso: "2026-09-24" });
    expect(screen.queryByText(/2026/)).toBeNull();
  });

  it("shows five rows, then all of them behind a toggle", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 7 }, (_, i) =>
      entry({ id: `e${i}`, date: `2026-09-${String(10 + i).padStart(2, "0")}`, result: "ate" })
    );
    renderCard(many, { todayIso: "2026-09-24" });
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    const toggle = screen.getByRole("button", { name: "Show all 7" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
  });

  it("renders a four-row recipe once per child", () => {
    const rows = (kid: string, start: number) =>
      ["f-rice", "f-beans", "f-apple", "f-rice"].map((food, i) =>
        entry({
          id: `e${start + i}`,
          kid_id: kid,
          food_id: food,
          recipe_id: "r-bowl",
          result: i === 0 ? "ate" : null,
        })
      );
    renderCard([...rows("k1", 0), ...rows("k2", 10)], { kidId: null, kids: twoKids });
    expect(screen.getAllByText("Rice bowl")).toHaveLength(2);
  });

  it("links the empty state to the Planner", () => {
    renderCard([]);
    expect(screen.getByRole("link", { name: "Open the Planner" })).toHaveAttribute("href", "/dashboard/planner");
  });

  it("renders a note as a quotation, not literal quote marks", () => {
    renderCard([entry({ result: "ate", notes: "Licked it first" } as Partial<PlanEntry>)]);
    const note = screen.getByText("Licked it first");
    expect(note.tagName).toBe("Q");
  });
});
