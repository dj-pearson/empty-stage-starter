/**
 * The Pantry page against mocked contexts (the AppContext.precedence style:
 * the page is real, what it reads from is stubbed).
 *
 * The regressions pinned here are the ones that reached users: a t() with no
 * useTranslation() that crashed the empty pantry, a 1200ms guess standing in
 * for "loaded", a photo-identified food saved as safe, and pantry-to-grocery
 * adds that duplicated rows instead of stacking them.
 */
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import "@/i18n";
import type { Food, Kid } from "@/types";

// ---- context state, reset per test ------------------------------------------
interface State {
  foods: Food[];
  foodsHydrated: boolean;
  kids: Kid[];
  activeKidId: string | null;
  isMobile: boolean;
  ledgerWrites: boolean;
}
const state: State = {
  foods: [],
  foodsHydrated: true,
  kids: [],
  activeKidId: null,
  isMobile: false,
  ledgerWrites: false,
};
const recordRestock = vi.fn(async () => ({ recorded: false, count: 0, reason: "off" }));

const addFood = vi.fn(async () => true);
const addFoods = vi.fn(async () => true);
const updateFood = vi.fn();
const deleteFood = vi.fn();
const refreshFoods = vi.fn(async () => ({ ok: true }));
const mergeGroceryItems = vi.fn(() => ({
  touched: 1,
  insertedIds: ["g-new"],
  bumps: [] as { id: string; prev: Record<string, unknown> }[],
}));
const deleteGroceryItems = vi.fn();
const updateGroceryItem = vi.fn();
const addGroceryItem = vi.fn();

vi.mock("@/contexts/AppContext", () => ({
  useFoods: () => ({
    foods: state.foods,
    foodsHydrated: state.foodsHydrated,
    addFood,
    addFoods,
    updateFood,
    deleteFood,
    refreshFoods,
    catalogById: {},
  }),
  usePlan: () => ({ planEntries: [] }),
  useKids: () => ({ kids: state.kids, activeKidId: state.activeKidId }),
  useGrocery: () => ({
    groceryItems: [],
    mergeGroceryItems,
    deleteGroceryItems,
    updateGroceryItem,
    addGroceryItem,
  }),
  useInventory: () => ({
    ledgerReadsEnabled: false,
    ledgerWritesEnabled: state.ledgerWrites,
    ledgerQuantityOf: () => null,
    recordPantryCorrection: vi.fn(async () => ({ recorded: false, count: 0, reason: "off" })),
    recordWaste: vi.fn(async () => ({ recorded: false, count: 0, reason: "off" })),
    recordRestock,
  }),
}));

vi.mock("@/hooks/useDefaultGroceryListId", () => ({ useDefaultGroceryListId: () => "list-1" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.isMobile }));
vi.mock("@/lib/edge-functions", () => ({ invokeEdgeFunction: vi.fn(async () => ({ data: {}, error: null })) }));

const toastSuccess = vi.fn();
vi.mock("sonner", () => {
  const toast = Object.assign(vi.fn(), {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  });
  return { toast, Toaster: () => null };
});

// The photo dialog calls the camera and an edge function; the page's side of
// it is onFoodIdentified, so that is all the stand-in does.
vi.mock("@/components/ImageFoodCapture", () => ({
  ImageFoodCapture: ({
    open,
    onFoodIdentified,
  }: {
    open: boolean;
    onFoodIdentified: (f: Record<string, unknown>) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onFoodIdentified({
            name: "Kiwi",
            category: "fruit",
            confidence: 0.9,
            description: "",
            servingSize: "",
            quantity: 2,
            // What the model says is not a parent's judgement (US-803).
            is_safe: true,
          })
        }
      >
        fake-identify
      </button>
    ) : null,
}));

// Item 22: the receipt dialog's side of a priced top-up is onTopUp.
vi.mock("@/components/ScanReceiptDialog", () => ({
  ScanReceiptDialog: ({
    open,
    onTopUp,
  }: {
    open: boolean;
    onTopUp: (id: string, delta: number, unit: string | null, price: unknown) => Promise<void>;
  }) =>
    open ? (
      <button type="button" onClick={() => void onTopUp("milk", 1, "gal", { unitPrice: 3.49, currency: "USD" })}>
        fake-receipt
      </button>
    ) : null,
}));

import Pantry from "./Pantry";

const food = (over: Partial<Food> & Pick<Food, "id" | "name">): Food => ({
  category: "snack",
  is_safe: false,
  is_try_bite: false,
  quantity: 5,
  allergens: [],
  ...over,
});

function renderPantry() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Pantry />
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  state.foods = [];
  state.foodsHydrated = true;
  state.kids = [];
  state.activeKidId = null;
  state.isMobile = false;
  state.ledgerWrites = false;
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Pantry page", () => {
  it("shows the skeleton, not the empty state, until foods have loaded", () => {
    state.foodsHydrated = false;
    renderPantry();
    expect(screen.getAllByTestId("pantry-skeleton-card").length).toBeGreaterThan(0);
    expect(screen.queryByText("Build Your Food Pantry")).not.toBeInTheDocument();
  });

  it("renders the empty state for a loaded, empty pantry without throwing (TS2304 regression)", () => {
    renderPantry();
    expect(screen.getByText("Build Your Food Pantry")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Quick start/ })).toBeEnabled();
    expect(screen.queryByTestId("pantry-skeleton-card")).not.toBeInTheDocument();
  });

  it("handles a food in an unknown category plus a search", async () => {
    state.foods = [
      food({ id: "f1", name: "Frozen pizza", category: "frozen" as Food["category"] }),
      food({ id: "f2", name: "Apple", category: "fruit" }),
    ];
    renderPantry();
    // The unknown category gets an "Other" pill rather than vanishing.
    const pills = screen.getByRole("group", { name: "Filter by category" });
    expect(within(pills).getByRole("button", { name: /Other/ })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search pantry" }), {
      target: { value: "piz" },
    });
    await waitFor(() => expect(screen.queryByText("Apple")).not.toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText("Frozen pizza")).toBeInTheDocument();
  });

  it("'Add to list' in the stock strip merges once with the default list, and Undo deletes what it inserted", async () => {
    state.foods = [food({ id: "f1", name: "Milk", category: "dairy", quantity: 1, unit: "gal" })];
    renderPantry();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add 1 to list" }));

    expect(mergeGroceryItems).toHaveBeenCalledTimes(1);
    expect(mergeGroceryItems).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "Milk" })],
      { defaultListId: "list-1" }
    );
    expect(addGroceryItem).not.toHaveBeenCalled();

    const [, options] = toastSuccess.mock.calls.at(-1) as [string, { action: { onClick: () => void } }];
    options.action.onClick();
    expect(deleteGroceryItems).toHaveBeenCalledWith(["g-new"]);
  });

  it("saves a photo-identified food as not safe (US-803)", async () => {
    renderPantry();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /More ways to add/ }));
    await user.click(await screen.findByRole("menuitem", { name: /photo/i }));
    await user.click(await screen.findByRole("button", { name: "fake-identify" }));

    await waitFor(() => expect(addFood).toHaveBeenCalledTimes(1));
    expect(addFood).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Kiwi", is_safe: false, is_try_bite: false, quantity: 2 })
    );
  });

  it("opens the CSV import dialog from the capture menu with the keyboard", async () => {
    state.foods = [food({ id: "f1", name: "Rice", category: "carb" })];
    renderPantry();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: /More ways to add/ });
    trigger.focus();
    await user.keyboard("{Enter}");
    const item = await screen.findByRole("menuitem", { name: /CSV/i });
    item.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("the kid lens 'Avoid' filter shows a peanut food for a kid allergic to peanuts", async () => {
    state.kids = [{ id: "k1", name: "Ava", allergens: ["Peanuts"] }];
    state.activeKidId = "k1";
    state.foods = [
      food({ id: "f1", name: "Peanut butter", allergens: ["peanut"] }),
      food({ id: "f2", name: "Banana", category: "fruit", allergens: [] }),
    ];
    renderPantry();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Avoid" }));

    expect(await screen.findByText("Peanut butter")).toBeInTheDocument();
    expect(screen.queryByText("Banana")).not.toBeInTheDocument();
  });

  it("quick-add of a food already there tops it up instead of inserting a second one", async () => {
    state.foods = [food({ id: "milk", name: "Milk", category: "dairy", quantity: 1, unit: "gal" })];
    renderPantry();
    const user = userEvent.setup();
    const input = screen.getAllByRole("textbox")[0];
    await user.type(input, "milk{Enter}");

    await waitFor(() => expect(updateFood).toHaveBeenCalledWith("milk", { quantity: 2 }));
    expect(addFood).not.toHaveBeenCalled();
  });

  it("opens a phone in list view, and keeps a view the viewer chose (item 21)", async () => {
    state.isMobile = true;
    state.foods = [food({ id: "f1", name: "Rice", category: "carb" })];
    const { unmount } = renderPantry();
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("pantry-list-row")).toBeInTheDocument();
    unmount();

    localStorage.setItem("eatpal.pantry.viewMode", "grid");
    renderPantry();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true")
    );
  });

  it("'Used up' on a list row zeroes the food, and Undo puts the count back", async () => {
    state.isMobile = true;
    state.foods = [food({ id: "f1", name: "Rice", category: "carb", quantity: 3 })];
    const { rerender } = renderPantry();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Mark Rice used up" }));
    expect(updateFood).toHaveBeenCalledWith("f1", { quantity: 0 });

    const [message, options] = toastSuccess.mock.calls.at(-1) as [string, { action: { onClick: () => void } }];
    expect(message).toBe("Rice used up");
    // The context applies the zero before the Undo is pressed.
    state.foods = [food({ id: "f1", name: "Rice", category: "carb", quantity: 0 })];
    rerender(
      <HelmetProvider>
        <MemoryRouter>
          <Pantry />
        </MemoryRouter>
      </HelmetProvider>
    );
    options.action.onClick();
    expect(updateFood).toHaveBeenLastCalledWith("f1", { quantity: 3 });
  });

  it("Undo of 'Used up' keeps stock that arrived in between", async () => {
    state.isMobile = true;
    state.foods = [food({ id: "f1", name: "Rice", category: "carb", quantity: 3 })];
    const { rerender } = renderPantry();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Mark Rice used up" }));
    const [, options] = toastSuccess.mock.calls.at(-1) as [string, { action: { onClick: () => void } }];
    // A receipt top-up of 2 lands before the Undo.
    state.foods = [food({ id: "f1", name: "Rice", category: "carb", quantity: 2 })];
    rerender(
      <HelmetProvider>
        <MemoryRouter>
          <Pantry />
        </MemoryRouter>
      </HelmetProvider>
    );
    options.action.onClick();
    expect(updateFood).toHaveBeenLastCalledWith("f1", { quantity: 5 });
  });

  it("shows the Waste report only while ledger writes are on", () => {
    state.foods = [food({ id: "f1", name: "Rice", category: "carb", quantity: 3 })];
    const { unmount } = renderPantry();
    expect(screen.queryByRole("button", { name: /^Waste$/ })).not.toBeInTheDocument();
    unmount();
    state.ledgerWrites = true;
    renderPantry();
    expect(screen.getByRole("button", { name: /^Waste$/ })).toBeInTheDocument();
  });

  it("the starter list is a checklist that adds nothing as safe (item 20)", async () => {
    state.kids = [{ id: "k1", name: "Ava", allergens: ["peanuts"] }];
    renderPantry();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Quick start/ }));
    expect(addFoods).not.toHaveBeenCalled();

    expect(await screen.findByRole("checkbox", { name: "Peanut butter" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Rice" }));
    await user.click(screen.getByRole("button", { name: "Add 1 food" }));

    await waitFor(() => expect(addFoods).toHaveBeenCalledTimes(1));
    expect(addFoods).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Rice", quantity: 1, is_safe: false, is_try_bite: false }),
    ]);
  });

  it("a priced receipt top-up records the price and becomes the food's last price (item 22)", async () => {
    state.foods = [food({ id: "milk", name: "Milk", category: "dairy", quantity: 1, unit: "gal" })];
    renderPantry();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Scan receipt" }));
    await user.click(await screen.findByRole("button", { name: "fake-receipt" }));

    await waitFor(() => expect(recordRestock).toHaveBeenCalledTimes(1));
    expect(recordRestock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "milk" }),
      1,
      expect.objectContaining({ unitPrice: 3.49, currency: "USD", unit: "gal" })
    );
    expect(updateFood).toHaveBeenCalledWith("milk", { price_per_unit: 3.49, currency: "USD" });
  });
});
