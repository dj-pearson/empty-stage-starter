import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import "@/i18n";
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import type { ScheduleRecipeResult } from "@/contexts/PlanContext";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

const syncLadderAfterPlanResult = vi.fn(async (_id: string) => [] as unknown[]);
vi.mock("@/hooks/useFoodLadder", () => ({ syncLadderAfterPlanResult: (id: string) => syncLadderAfterPlanResult(id) }));

const FOODS: Food[] = [
  { id: "f-pb", name: "Peanut butter", category: "protein", is_safe: true, is_try_bite: false, allergens: ["peanuts"] },
  { id: "f-bread", name: "Bread", category: "carb", is_safe: true, is_try_bite: false, allergens: [] },
];
const KIDS: Kid[] = [
  { id: "k-ava", name: "Ava", allergens: ["peanut"] },
  { id: "k-ben", name: "Ben", allergens: [] },
  { id: "k-cal", name: "Cal", allergens: [] },
  { id: "k-dee", name: "Dee" }, // allergy list never recorded
];
const RECIPE: Recipe = { id: "r1", name: "PB toast", food_ids: ["f-pb", "f-bread"] };

// 2026-09-24 18:30 local: the dinner slot.
const NOW = new Date(2026, 8, 24, 18, 30);
const TODAY = "2026-09-24";

const row = (id: string, kid: string, food: string, extra: Partial<PlanEntry> = {}): PlanEntry => ({
  id,
  kid_id: kid,
  date: TODAY,
  meal_slot: "dinner",
  food_id: food,
  result: null,
  recipe_id: "r1",
  ...extra,
});

let currentPlan: PlanEntry[] = [];
const scheduleRecipe = vi.fn(
  async (_r: string, _d: string, _s: string, kidIds: string[]): Promise<ScheduleRecipeResult> => ({
    error: null,
    succeeded: kidIds,
    failed: [],
    rows: kidIds.flatMap((k) => [
      row(`new-${k}-bread`, k, "f-bread"),
      row(`new-${k}-pb`, k, "f-pb", { is_primary_dish: true }),
    ]),
  }),
);
const updatePlanEntry = vi.fn(async (_id: string, _patch: Partial<PlanEntry>) => ({ error: null }));
const deletePlanEntries = vi.fn(async (_ids: string[]) => ({ error: null, removed: [] }));

vi.mock("@/contexts/AppContext", () => ({
  usePlan: () => ({ planEntries: currentPlan, scheduleRecipe, updatePlanEntry, deletePlanEntries }),
  useKids: () => ({ kids: KIDS }),
  useFoods: () => ({ foods: FOODS, catalogById: {} }),
}));

import { useRecipeCookLog } from "./useRecipeCookLog";

beforeEach(() => {
  currentPlan = [];
  scheduleRecipe.mockClear();
  updatePlanEntry.mockClear();
  deletePlanEntries.mockClear();
  syncLadderAfterPlanResult.mockClear();
});

describe("useRecipeCookLog", () => {
  it("logs on today's existing entry, on its primary row, and undo restores it", async () => {
    currentPlan = [
      row("p-bread", "k-ben", "f-bread", { result: "tasted", amount_eaten: "some" }),
      row("p-pb", "k-ben", "f-pb", { is_primary_dish: true, result: "tasted", amount_eaten: "some" }),
    ];
    const { result } = renderHook(() => useRecipeCookLog());
    let outcome!: Awaited<ReturnType<typeof result.current.logCooked>>;
    await act(async () => {
      outcome = await result.current.logCooked(RECIPE, [{ kidId: "k-ben", result: "refused" }], NOW);
    });

    expect(scheduleRecipe).not.toHaveBeenCalled();
    expect(updatePlanEntry).toHaveBeenCalledTimes(1);
    expect(updatePlanEntry.mock.calls[0][0]).toBe("p-pb");
    expect(updatePlanEntry.mock.calls[0][1]).toMatchObject({ result: "refused", amount_eaten: null });
    expect(outcome.logged).toEqual(["k-ben"]);
    expect(outcome.createdIds).toEqual([]);

    await act(async () => {
      await outcome.undo();
    });
    expect(updatePlanEntry).toHaveBeenLastCalledWith("p-pb", { result: "tasted", amount_eaten: "some" });
    expect(deletePlanEntries).not.toHaveBeenCalled();
  });

  it("schedules today's current slot when nothing is planned, then logs, and undo deletes what it made", async () => {
    const { result } = renderHook(() => useRecipeCookLog());
    let outcome!: Awaited<ReturnType<typeof result.current.logCooked>>;
    await act(async () => {
      outcome = await result.current.logCooked(RECIPE, [{ kidId: "k-ben", result: "ate" }], NOW);
    });

    expect(scheduleRecipe).toHaveBeenCalledWith("r1", TODAY, "dinner", ["k-ben"]);
    expect(updatePlanEntry).toHaveBeenCalledWith("new-k-ben-pb", expect.objectContaining({ result: "ate" }));
    // The result moves the ladder too (performQuickLog's fold).
    await vi.waitFor(() => expect(syncLadderAfterPlanResult).toHaveBeenCalledWith("new-k-ben-pb"));

    await act(async () => {
      await outcome.undo();
    });
    expect(deletePlanEntries).toHaveBeenCalledWith(["new-k-ben-bread", "new-k-ben-pb"]);
    // A row this call created is deleted, not reset.
    expect(updatePlanEntry).toHaveBeenCalledTimes(1);
  });

  it("keeps a kid with an allergen hit or unknown allergies off the plan", async () => {
    const { result } = renderHook(() => useRecipeCookLog());
    let outcome!: Awaited<ReturnType<typeof result.current.logCooked>>;
    await act(async () => {
      outcome = await result.current.logCooked(
        RECIPE,
        [
          { kidId: "k-ava", result: "ate" },
          { kidId: "k-dee", result: "ate" },
          { kidId: "k-cal", result: "tasted" },
        ],
        NOW,
      );
    });

    expect(scheduleRecipe).toHaveBeenCalledWith("r1", TODAY, "dinner", ["k-cal"]);
    expect(outcome.logged).toEqual(["k-cal"]);
    expect(outcome.blocked.map((b) => [b.kidId, b.gate.reason])).toEqual([
      ["k-ava", "allergen"],
      ["k-dee", "unknown"],
    ]);
  });

  it("an allergic kid who already has it on today's plan can still be logged", async () => {
    currentPlan = [row("p-ava", "k-ava", "f-pb", { is_primary_dish: true })];
    const { result } = renderHook(() => useRecipeCookLog());
    const rows = result.current.preview(RECIPE, NOW);
    expect(rows.find((r) => r.kid.id === "k-ava")).toMatchObject({ gate: null, entry: { id: "p-ava" } });
    expect(rows.find((r) => r.kid.id === "k-dee")?.gate).toEqual({ reason: "unknown" });
  });

  it("reports a kid the schedule failed for", async () => {
    scheduleRecipe.mockImplementationOnce(async (_r, _d, _s, kidIds) => ({
      error: new Error("boom"),
      succeeded: [],
      failed: kidIds,
      rows: [],
    }));
    const { result } = renderHook(() => useRecipeCookLog());
    let outcome!: Awaited<ReturnType<typeof result.current.logCooked>>;
    await act(async () => {
      outcome = await result.current.logCooked(RECIPE, [{ kidId: "k-ben", result: "ate" }], NOW);
    });
    expect(outcome.failed).toEqual(["k-ben"]);
    expect(updatePlanEntry).not.toHaveBeenCalled();
  });
});
