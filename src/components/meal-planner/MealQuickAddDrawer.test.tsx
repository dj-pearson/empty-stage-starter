import type React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import { MealQuickAddDrawer, type MealQuickAddContext } from "./MealQuickAddDrawer";

// vaul drives drag physics off pointer capture and computed transforms, which
// jsdom has neither of. The drawer's own markup is what is under test.
vi.mock("@/components/ui/drawer", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Pass,
    DrawerHeader: Pass,
    DrawerTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  };
});

const KIDS: Kid[] = [
  { id: "sam", name: "Sam", allergens: ["milk"] },
  { id: "ada", name: "Ada", allergens: [], always_eats_foods: ["rice"] },
];
const FOODS: Food[] = [
  { id: "rice", name: "Rice", category: "carb", is_safe: true, is_try_bite: false, quantity: 0 },
  { id: "cheese", name: "Cheese", category: "dairy", is_safe: true, is_try_bite: false, quantity: 3, allergens: ["milk"] },
  { id: "kale", name: "Kale", category: "vegetable", is_safe: false, is_try_bite: true, quantity: 1 },
  { id: "mystery", name: "Mystery", category: "weird" as Food["category"], is_safe: false, is_try_bite: false, quantity: 1 },
];
const RECIPES: Recipe[] = [
  { id: "rice-bowl", name: "Rice bowl", food_ids: ["rice"] },
  { id: "unlinked", name: "Grandma's stew", food_ids: [] },
];

function renderDrawer(context: MealQuickAddContext, planEntries: PlanEntry[] = []) {
  const onSelectFood = vi.fn();
  const onSelectRecipeForKids = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <MealQuickAddDrawer
      open
      onOpenChange={onOpenChange}
      context={context}
      foods={FOODS}
      recipes={RECIPES}
      kids={KIDS}
      planEntries={planEntries}
      onSelectFood={onSelectFood}
      onSelectRecipeForKids={onSelectRecipeForKids}
      onEatWithFamily={vi.fn()}
    />,
  );
  return { onSelectFood, onSelectRecipeForKids, onOpenChange };
}

describe("MealQuickAddDrawer", () => {
  it("lets an out-of-stock food be picked and labels it To buy", async () => {
    const user = userEvent.setup();
    const { onSelectFood } = renderDrawer({ date: "2026-09-24", slot: "lunch", kidId: "ada", mode: "add" });
    const rice = screen.getByRole("button", { name: /Rice/ });
    expect(rice).not.toBeDisabled();
    expect(within(rice).getByText("To buy")).toBeInTheDocument();
    expect(within(rice).getByText("Go-to")).toBeInTheDocument();
    await user.click(rice);
    expect(onSelectFood).toHaveBeenCalledWith("rice", expect.objectContaining({ kidId: "ada" }), ["ada"]);
  });

  it("names the allergen and the kid, and needs a confirm tap", async () => {
    const user = userEvent.setup();
    const { onSelectFood } = renderDrawer({ date: "2026-09-24", slot: "lunch", kidId: "sam", mode: "add" });
    const warning = screen.getByText("Contains milk - Sam is allergic");
    expect(warning.closest("span")).toHaveClass("text-destructive");

    await user.click(screen.getByRole("button", { name: /Cheese/ }));
    expect(onSelectFood).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add anyway" }));
    expect(onSelectFood).toHaveBeenCalledWith("cheese", expect.anything(), ["sam"]);
  });

  it("names a severe allergy as severe before the confirm (item 29)", async () => {
    const user = userEvent.setup();
    KIDS[0] = { id: "sam", name: "Sam", allergens: ["milk"], allergen_severity: { milk: "severe" } };
    try {
      const { onSelectFood } = renderDrawer({ date: "2026-09-24", slot: "lunch", kidId: "sam", mode: "add" });
      expect(screen.getByText("Contains milk - severe allergy: Sam")).toBeInTheDocument();
      expect(screen.queryByText("Contains milk - Sam is allergic")).toBeNull();
      await user.click(screen.getByRole("button", { name: /Cheese/ }));
      expect(onSelectFood).not.toHaveBeenCalled();
      expect(screen.getByRole("group", { name: "Contains milk - severe allergy: Sam" })).toBeInTheDocument();
    } finally {
      KIDS[0] = { id: "sam", name: "Sam", allergens: ["milk"] };
    }
  });

  it("offers a family action for everyone except the allergic kid", async () => {
    const user = userEvent.setup();
    const { onSelectFood } = renderDrawer({ date: "2026-09-24", slot: "lunch", mode: "add" });
    await user.click(screen.getByRole("button", { name: /Cheese/ }));
    await user.click(screen.getByRole("button", { name: "Add for everyone except Sam" }));
    expect(onSelectFood).toHaveBeenCalledTimes(1);
    expect(onSelectFood).toHaveBeenCalledWith("cheese", expect.anything(), ["ada"]);
  });

  it("a family recipe pick calls onSelectRecipeForKids once with every kid", async () => {
    const user = userEvent.setup();
    const { onSelectRecipeForKids } = renderDrawer({ date: "2026-09-24", slot: "dinner", mode: "add" });
    await user.click(screen.getByRole("tab", { name: /Recipes/ }));
    await user.click(screen.getAllByRole("button", { name: /Rice bowl/ }).at(-1)!);
    expect(onSelectRecipeForKids).toHaveBeenCalledTimes(1);
    expect(onSelectRecipeForKids).toHaveBeenCalledWith("rice-bowl", expect.anything(), ["sam", "ada"]);
  });

  it("shows every food, grouped, with unknown categories under Other", () => {
    renderDrawer({ date: "2026-09-24", slot: "lunch", kidId: "ada", mode: "add" });
    expect(screen.getByRole("heading", { name: "Safe for Ada" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trying" })).toBeInTheDocument();
    const other = screen.getByRole("heading", { name: "Other" }).closest("section")!;
    expect(within(other).getByText("Mystery")).toBeInTheDocument();
  });

  it("orders try bites by exposure and says how the last one went", () => {
    const history: PlanEntry[] = [
      { id: "h1", kid_id: "ada", date: "2026-09-20", meal_slot: "try_bite", food_id: "kale", result: "refused" },
      { id: "h2", kid_id: "ada", date: "2026-09-22", meal_slot: "try_bite", food_id: "kale", result: "tasted" },
    ];
    renderDrawer({ date: "2026-09-24", slot: "try_bite", kidId: "ada", mode: "add" }, history);
    expect(screen.getByText("3rd try, tasted last time")).toBeInTheDocument();
  });

  it("flags a recipe with no pantry foods instead of failing silently", async () => {
    const user = userEvent.setup();
    renderDrawer({ date: "2026-09-24", slot: "dinner", kidId: "ada", mode: "add" });
    await user.click(screen.getByRole("tab", { name: /Recipes/ }));
    expect(screen.getByText("No pantry foods linked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Grandma's stew/ })).toBeDisabled();
    expect(screen.getByPlaceholderText("Search recipes...")).toBeInTheDocument();
  });

  it("labels the two snacks apart", () => {
    renderDrawer({ date: "2026-09-24", slot: "snack2", kidId: "ada", mode: "add" });
    expect(screen.getByText("Add Snack 2")).toBeInTheDocument();
  });
});
