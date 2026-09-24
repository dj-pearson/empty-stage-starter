import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import "@/i18n";
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import type { ScheduleRecipeResult } from "@/contexts/PlanContext";

type ToastOpts = {
  description?: string;
  action?: { label: string; onClick: () => void };
  cancel?: { label: string; onClick: () => void };
};

const toastCalls: Array<{ kind: string; title: string; opts?: ToastOpts }> = [];
vi.mock("sonner", () => {
  const record = (kind: string) => (title: string, opts?: ToastOpts) => {
    toastCalls.push({ kind, title, opts });
  };
  const toast = Object.assign(record("default"), {
    success: record("success"),
    error: record("error"),
    warning: record("warning"),
    info: record("info"),
  });
  return { toast };
});

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const FOODS: Food[] = [
  { id: "f-pb", name: "Peanut butter", category: "protein", is_safe: true, is_try_bite: false, allergens: ["peanuts"], quantity: 0 },
  { id: "f-bread", name: "Bread", category: "carb", is_safe: true, is_try_bite: false, allergens: [], quantity: 0 },
];
const KIDS: Kid[] = [
  { id: "k-ava", name: "Ava", allergens: ["peanut"] },
  { id: "k-ben", name: "Ben", allergens: [] },
  { id: "k-cal", name: "Cal", allergens: [] },
];

const ROWS: PlanEntry[] = [
  { id: "p1", kid_id: "k-ben", date: "2026-09-24", meal_slot: "dinner", food_id: "f-pb", result: null, recipe_id: "r1" },
  { id: "p2", kid_id: "k-ben", date: "2026-09-24", meal_slot: "dinner", food_id: "f-bread", result: null, recipe_id: "r1" },
];

const scheduleRecipe = vi.fn(
  async (_recipeId: string, _date: string, _slot: string, kidIds: string[]): Promise<ScheduleRecipeResult> => ({
    error: null,
    succeeded: kidIds,
    failed: [],
    rows: ROWS,
  }),
);
const deletePlanEntries = vi.fn(async () => ({ error: null, removed: [] }));
const deleteGroceryItems = vi.fn();
const updateGroceryItem = vi.fn();
let currentPlan: PlanEntry[] = [];

vi.mock("@/contexts/AppContext", () => ({
  usePlan: () => ({ planEntries: currentPlan, scheduleRecipe, deletePlanEntries }),
  useKids: () => ({ kids: KIDS }),
  useFoods: () => ({ foods: FOODS, catalogById: {} }),
  useGrocery: () => ({ groceryItems: [], deleteGroceryItems, updateGroceryItem }),
}));

const preview = vi.fn(() => ({ toAdd: 2, alreadyHave: 0, onList: 0 }));
const push = vi.fn(() => ({
  added: 2,
  retired: 0,
  kept: 0,
  insertedIds: ["g1", "g2"],
  generated: 2,
  bumps: [{ id: "g0", prev: { quantity: 1 } }],
}));
vi.mock("@/hooks/usePlanToGrocery", () => ({ usePlanToGrocery: () => ({ preview, push }) }));

import { useRecipeQuickPlan } from "./useRecipeQuickPlan";

const RECIPE: Recipe = { id: "r1", name: "PB Toast", food_ids: ["f-pb", "f-bread"] };

describe("useRecipeQuickPlan", () => {
  beforeEach(() => {
    toastCalls.length = 0;
    currentPlan = [];
    vi.clearAllMocks();
  });

  it("says the weekday and slot name in the success toast, never the ISO date", async () => {
    const { result } = renderHook(() => useRecipeQuickPlan());
    await act(async () => {
      await result.current.schedule(RECIPE, "2026-09-24", "dinner", ["k-ben"]);
    });
    const success = toastCalls.find((c) => c.kind === "success");
    expect(success).toBeDefined();
    const text = `${success!.title} ${success!.opts?.description ?? ""}`;
    expect(text).toContain("Thursday");
    expect(text).toContain("Dinner");
    expect(text).not.toContain("2026-09-24");
    expect(text).not.toMatch(/\bdinner\b/);
  });

  it("Undo deletes exactly the rows the schedule wrote; Open planner navigates to the date", async () => {
    const { result } = renderHook(() => useRecipeQuickPlan());
    await act(async () => {
      await result.current.schedule(RECIPE, "2026-09-24", "dinner", ["k-ben"]);
    });
    const success = toastCalls.find((c) => c.kind === "success")!;
    success.opts!.action!.onClick();
    expect(deletePlanEntries).toHaveBeenCalledWith(["p1", "p2"]);
    success.opts!.cancel!.onClick();
    expect(navigate).toHaveBeenCalledWith("/dashboard/planner?date=2026-09-24");
  });

  it("Undo leaves a kid's meal alone when that kid already had this recipe in the slot", async () => {
    // The RPC re-inserts Ben's rows under new ids; Undo must not wipe a meal
    // that was planned before this tap. Cal is new, so only Cal's row goes.
    currentPlan = [{ ...ROWS[0], id: "old-ben" }];
    const calRow: PlanEntry = { ...ROWS[0], id: "p3", kid_id: "k-cal" };
    scheduleRecipe.mockResolvedValueOnce({
      error: null,
      succeeded: ["k-ben", "k-cal"],
      failed: [],
      rows: [...ROWS, calRow],
    });
    const { result } = renderHook(() => useRecipeQuickPlan());
    await act(async () => {
      await result.current.schedule(RECIPE, "2026-09-24", "dinner", ["k-ben", "k-cal"]);
    });
    toastCalls.find((c) => c.kind === "success")!.opts!.action!.onClick();
    expect(deletePlanEntries).toHaveBeenCalledWith(["p3"]);
  });

  it("'Add N to list' pushes the scheduled rows for the kids that succeeded, with Undo", async () => {
    const { result } = renderHook(() => useRecipeQuickPlan());
    await act(async () => {
      await result.current.schedule(RECIPE, "2026-09-24", "dinner", ["k-ben"]);
    });
    const prompt = toastCalls.find((c) => c.opts?.action?.label === "Add 2 to list");
    expect(prompt).toBeDefined();
    prompt!.opts!.action!.onClick();
    expect(push).toHaveBeenCalledWith(ROWS, { from: "2026-09-24", to: "2026-09-24" }, { kidIds: ["k-ben"] });
    const added = toastCalls.filter((c) => c.kind === "success").pop()!;
    added.opts!.action!.onClick();
    expect(deleteGroceryItems).toHaveBeenCalledWith(["g1", "g2"]);
    // A row already on the list had its quantity bumped; Undo restores it.
    expect(updateGroceryItem).toHaveBeenCalledWith("g0", { quantity: 1 });
  });

  it("toasts the failure and offers nothing when every kid failed", async () => {
    scheduleRecipe.mockResolvedValueOnce({ error: new Error("x"), succeeded: [], failed: ["k-ben"], rows: [] });
    const { result } = renderHook(() => useRecipeQuickPlan());
    await act(async () => {
      await result.current.schedule(RECIPE, "2026-09-24", "dinner", ["k-ben"]);
    });
    expect(toastCalls.map((c) => c.kind)).toEqual(["error"]);
    expect(preview).not.toHaveBeenCalled();
  });

  it("planTonight leaves out the allergic kid and says so", async () => {
    const { result } = renderHook(() => useRecipeQuickPlan());
    await act(async () => {
      await result.current.planTonight(RECIPE);
    });
    expect(scheduleRecipe).toHaveBeenCalledTimes(1);
    const [, , slot, kidIds] = scheduleRecipe.mock.calls[0];
    expect(slot).toBe("dinner");
    expect(kidIds).toEqual(["k-ben", "k-cal"]);
    expect(toastCalls.some((c) => c.kind === "info" && c.title.includes("Ava"))).toBe(true);
  });

  it("planTonight skips a severe allergy and names it as severe (item 29)", async () => {
    KIDS[0] = { id: "k-ava", name: "Ava", allergens: ["peanut"], allergen_severity: { peanut: "severe" } };
    try {
      const { result } = renderHook(() => useRecipeQuickPlan());
      await act(async () => {
        await result.current.planTonight(RECIPE);
      });
      const [, , , kidIds] = scheduleRecipe.mock.calls[0];
      expect(kidIds).toEqual(["k-ben", "k-cal"]);
      expect(toastCalls.some((c) => c.kind === "info" && c.title.includes("Ava: severe peanut"))).toBe(true);
    } finally {
      KIDS[0] = { id: "k-ava", name: "Ava", allergens: ["peanut"] };
    }
  });

  it("planTonight skips a kid whose allergen hides in a food name (family match)", async () => {
    KIDS[1] = { id: "k-ben", name: "Ben", allergens: ["milk"] };
    FOODS.push({ id: "f-butter", name: "Butter", category: "dairy", is_safe: true, is_try_bite: false, allergens: [], quantity: 0 });
    try {
      const { result } = renderHook(() => useRecipeQuickPlan());
      const withButter: Recipe = { id: "r3", name: "Toast", food_ids: ["f-bread", "f-butter"] };
      await act(async () => {
        await result.current.planTonight(withButter);
      });
      const [, , , kidIds] = scheduleRecipe.mock.calls[0];
      expect(kidIds).toEqual(["k-ava", "k-cal"]);
    } finally {
      FOODS.pop();
      KIDS[1] = { id: "k-ben", name: "Ben", allergens: [] };
    }
  });

  it("planTonight schedules nothing when no kid is eligible", async () => {
    const { result } = renderHook(() => useRecipeQuickPlan());
    const onlyPeanut: Recipe = { id: "r2", name: "PB spoon", food_ids: ["f-pb"] };
    // Ava is allergic; Ben and Cal come from the redacted offline cache, so
    // their allergy lists are unknown and they are skipped too.
    KIDS[1] = { id: "k-ben", name: "Ben" };
    KIDS[2] = { id: "k-cal", name: "Cal" };
    try {
      await act(async () => {
        await result.current.planTonight(onlyPeanut);
      });
    } finally {
      KIDS[1] = { id: "k-ben", name: "Ben", allergens: [] };
      KIDS[2] = { id: "k-cal", name: "Cal", allergens: [] };
    }
    expect(scheduleRecipe).not.toHaveBeenCalled();
    const err = toastCalls.find((c) => c.kind === "error");
    expect(err?.opts?.description).toMatch(/Ava/);
    expect(err?.opts?.description).toMatch(/not checked/);
  });
});
