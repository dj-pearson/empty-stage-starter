import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import type { Food, GroceryItem, Kid, Recipe } from "@/types";

const addGroceryItemsMerged = vi.fn(() => 1);
const deleteGroceryItems = vi.fn();
let groceryItems: GroceryItem[] = [];

vi.mock("@/contexts/AppContext", () => ({
  usePlan: () => ({
    planEntries: [],
    scheduleRecipe: vi.fn(),
    deletePlanEntries: vi.fn(),
  }),
  useGrocery: () => ({ groceryItems, addGroceryItemsMerged, deleteGroceryItems }),
  useKids: () => ({ kids: [] }),
  useFoods: () => ({ foods: [], catalogById: {} }),
}));

vi.mock("@/components/HideVeggiesDialog", () => ({ HideVeggiesDialog: () => null }));

import { RecipeDetailView } from "./RecipeDetailView";

const FOODS: Food[] = [
  { id: "f-pb", name: "Peanut butter", category: "protein", is_safe: true, is_try_bite: false, allergens: ["peanuts"], quantity: 1 },
  { id: "f-bread", name: "Bread", category: "carb", is_safe: true, is_try_bite: false, allergens: [], quantity: 0 },
];

const PB: Recipe = {
  id: "r-pb",
  name: "PB Toast",
  food_ids: ["f-pb", "f-bread"],
  servings: "Serves 4",
};

const PANCAKES: Recipe = {
  id: "r-pan",
  name: "Pancakes",
  food_ids: [],
  servings: "4",
  recipe_ingredients: [
    { id: "i1", recipe_id: "r-pan", sort_order: 0, name: "Flour", quantity: 2, unit: "cup", food_id: null },
    { id: "i2", recipe_id: "r-pan", sort_order: 1, name: "Milk", quantity: 1.5, unit: "cup", food_id: null, optional_notes: "any kind" },
  ],
};

type Props = Parameters<typeof RecipeDetailView>[0];

function setup(recipe: Recipe | null, kids: Kid[] = [], overrides: Partial<Props> = {}) {
  const props: Props = {
    recipe,
    open: true,
    onOpenChange: vi.fn(),
    foods: FOODS,
    kids,
    onUpdateRecipe: vi.fn(),
    onEdit: vi.fn(),
    onRequestDelete: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <MemoryRouter>
      <RecipeDetailView {...props} />
    </MemoryRouter>,
  );
  const rerender = (next: Partial<Props>) =>
    utils.rerender(
      <MemoryRouter>
        <RecipeDetailView {...props} {...next} />
      </MemoryRouter>,
    );
  return { ...utils, props, rerender };
}

const servingsText = () => screen.getByText(/^\d+ servings?$/);

describe("RecipeDetailView", () => {
  beforeEach(() => {
    groceryItems = [];
    vi.clearAllMocks();
  });

  it("goes from null to a recipe to another recipe without a hooks error", () => {
    const { rerender } = setup(null);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender({ recipe: PB });
    expect(screen.getByRole("heading", { name: "PB Toast" })).toBeInTheDocument();
    rerender({ recipe: PANCAKES });
    expect(screen.getByRole("heading", { name: "Pancakes" })).toBeInTheDocument();
    rerender({ recipe: null });
    expect(screen.queryByRole("heading", { name: "Pancakes" })).toBeNull();
  });

  it("resets the servings when another recipe opens", () => {
    const { rerender } = setup(PANCAKES);
    fireEvent.click(screen.getByRole("button", { name: "More servings" }));
    expect(servingsText()).toHaveTextContent("5 servings");
    rerender({ recipe: PB });
    expect(servingsText()).toHaveTextContent("4 servings");
  });

  it("renders no source link for a URL without a scheme, and does not crash", () => {
    setup({ ...PB, source_url: "allrecipes.com/x" });
    expect(screen.getByRole("heading", { name: "PB Toast" })).toBeInTheDocument();
    expect(screen.queryByText(/allrecipes/)).toBeNull();
    expect(screen.queryByText("Source:")).toBeNull();
  });

  it("links a real http source by host", () => {
    setup({ ...PB, source_url: "https://www.allrecipes.com/x" });
    const link = screen.getByRole("link", { name: "allrecipes.com" });
    expect(link).toHaveAttribute("href", "https://www.allrecipes.com/x");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("scales structured quantities from 4 to 8 servings", () => {
    setup(PANCAKES);
    expect(screen.getByText("2 cup Flour")).toBeInTheDocument();
    expect(screen.getByText("any kind")).toBeInTheDocument();
    const more = screen.getByRole("button", { name: "More servings" });
    for (let i = 0; i < 4; i++) fireEvent.click(more);
    expect(screen.getByText("4 cup Flour")).toBeInTheDocument();
    expect(screen.getByText("3 cup Milk")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Scaled to 8 servings");
  });

  it("shows an allergy chip that names the allergic kid", () => {
    setup(PB, [
      { id: "k-ava", name: "Ava", allergens: ["peanut"] },
      { id: "k-ben", name: "Ben", allergens: [] },
    ]);
    const row = screen.getByTestId("recipe-kid-fit");
    const chips = within(row).getAllByRole("listitem");
    const ava = chips.find((c) => c.textContent?.includes("Ava"))!;
    expect(ava).toHaveTextContent("Allergy: peanut");
    expect(ava).toHaveAttribute("data-kind", "allergen");
    const ben = chips.find((c) => c.textContent?.includes("Ben"))!;
    expect(ben).toHaveAttribute("data-kind", "eats");
  });

  it("never marks a kid with unknown allergy data as safe", () => {
    // Redacted offline-cache profile: no allergens field at all.
    setup(PB, [{ id: "k-cal", name: "Cal" }]);
    const chip = within(screen.getByTestId("recipe-kid-fit")).getByRole("listitem");
    expect(chip).toHaveAttribute("data-kind", "unknown");
    expect(chip).toHaveTextContent("Allergy info not checked");
  });

  it("Delete asks the page to delete and closes; it never deletes itself", async () => {
    const { props } = setup(PB);
    const trigger = screen.getByRole("button", { name: "Recipe options" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    expect(props.onRequestDelete).toHaveBeenCalledWith(PB);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onUpdateRecipe).not.toHaveBeenCalled();
  });

  it("Edit calls onEdit right away, with no timer", async () => {
    const { props } = setup(PB);
    fireEvent.keyDown(screen.getByRole("button", { name: "Recipe options" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Edit/ }));
    expect(props.onEdit).toHaveBeenCalledWith(PB);
  });

  it("adds only what is missing, with the quantity, and stops once it is all on the list", () => {
    setup(PANCAKES);
    const cta = screen.getByTestId("recipe-add-missing-to-grocery");
    expect(cta).toHaveTextContent("Add 2 to grocery");
    fireEvent.click(cta);
    expect(addGroceryItemsMerged).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Flour", quantity: 2, unit: "cup" }),
      expect.objectContaining({ name: "Milk", quantity: 1.5, unit: "cup" }),
    ]);
  });

  it("disables the grocery button as 'All on your list' when nothing is missing", () => {
    groceryItems = [
      { id: "g1", name: "Flour", quantity: 2, unit: "cup", checked: false, category: "carb" },
      { id: "g2", name: "Milk", quantity: 2, unit: "cup", checked: false, category: "dairy" },
    ];
    setup(PANCAKES);
    const cta = screen.getByTestId("recipe-add-missing-to-grocery");
    expect(cta).toHaveTextContent("All on your list");
    expect(cta).toBeDisabled();
  });

  it("I Made It logs the cook and opens the per-kid sheet when there are kids", async () => {
    const { props } = setup(PB, [{ id: "k-ben", name: "Ben", allergens: [] }]);
    fireEvent.click(screen.getByRole("button", { name: /I Made It/ }));
    expect(props.onUpdateRecipe).toHaveBeenCalledWith("r-pb", expect.objectContaining({ times_made: 1 }));
    expect(await screen.findByRole("heading", { name: "How did it go?" })).toBeInTheDocument();
  });

  it("I Made It with no kids does not ask how anyone did", () => {
    setup(PB);
    fireEvent.click(screen.getByRole("button", { name: /I Made It/ }));
    expect(screen.queryByRole("heading", { name: "How did it go?" })).toBeNull();
  });

  it("Cook Mode's Done counts as made and opens the same sheet", async () => {
    const { props } = setup({ ...PB, instructions: JSON.stringify(["Toast the bread"]) }, [
      { id: "k-ben", name: "Ben", allergens: [] },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Start cook mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(props.onUpdateRecipe).toHaveBeenCalledWith("r-pb", expect.objectContaining({ times_made: 1 }));
    // Not hidden behind the detail sheet that comes back as cook mode closes.
    expect(await screen.findByRole("heading", { name: "How did it go?" })).toBeInTheDocument();
  });

  it("offers Share link in the options menu and has no manual kid assignment", async () => {
    setup(PB, [{ id: "k-ben", name: "Ben", allergens: [] }]);
    expect(screen.queryByText(/Assign to Kids/i)).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "Recipe options" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Share link/ }));
    expect(await screen.findByRole("heading", { name: "Share a link" })).toBeInTheDocument();
  });

  it("rating is a radiogroup; clicking the current star clears it", () => {
    const { props } = setup({ ...PB, rating: 3 });
    const group = screen.getByRole("radiogroup", { name: "Rating" });
    const three = within(group).getByRole("radio", { name: "3 stars" });
    expect(three).toHaveAttribute("aria-checked", "true");
    fireEvent.click(three);
    expect(props.onUpdateRecipe).toHaveBeenCalledWith("r-pb", { rating: null });
  });
});
