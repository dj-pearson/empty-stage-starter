import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCallback, useState } from "react";
import type { Food, GroceryItem, PlanEntry } from "@/types";

/**
 * The grocery context is replaced with a small in-memory one that behaves like
 * the real add path where it matters here: mergeGroceryItems mints the ids up
 * front (as buildGroceryRow does), returns them synchronously, and commits the
 * rows through state.
 */
const FOODS: Food[] = [
  { id: "f-pasta", name: "Pasta", category: "carb", is_safe: true, is_try_bite: false, quantity: 0, unit: "box" },
  { id: "f-milk", name: "Milk", category: "dairy", is_safe: true, is_try_bite: false, quantity: 5, unit: "cup" },
  { id: "f-bread", name: "Bread", category: "carb", is_safe: true, is_try_bite: false, quantity: 0, unit: "loaf" },
];

let nextId = 0;
const calls = { add: 0, del: 0 };
/** The fake's setter, so a test can land a row the way realtime would. */
let setFakeItems: ((update: (prev: GroceryItem[]) => GroceryItem[]) => void) | null = null;

function useFakeGrocery() {
  const [groceryItems, setItems] = useState<GroceryItem[]>([]);
  setFakeItems = setItems;
  const mergeGroceryItems = useCallback(
    (items: Array<Partial<GroceryItem> & { name: string; quantity: number }>) => {
      calls.add++;
      const rows = items.map(
        (i) =>
          ({
            ...i,
            id: `g${++nextId}`,
            unit: i.unit ?? "",
            category: "carb",
            checked: false,
          }) as GroceryItem,
      );
      setItems((prev) => [...prev, ...rows]);
      return { touched: rows.length, insertedIds: rows.map((r) => r.id), bumps: [] };
    },
    [],
  );
  const deleteGroceryItems = useCallback((ids: string[]) => {
    calls.del++;
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
  }, []);
  return { groceryItems, mergeGroceryItems, deleteGroceryItems };
}

vi.mock("@/contexts/AppContext", () => ({
  useFoods: () => ({ foods: FOODS, catalogById: {} }),
  useGrocery: () => useFakeGrocery(),
}));

import { usePlanToGrocery } from "./usePlanToGrocery";

const WEEK = { from: "2026-09-06", to: "2026-09-12" };
const entries: PlanEntry[] = [
  { id: "e1", kid_id: "k1", date: "2026-09-07", meal_slot: "dinner", food_id: "f-pasta", result: null },
  { id: "e2", kid_id: "k1", date: "2026-09-08", meal_slot: "breakfast", food_id: "f-milk", result: null },
  // Next week: outside the window, must not reach the list.
  { id: "e3", kid_id: "k1", date: "2026-09-15", meal_slot: "dinner", food_id: "f-milk", result: null },
];

describe("usePlanToGrocery", () => {
  beforeEach(() => {
    nextId = 0;
    calls.add = 0;
    calls.del = 0;
  });

  it("previews what a push would do", () => {
    const { result } = renderHook(() => usePlanToGrocery());
    expect(result.current.preview(entries, WEEK)).toEqual({ toAdd: 1, alreadyHave: 1, onList: 0 });
  });

  it("push adds rows and returns insertedIds", () => {
    const { result } = renderHook(() => usePlanToGrocery());
    let out!: ReturnType<typeof result.current.push>;
    act(() => {
      out = result.current.push(entries, WEEK);
    });
    expect(out.added).toBe(1);
    expect(out.retired).toBe(0);
    expect(out.insertedIds).toEqual(["g1"]);
    expect(result.current.preview(entries, WEEK)).toEqual({ toAdd: 0, alreadyHave: 1, onList: 1 });
  });

  it("a second push is a no-op", () => {
    const { result } = renderHook(() => usePlanToGrocery());
    act(() => {
      result.current.push(entries, WEEK);
    });
    let second!: ReturnType<typeof result.current.push>;
    act(() => {
      second = result.current.push(entries, WEEK, { mode: "replace" });
    });
    expect(second.added).toBe(0);
    expect(second.retired).toBe(0);
    expect(second.insertedIds).toEqual([]);
    expect(calls.add).toBe(1);
    expect(calls.del).toBe(0);
  });

  it("replace retires a dropped in-window row; additive and other weeks leave it", () => {
    const { result } = renderHook(() => usePlanToGrocery());
    act(() => {
      result.current.push(entries, WEEK);
    });
    // The pasta dinner (e1) is deleted and bread planned instead.
    const edited: PlanEntry[] = [
      ...entries.filter((e) => e.id !== "e1"),
      { id: "e4", kid_id: "k1", date: "2026-09-07", meal_slot: "dinner", food_id: "f-bread", result: null },
    ];

    // Another week, replace: this week's pasta row is not its business.
    let otherWeek!: ReturnType<typeof result.current.push>;
    act(() => {
      otherWeek = result.current.push(
        [...entries, { id: "n1", kid_id: "k1", date: "2026-09-16", meal_slot: "lunch", food_id: "f-bread", result: null }],
        { from: "2026-09-13", to: "2026-09-19" },
        { mode: "replace" },
      );
    });
    expect(otherWeek.retired).toBe(0);

    let additive!: ReturnType<typeof result.current.push>;
    act(() => {
      additive = result.current.push(edited, WEEK);
    });
    expect(additive.retired).toBe(0);

    let replace!: ReturnType<typeof result.current.push>;
    act(() => {
      replace = result.current.push(edited, WEEK, { mode: "replace" });
    });
    expect(replace.retired).toBe(1);
  });

  it("insertedIds is filled when push returns, not on a later render", () => {
    const { result } = renderHook(() => usePlanToGrocery());
    let ids: string[] | null = null;
    act(() => {
      // Read inside the same act, before any commit: the old name-matching
      // effect only filled this array after the rows rendered.
      ids = [...result.current.push(entries, WEEK).insertedIds];
    });
    expect(ids).toEqual(["g1"]);
  });

  it("returns the retired rows as they were, for an Undo", () => {
    const { result } = renderHook(() => usePlanToGrocery());
    act(() => {
      result.current.push(entries, WEEK);
    });
    const edited: PlanEntry[] = [
      ...entries.filter((e) => e.id !== "e1"),
      { id: "e4", kid_id: "k1", date: "2026-09-07", meal_slot: "dinner", food_id: "f-bread", result: null },
    ];
    let replace!: ReturnType<typeof result.current.push>;
    act(() => {
      replace = result.current.push(edited, WEEK, { mode: "replace" });
    });
    expect(replace.retired).toBe(1);
    expect(replace.retiredRows).toHaveLength(1);
    expect(replace.retiredRows[0]).toMatchObject({ id: "g1", name: "Pasta", source_plan_entry_id: "e1" });
    expect(replace.bumps).toEqual([]);
  });

  it("replace over a week the parent emptied retires its rows", () => {
    const { result } = renderHook(() => usePlanToGrocery());
    act(() => {
      result.current.push(entries, WEEK);
    });
    // Every meal in the week deleted; next week's entry is still planned.
    const emptied = entries.filter((e) => e.id === "e3");
    let out!: ReturnType<typeof result.current.push>;
    act(() => {
      out = result.current.push(emptied, WEEK, { mode: "replace" });
    });
    expect(out.generated).toBe(0);
    expect(out.retired).toBe(1);
    expect(out.retiredRows.map((r) => r.name)).toEqual(["Pasta"]);
    expect(result.current.preview(entries, WEEK).toAdd).toBe(1);
  });

  it("does not capture a co-parent's row that shares a name", () => {
    const { result } = renderHook(() => usePlanToGrocery());
    let out!: ReturnType<typeof result.current.push>;
    act(() => {
      out = result.current.push(entries, WEEK);
      // The other parent's phone synced pasta from the plan at the same
      // moment; realtime lands it here in the same tick.
      setFakeItems?.((prev) => [
        ...prev,
        {
          id: "coparent-1",
          name: "Pasta",
          quantity: 1,
          unit: "box",
          category: "carb",
          checked: false,
          added_via: "meal_plan_sync",
          auto_generated: true,
        } as GroceryItem,
      ]);
    });
    expect(out.insertedIds).toEqual(["g1"]);
  });
});
