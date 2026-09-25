import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCallback, useState } from "react";
import "@/i18n";
import type { Food, GroceryItem, Kid, PlanEntry, Recipe } from "@/types";
import type { ScheduleRecipeResult } from "@/contexts/PlanContext";
import type { GroceryMergeResult } from "@/contexts/GroceryContext";

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
const deleted: string[][] = [];
let nextId = 0;
function useFakeGrocery() {
  const [groceryItems, setItems] = useState<GroceryItem[]>([]);
  // Same contract as GroceryContext.mergeGroceryItems: ids are minted
  // synchronously on the client (US-823) and returned with the result.
  const mergeGroceryItems = useCallback(
    (items: Array<Partial<GroceryItem> & { name: string; quantity: number }>): GroceryMergeResult => {
      added.push(items.map((i) => ({ name: i.name })));
      const rows = items.map(
        (i) => ({ ...i, id: `g${++nextId}`, unit: i.unit ?? "", category: "carb", checked: false }) as GroceryItem,
      );
      setItems((prev) => [...prev, ...rows]);
      return { touched: rows.length, insertedIds: rows.map((r) => r.id), bumps: [] };
    },
    [],
  );
  const deleteGroceryItems = useCallback((ids: string[]) => {
    deleted.push([...ids]);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
  }, []);
  const updateGroceryItem = useCallback(() => {}, []);
  return { groceryItems, mergeGroceryItems, deleteGroceryItems, updateGroceryItem };
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
    deleted.length = 0;
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

  it("Undo removes exactly the rows push inserted, by the ids the merge returned", async () => {
    const { result } = renderHook(() => useRecipeQuickPlan());
    await act(async () => {
      await result.current.schedule(RECIPE, "2026-09-24", "dinner", ["k1"], { addMissing: true });
    });
    const done = toastCalls.find((c) => c.kind === "success" && /to your list/.test(c.title));
    expect(done).toBeDefined();
    act(() => done!.opts!.action!.onClick());
    expect(deleted).toEqual([["g1"]]);
  });
});
