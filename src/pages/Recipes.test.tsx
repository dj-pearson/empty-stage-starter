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
const addRecipe = vi.fn(async (r: Omit<Recipe, "id">) => ({ ...r, id: "new" }));
const setActiveKid = vi.fn();
let recipes: Recipe[] = [];
let foods: Food[] = [];
let kids: Kid[] = [];

vi.mock("@/contexts/AppContext", () => ({
  useRecipes: () => ({
    recipes,
    addRecipe,
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

// Item 12: stand in for the parse step. The real dialog's contract (close
// once onImport resolves) is covered in ImportRecipeDialog.test.tsx.
const IMPORTED_DRAFT: Omit<Recipe, "id"> = {
  name: "plain toast!",
  food_ids: ["f-bread"],
  source_type: "website",
  source_url: "https://example.com/toast",
  total_time_minutes: 5,
  instructions: JSON.stringify(["Toast it"]),
  recipe_ingredient_rows: [
    { food_id: "f-bread", sort_order: 0, name: "Bread", quantity: 2, unit: "slice", group_label: null, optional_notes: null },
  ],
};
vi.mock("@/components/ImportRecipeDialog", () => ({
  ImportRecipeDialog: ({ onImport, onOpenChange }: { onImport: (r: Omit<Recipe, "id">) => Promise<void>; onOpenChange: (o: boolean) => void }) => (
    <button
      type="button"
      onClick={async () => {
        await onImport(IMPORTED_DRAFT);
        onOpenChange(false);
      }}
    >
      Fake parse
    </button>
  ),
}));
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
    addRecipe.mockClear();
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
  it("shows smart collections with counts above the user's, and filters by one", async () => {
    recipes = [PB_TOAST, PLAIN_TOAST];
    foods = [PEANUT, BREAD];
    kids = [AVA, BEN];
    const user = userEvent.setup();
    renderPage();

    const smart = screen.getByRole("radiogroup", { name: "Smart collections" });
    const safeAva = within(smart).getByRole("radio", { name: /Safe for Ava/ });
    expect(safeAva).toHaveTextContent("1");
    expect(within(smart).getByRole("radio", { name: /Safe for Ben/ })).toHaveTextContent("2");
    expect(within(smart).getByRole("radio", { name: /Everyone can eat/ })).toHaveTextContent("1");
    expect(within(smart).getByRole("radio", { name: /Unfiled/ })).toHaveTextContent("2");

    await user.click(safeAva);
    expect(safeAva).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: "PB Toast" })).toBeNull();
    expect(screen.getByRole("button", { name: "Plain Toast" })).toBeInTheDocument();

    // Tapping it again goes back to everything.
    await user.click(safeAva);
    expect(screen.getByRole("button", { name: "PB Toast" })).toBeInTheDocument();
  });

  it("opens an import in the builder for review, flags the duplicate, and saves only on Save", async () => {
    recipes = [PB_TOAST, PLAIN_TOAST];
    foods = [PEANUT, BREAD];
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("button", { name: /^Import$/ })[0]);
    await user.click(await screen.findByRole("button", { name: "Fake parse" }));

    expect(await screen.findByRole("heading", { name: "Check the imported recipe" })).toBeInTheDocument();
    expect(await screen.findByLabelText(/Name/)).toHaveValue("plain toast!");
    expect(addRecipe).not.toHaveBeenCalled();

    const notice = screen.getByTestId("import-duplicate");
    expect(notice).toHaveTextContent('You already have a recipe called "Plain Toast"');
    await user.click(within(notice).getByRole("button", { name: "Save as new" }));
    expect(screen.queryByTestId("import-duplicate")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Create Recipe" }));
    await waitFor(() => expect(addRecipe).toHaveBeenCalledTimes(1));
    expect(addRecipe.mock.calls[0][0]).toMatchObject({
      name: "plain toast!",
      source_type: "website",
      source_url: "https://example.com/toast",
      food_ids: ["f-bread"],
      total_time_minutes: 5,
    });
    expect(addRecipe.mock.calls[0][0].recipe_ingredient_rows?.[0]).toMatchObject({ name: "Bread", quantity: 2, unit: "slice" });
  });

  it("Open existing leaves the import unsaved and opens the recipe already there", async () => {
    recipes = [PB_TOAST, PLAIN_TOAST];
    foods = [PEANUT, BREAD];
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("button", { name: /^Import$/ })[0]);
    await user.click(await screen.findByRole("button", { name: "Fake parse" }));
    const notice = await screen.findByTestId("import-duplicate");
    await user.click(within(notice).getByRole("button", { name: "Open existing" }));

    expect(await screen.findByRole("heading", { name: "Plain Toast" })).toBeInTheDocument();
    expect(addRecipe).not.toHaveBeenCalled();
  });
});
