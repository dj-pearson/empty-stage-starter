import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import type { Food, GroceryItem, Kid, PlanEntry, Recipe } from "@/types";
import { addIsoDays, toISODate } from "@/lib/date-utils";

const state: {
  kids: Kid[];
  activeKidId: string | null;
  kidsHydrated: boolean;
  foodsHydrated: boolean;
  foods: Food[];
  recipes: Recipe[];
  planEntries: PlanEntry[];
  groceryItems: GroceryItem[];
} = {
  kids: [],
  activeKidId: null,
  kidsHydrated: true,
  foodsHydrated: true,
  foods: [],
  recipes: [],
  planEntries: [],
  groceryItems: [],
};

const updatePlanEntry = vi.fn(async () => ({ error: null }));
const toastCalls: { message: string; action?: { label: string; onClick: () => void } }[] = [];

vi.mock("sonner", () => {
  const record = (message: string, opts?: { action?: { label: string; onClick: () => void } }) => {
    toastCalls.push({ message, action: opts?.action });
  };
  const toast = Object.assign(vi.fn(record), { success: vi.fn(record), error: vi.fn(record) });
  return { toast };
});

vi.mock("@/contexts/AppContext", () => ({
  useKids: () => ({
    kids: state.kids,
    activeKidId: state.activeKidId,
    kidsHydrated: state.kidsHydrated,
    kidsLoadError: null,
    refreshKids: vi.fn(),
  }),
  useFoods: () => ({ foods: state.foods, foodsHydrated: state.foodsHydrated }),
  useRecipes: () => ({ recipes: state.recipes }),
  usePlan: () => ({ planEntries: state.planEntries, updatePlanEntry, addPlanEntries: vi.fn() }),
  useGrocery: () => ({
    groceryItems: state.groceryItems,
    deleteGroceryItems: vi.fn(),
    updateGroceryItem: vi.fn(),
    mergeGroceryItems: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePlanToGrocery", () => ({
  usePlanToGrocery: () => ({
    preview: () => ({ toAdd: 0, alreadyHave: 0, onList: 0 }),
    push: vi.fn(),
  }),
}));
vi.mock("@/hooks/useDefaultGroceryListId", () => ({ useDefaultGroceryListId: () => null }));
vi.mock("@/hooks/useKidsProgressSummary", () => ({
  useKidsProgressSummary: () => ({ ladderRows: [], attempts: [], loading: false }),
}));

// Owned by other packages; the page only composes them.
vi.mock("@/components/home/HomeGreeting", () => ({ HomeGreeting: () => <p>greeting</p> }));
vi.mock("@/components/home/InsightSlot", () => ({ InsightSlot: () => null }));
vi.mock("@/components/OnboardingProgressBar", () => ({ SetupChecklist: () => null }));
vi.mock("@/components/SubscriptionStatusBanner", () => ({ SubscriptionStatusBanner: () => null }));

import Home from "./Home";

const TODAY = toISODate(new Date());
const YESTERDAY = addIsoDays(TODAY, -1);

const food = (id: string, name: string, allergens: string[] = []): Food => ({
  id,
  name,
  category: "protein",
  is_safe: true,
  is_try_bite: false,
  allergens,
});

const row = (p: Partial<PlanEntry> & Pick<PlanEntry, "id" | "kid_id" | "food_id">): PlanEntry => ({
  date: TODAY,
  meal_slot: "dinner",
  result: null,
  ...p,
});

function renderHome() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  updatePlanEntry.mockClear();
  toastCalls.length = 0;
  state.kidsHydrated = true;
  state.foodsHydrated = true;
  state.activeKidId = null;
  state.kids = [
    { id: "maya", name: "Maya", age: 5, allergens: [] } as Kid,
    { id: "leo", name: "Leo", age: 3, allergens: [] } as Kid,
  ];
  state.foods = [food("chicken", "Chicken"), food("rice", "Rice")];
  state.recipes = [{ id: "bowl", name: "Chicken rice bowl", food_ids: ["chicken", "rice"] } as Recipe];
  state.groceryItems = [];
  state.planEntries = [
    row({ id: "m1", kid_id: "maya", food_id: "chicken", recipe_id: "bowl", is_primary_dish: true }),
    row({ id: "m2", kid_id: "maya", food_id: "rice", recipe_id: "bowl" }),
    row({ id: "l1", kid_id: "leo", food_id: "chicken", recipe_id: "bowl", is_primary_dish: true }),
    row({ id: "l2", kid_id: "leo", food_id: "rice", recipe_id: "bowl" }),
  ];
});

describe("Home", () => {
  it("shows a planned recipe dinner once per kid, with fit badges", () => {
    renderHome();
    expect(screen.getByRole("heading", { name: "Tonight" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Dinner for each child" });
    const items = Array.from(list.children) as HTMLElement[];
    expect(items.map((li) => within(li).getByText(/^(Maya|Leo)$/).textContent)).toEqual(["Maya", "Leo"]);
    expect(within(list).getAllByText("Chicken rice bowl")).toHaveLength(2);
    // Both kids eat both foods and neither has an allergen in it: a fit chip on each row.
    for (const li of items) expect(within(li).getByText(/safe/i)).toBeInTheDocument();
    expect(screen.queryByText(/No meals planned/i)).toBeNull();
    expect(screen.queryByText("Reset All")).toBeNull();
    expect(screen.queryByText("Import Data")).toBeNull();
    expect(screen.queryByText(/Welcome, Parent/)).toBeNull();
  });

  it("pins an allergen alert for a kid whose allergen is in tonight's dinner", () => {
    state.kids[0] = { ...state.kids[0], allergens: ["Peanuts"] };
    state.foods = [food("chicken", "Chicken"), food("rice", "Rice", ["en:peanuts"])];
    renderHome();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Peanut in tonight's Chicken rice bowl: Maya");
    expect(screen.getByRole("link", { name: "Swap for Maya" })).toHaveAttribute(
      "href",
      `/dashboard/planner?date=${TODAY}&slot=dinner`,
    );
  });

  it("renders the skeleton and no onboarding copy before hydration", () => {
    state.kidsHydrated = false;
    state.kids = [];
    state.planEntries = [];
    renderHome();
    expect(screen.getByTestId("tonight-hero-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/Add your child/i)).toBeNull();
    expect(screen.queryByText(/Getting Started/i)).toBeNull();
    expect(screen.queryByText("All caught up")).toBeNull();
  });

  it("logs Ate with a partial patch, and Undo restores the previous result", async () => {
    state.planEntries = [
      row({ id: "y1", kid_id: "maya", food_id: "chicken", date: YESTERDAY, notes: "had ketchup" }),
    ];
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Ate" }));

    await waitFor(() => expect(updatePlanEntry).toHaveBeenCalledTimes(1));
    const [id, patch] = updatePlanEntry.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(id).toBe("y1");
    expect(patch).toEqual({ result: "ate", notes: "had ketchup" });
    expect(patch).not.toHaveProperty("id");
    expect(patch).not.toHaveProperty("kid_id");
    expect(patch).not.toHaveProperty("date");

    await waitFor(() => expect(toastCalls.some((c) => c.action?.label === "Undo")).toBe(true));
    const undo = toastCalls.find((c) => c.action?.label === "Undo");
    act(() => undo?.action?.onClick());
    expect(updatePlanEntry).toHaveBeenLastCalledWith("y1", {
      result: null,
      amount_eaten: null,
      notes: "had ketchup",
    });
  });

  it("says all caught up when there is nothing to do", () => {
    // Today's tasks depend on the clock (what is due by now), so pin it to
    // midday of TODAY: the real clock made this fail in the small hours.
    const [y, m, d] = TODAY.split("-").map(Number);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
    try {
      renderHome();
      expect(screen.getByText("All caught up")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
