import type React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import { MobileMealPlanner } from "./MobileMealPlanner";
import { isoDay } from "@/lib/mobilePlannerDay";

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
  { id: "sam", name: "Sam" },
  { id: "ada", name: "Ada" },
];
const FOODS: Food[] = [
  { id: "pasta", name: "Pasta", category: "carb", is_safe: true, is_try_bite: false, quantity: 2 },
  { id: "toast", name: "Toast", category: "carb", is_safe: true, is_try_bite: false, quantity: 2 },
];
const RECIPES: Recipe[] = [{ id: "mac", name: "Mac and cheese", food_ids: ["pasta"] }];

// A week that contains today, so the view opens on today.
const now = new Date();
const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
const today = isoDay(now);

function setup(planEntries: PlanEntry[]) {
  const props = {
    onAddEntry: vi.fn(),
    onSelectRecipeForKids: vi.fn(),
    onDeleteEntries: vi.fn(),
    onReplaceSlot: vi.fn(),
    onPushWeekToGrocery: vi.fn(),
    onMarkResult: vi.fn(),
    onBuildWeek: vi.fn(),
    onAIGenerate: vi.fn(),
    onPreviousWeek: vi.fn(),
    onNextWeek: vi.fn(),
    onThisWeek: vi.fn(),
  };
  render(
    <MobileMealPlanner
      weekStart={weekStart}
      planEntries={planEntries}
      foods={FOODS}
      recipes={RECIPES}
      kids={KIDS}
      activeKidId={null}
      isGeneratingPlan={false}
      {...props}
    />,
  );
  return props;
}

describe("MobileMealPlanner", () => {
  it("opens on today and shows a Today pill for the current week", () => {
    setup([]);
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    const selected = screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true");
    expect(selected?.id).toBe(`planner-day-${now.getDay()}`);
  });

  it("schedules a family recipe with one call for every kid", async () => {
    const user = userEvent.setup();
    const p = setup([]);
    await user.click(screen.getAllByRole("button", { name: "Add family meal" })[2]); // dinner
    await user.click(screen.getByRole("tab", { name: /Recipes/ }));
    const rows = screen.getAllByRole("button", { name: /Mac and cheese/ });
    await user.click(rows[rows.length - 1]);
    expect(p.onSelectRecipeForKids).toHaveBeenCalledTimes(1);
    expect(p.onSelectRecipeForKids).toHaveBeenCalledWith("mac", today, "dinner", ["sam", "ada"]);
  });

  it("Eat with family rejoins the recipe through onReplaceSlot", async () => {
    const user = userEvent.setup();
    const p = setup([
      { id: "1", kid_id: "sam", date: today, meal_slot: "dinner", food_id: "pasta", recipe_id: "mac", is_primary_dish: true, result: null },
      { id: "2", kid_id: "ada", date: today, meal_slot: "dinner", food_id: "pasta", recipe_id: "mac", is_primary_dish: true, result: null },
      { id: "3", kid_id: "ada", date: today, meal_slot: "lunch", food_id: "toast", result: null },
    ]);
    await user.click(screen.getByRole("button", { name: "Swap Ada's Dinner" }));
    expect(screen.getByText("Have Mac and cheese like everyone else")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Eat with family/ }));
    expect(p.onReplaceSlot).toHaveBeenCalledWith(["ada"], today, "dinner", { recipeId: "mac" });
  });

  it("a food swap replaces the slot instead of patching recipe_id", async () => {
    const user = userEvent.setup();
    const p = setup([
      { id: "1", kid_id: "sam", date: today, meal_slot: "dinner", food_id: "pasta", recipe_id: "mac", is_primary_dish: true, result: null },
    ]);
    await user.click(screen.getByRole("button", { name: "Swap Sam's Dinner" }));
    await user.click(screen.getByRole("button", { name: /Toast/ }));
    expect(p.onReplaceSlot).toHaveBeenCalledWith(["sam"], today, "dinner", { foodId: "toast" });
  });

  it("Shop pushes the week to the grocery list", async () => {
    const user = userEvent.setup();
    const p = setup([]);
    await user.click(screen.getByRole("button", { name: "Shop this week" }));
    expect(p.onPushWeekToGrocery).toHaveBeenCalledTimes(1);
  });
});
