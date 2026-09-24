import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCallback, useState } from "react";
import "@/i18n";
import type { Food, GroceryItem, Kid, PlanEntry, Recipe } from "@/types";
import type { ScheduleRecipeResult } from "@/contexts/PlanContext";

/**
 * useRecipeQuickPlan against the REAL usePlanToGrocery: the rows that
 * PlanContext.scheduleRecipe hands back must be something preview/push can
 * turn into grocery lines. The sibling test mocks usePlanToGrocery, so it
 * cannot catch a shape mismatch between the two (window keys, kidIds, the
 * entries' date format).
 */

type ToastOpts = { action?: { label: string; onClick: () => void } };
const toastCalls: Array<{ kind: string; title: string; opts?: ToastOpts }> = [];
vi.mock("sonner", () => {
  const record = (kind: string) => (title: string, opts?: ToastOpts) => {
    toastCalls.push({ kind, title, opts });
  };
  return {
    toast: Object.assign(record("default"), {
      success: record("success"),
      error: record("error"),
      warning: record("warning"),
      info: record("info"),
    }),
  };
});
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

const FOODS: Food[] = [
  { id: "f-pasta", name: "Pasta", category: "carb", is_safe: true, is_try_bite: false, quantity: 0, unit: "box" },
  { id: "f-cheese", name: "Cheese", category: "dairy", is_safe: true, is_try_bite: false, quantity: 3, unit: "cup" },
];
const KIDS: Kid[] = [{ id: "k1", name: "Ben", allergens: [] }];
const RECIPE: Recipe = { id: "r1", name: "Mac and cheese", food_ids: ["f-pasta", "f-cheese"] };
const ROWS: PlanEntry[] = [
  { id: "p1", kid_id: "k1", date: "2026-09-24", meal_slot: "dinner", food_id: "f-pasta", result: null, recipe_id: "r1" },
  { id: "p2", kid_id: "k1", date: "2026-09-24", meal_slot: "dinner", food_id: "f-cheese", result: null, recipe_id: "r1" },
];

const added: Array<Array<{ name: string }>> = [];
let nextId = 0;
function useFakeGrocery() {
  const [groceryItems, setItems] = useState<GroceryItem[]>([]);
  const addGroceryItemsMerged = useCallback(
    (items: Array<Partial<GroceryItem> & { name: string; quantity: number }>) => {
      added.push(items.map((i) => ({ name: i.name })));
      setItems((prev) => [
        ...prev,
        ...items.map((i) => ({ ...i, id: `g${++nextId}`, unit: i.unit ?? "", category: "carb", checked: false }) as GroceryItem),
      ]);
      return items.length;
    },
    [],
  );
  const deleteGroceryItems = useCallback((ids: string[]) => {
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
  }, []);
  return { groceryItems, addGroceryItemsMerged, deleteGroceryItems };
}

const scheduleRecipe = vi.fn(
  async (_r: string, _d: string, _s: string, kidIds: string[]): Promise<ScheduleRecipeResult> => ({
    error: null,
    succeeded: kidIds,
    failed: [],
    rows: ROWS,
  }),
);

vi.mock("@/contexts/AppContext", () => ({
  usePlan: () => ({ planEntries: [], scheduleRecipe, deletePlanEntries: vi.fn() }),
  useKids: () => ({ kids: KIDS }),
  useFoods: () => ({ foods: FOODS, catalogById: {} }),
  useGrocery: () => useFakeGrocery(),
}));

import { useRecipeQuickPlan } from "./useRecipeQuickPlan";

describe("useRecipeQuickPlan + usePlanToGrocery (unmocked)", () => {
  beforeEach(() => {
    toastCalls.length = 0;
    added.length = 0;
    nextId = 0;
  });

  it("offers only the missing ingredient and adds it when tapped", async () => {
    const { result } = renderHook(() => useRecipeQuickPlan());
    await act(async () => {
      await result.current.schedule(RECIPE, "2026-09-24", "dinner", ["k1"]);
    });
    const prompt = toastCalls.find((c) => c.kind === "default");
    expect(prompt?.title).toBe("1 ingredient isn't on your list");
    act(() => prompt!.opts!.action!.onClick());
    expect(added).toEqual([[{ name: "Pasta" }]]);
  });

  it("adds straight away with addMissing and does not prompt", async () => {
    const { result } = renderHook(() => useRecipeQuickPlan());
    await act(async () => {
      await result.current.schedule(RECIPE, "2026-09-24", "dinner", ["k1"], { addMissing: true });
    });
    expect(added).toEqual([[{ name: "Pasta" }]]);
    expect(toastCalls.some((c) => c.kind === "default")).toBe(false);
  });
});
