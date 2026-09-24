import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "sonner";
import "@/i18n";
import type { Food, Kid, Recipe, RecipeCollection } from "@/types";

// ---- context mocks (same approach as AppContext.precedence.test: stub the
// slices the page reads, so the page runs without a provider tree) ----------

const deleteRecipe = vi.fn();
const setActiveKid = vi.fn();
let recipes: Recipe[] = [];
let foods: Food[] = [];
let kids: Kid[] = [];

vi.mock("@/contexts/AppContext", () => ({
  useRecipes: () => ({
    recipes,
    addRecipe: vi.fn(async (r: Omit<Recipe, "id">) => ({ ...r, id: "new" })),
    updateRecipe: vi.fn(),
    deleteRecipe,
  }),
  useFoods: () => ({ foods, catalogById: {} }),
  useKids: () => ({ kids, activeKidId: null, setActiveKid }),
  usePlan: () => ({ planEntries: [], scheduleRecipe: vi.fn(), deletePlanEntries: vi.fn() }),
  useGrocery: () => ({
    groceryItems: [],
    addGroceryItemsMerged: vi.fn(() => 1),
    deleteGroceryItems: vi.fn(),
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userId: "00000000-0000-4000-8000-000000000001", householdId: null }),
}));

let collections: RecipeCollection[] = [];
let itemsByCollection: Record<string, Set<string>> = {};
vi.mock("@/hooks/useRecipeCollections", () => ({
  useRecipeCollections: () => ({
    collections,
    itemsByCollection,
    collectionIdsByRecipe: {},
    countsByCollection: {},
    loading: false,
    error: null,
    refresh: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
    setMembership: vi.fn(),
    dropRecipe: vi.fn(),
  }),
}));

vi.mock("@/hooks/useRecipeQuickPlan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useRecipeQuickPlan")>();
  return {
    ...actual,
    useRecipeQuickPlan: () => ({ schedule: vi.fn(), planTonight: vi.fn() }),
  };
});

vi.mock("@/lib/edge-functions", () => ({ invokeEdgeFunction: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ analytics: { trackEvent: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "or", "order", "limit", "insert", "update", "delete", "upsert"]) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: [], error: null });
  return {
    supabase: {
      from: () => builder,
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => undefined,
    },
  };
});

import Recipes from "./Recipes";

// jsdom gaps: sonner captures the pointer on a toast, and the window
// virtualizer / Radix scroll the window.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
}
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

const PEANUT: Food = {
  id: "f-pb",
  name: "Peanut butter",
  category: "protein",
  is_safe: true,
  is_try_bite: false,
  allergens: ["peanuts"],
  quantity: 1,
};
const BREAD: Food = {
  id: "f-bread",
  name: "Bread",
  category: "carb",
  is_safe: true,
  is_try_bite: false,
  allergens: [],
  quantity: 1,
};

const PB_TOAST: Recipe = { id: "r-pb", name: "PB Toast", food_ids: ["f-pb", "f-bread"] };
const PLAIN_TOAST: Recipe = { id: "r-toast", name: "Plain Toast", food_ids: ["f-bread"] };

const AVA: Kid = { id: "k-ava", name: "Ava", allergens: ["peanuts"], disliked_foods: [], always_eats_foods: [] };
const BEN: Kid = { id: "k-ben", name: "Ben", allergens: [], disliked_foods: [], always_eats_foods: [] };

function page() {
  return (
    <HelmetProvider>
      <MemoryRouter>
        <Recipes />
        <Toaster />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function renderPage() {
  return render(page());
}

describe("Recipes page", () => {
  beforeEach(() => {
    recipes = [];
    foods = [];
    kids = [];
    collections = [];
    itemsByCollection = {};
    deleteRecipe.mockClear();
    setActiveKid.mockClear();
    window.localStorage.clear();
    // Cards, not rows: the page defaults to the list below md until a view is chosen.
    window.localStorage.setItem("recipe-view", JSON.stringify("grid"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reaches the empty state with 0 recipes and 0 foods instead of a stuck skeleton", () => {
    vi.useFakeTimers();
    renderPage();
    expect(screen.getByLabelText("Loading recipes")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1300);
    });

    expect(screen.queryByLabelText("Loading recipes")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "Start with meals your family already eats" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your kids first" })).toHaveAttribute("href", "/dashboard/kids");
  });

  it("opens the detail sheet from a card without throwing", async () => {
    recipes = [PB_TOAST];
    foods = [PEANUT, BREAD];
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "PB Toast" }));

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "PB Toast" })).toBeInTheDocument();
  });

  it("scores fit for the picked kid without changing the app-wide active kid", async () => {
    recipes = [PB_TOAST];
    foods = [PEANUT, BREAD];
    kids = [AVA, BEN];
    const user = userEvent.setup();
    renderPage();

    // Everyone: Ava's peanut allergy shows on the card.
    expect(screen.getByText(/Not for Ava/)).toBeInTheDocument();

    const group = screen.getByRole("radiogroup", { name: "Show fit for" });
    await user.click(within(group).getByRole("radio", { name: "Ben" }));

    expect(within(group).getByRole("radio", { name: "Ben" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/Not for Ava/)).toBeNull();
    expect(setActiveKid).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem("recipe-works-for") ?? "null")).toBe("k-ben");

    // "Everyone" is still there to go back to.
    const everyone = within(group).getByRole("radio", { name: "Everyone" });
    expect(everyone).toHaveAttribute("aria-checked", "false");
    await user.click(everyone);
    expect(screen.getByText(/Not for Ava/)).toBeInTheDocument();
  });

  it("deletes from a card behind one Undo toast, with no confirm dialog", async () => {
    recipes = [PB_TOAST, PLAIN_TOAST];
    foods = [PEANUT, BREAD];
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "More for PB Toast" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "PB Toast" })).toBeNull();
    expect(await screen.findAllByText('Deleted "PB Toast"')).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByRole("button", { name: "PB Toast" })).toBeInTheDocument();
    expect(deleteRecipe).not.toHaveBeenCalled();
  });

  it("falls back to all recipes when the selected collection is deleted", async () => {
    recipes = [PB_TOAST, PLAIN_TOAST];
    foods = [PEANUT, BREAD];
    const now = new Date().toISOString();
    collections = [
      {
        id: "c-week",
        user_id: "u",
        name: "Weeknight",
        is_default: false,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      },
    ];
    itemsByCollection = { "c-week": new Set(["r-toast"]) };
    const user = userEvent.setup();
    const { rerender } = renderPage();

    const group = screen.getByRole("radiogroup", { name: "Collection" });
    await user.click(within(group).getByRole("radio", { name: "Weeknight" }));
    expect(screen.queryByRole("button", { name: "PB Toast" })).toBeNull();
    expect(screen.getByRole("button", { name: "Plain Toast" })).toBeInTheDocument();

    // Deleted elsewhere.
    collections = [];
    itemsByCollection = {};
    rerender(page());

    await waitFor(() => expect(screen.getByRole("button", { name: "PB Toast" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Plain Toast" })).toBeInTheDocument();
  });
});
