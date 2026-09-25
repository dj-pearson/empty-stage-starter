import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Food, GroceryItem, Kid, PlanEntry } from "@/types";
import { toISODate } from "@/lib/date-utils";

const state: {
  kids: Kid[];
  foods: Food[];
  planEntries: PlanEntry[];
  groceryItems: GroceryItem[];
  kidsHydrated: boolean;
  foodsHydrated: boolean;
  groceryHydrated: boolean;
} = {
  kids: [],
  foods: [],
  planEntries: [],
  groceryItems: [],
  kidsHydrated: true,
  foodsHydrated: true,
  groceryHydrated: true,
};

const addKid = vi.fn(async () => true);
const deleteKid = vi.fn(async () => true);
const setActiveKid = vi.fn();

vi.mock("sonner", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast };
});

vi.mock("@/contexts/AppContext", () => ({
  useKids: () => ({
    kids: state.kids,
    kidsHydrated: state.kidsHydrated,
    addKid,
    deleteKid,
    setActiveKid,
  }),
  useFoods: () => ({ foods: state.foods, foodsHydrated: state.foodsHydrated }),
  usePlan: () => ({ planEntries: state.planEntries }),
  useGrocery: () => ({ groceryItems: state.groceryItems, groceryHydrated: state.groceryHydrated }),
}));

import { SetupChecklist } from "./OnboardingProgressBar";

const TODAY = toISODate(new Date());
const safe = (id: string): Food => ({ id, name: id, category: "fruit", is_safe: true, is_try_bite: false });

function renderChecklist() {
  return render(
    <MemoryRouter>
      <SetupChecklist />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.kids = [];
  state.foods = [];
  state.planEntries = [];
  state.groceryItems = [];
  state.kidsHydrated = true;
  state.foodsHydrated = true;
  state.groceryHydrated = true;
  addKid.mockClear();
});

describe("SetupChecklist", () => {
  it("renders nothing before the slices are hydrated", () => {
    state.kidsHydrated = false;
    const { container } = renderChecklist();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Add your child")).toBeNull();
  });

  it("renders nothing when every step is done", () => {
    state.kids = [{ id: "k1", name: "Ava" }];
    state.foods = [safe("a"), safe("b"), safe("c")];
    state.planEntries = [
      { id: "p1", kid_id: "k1", date: TODAY, meal_slot: "dinner", food_id: "a", result: null },
    ];
    state.groceryItems = [
      { id: "g1", name: "Milk", quantity: 1, unit: "", checked: false, category: "dairy" },
    ];
    const { container } = renderChecklist();
    expect(container).toBeEmptyDOMElement();
  });

  it("reports completed steps on the progressbar", () => {
    state.kids = [{ id: "k1", name: "Ava" }];
    state.foods = [safe("a"), safe("b"), safe("c")];
    renderChecklist();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "4");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getAllByText("Done")).toHaveLength(2);
    // The next step (plan) is the only link; later steps are plain text.
    const plan = screen.getByRole("link", { name: "Plan tonight's dinner" });
    expect(plan).toHaveAttribute("href", `/dashboard/planner?date=${TODAY}&slot=dinner`);
    expect(screen.queryByRole("link", { name: "Start a grocery list" })).toBeNull();
  });

  it("adds a child with allergens inline when the account has none", async () => {
    renderChecklist();
    const primary = screen.getByRole("button", { name: "Add your child" });
    fireEvent.click(primary);

    fireEvent.change(screen.getByLabelText("Child's name"), { target: { value: "  Ava  " } });
    fireEvent.change(screen.getByLabelText("Age (optional)"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "peanuts" }));
    fireEvent.click(screen.getByRole("button", { name: "sesame" }));
    fireEvent.click(screen.getByRole("button", { name: "Add child" }));

    await waitFor(() => expect(addKid).toHaveBeenCalledTimes(1));
    expect(addKid).toHaveBeenCalledWith({ name: "Ava", age: 4, allergens: ["peanuts", "sesame"] });
  });

  it("records 'None known' as an empty list and blocks an empty name", async () => {
    renderChecklist();
    fireEvent.click(screen.getByRole("button", { name: "Add your child" }));
    fireEvent.click(screen.getByRole("button", { name: "Add child" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your child's name.");
    expect(addKid).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Child's name"), { target: { value: "Ben" } });
    fireEvent.click(screen.getByRole("button", { name: "None known" }));
    fireEvent.click(screen.getByRole("button", { name: "Add child" }));
    await waitFor(() => expect(addKid).toHaveBeenCalledWith({ name: "Ben", allergens: [] }));
  });
});
