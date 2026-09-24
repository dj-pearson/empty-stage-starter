/**
 * Plan -> grocery list, for any screen that can see the plan (contract C5).
 *
 * This is the body of Grocery.tsx's old handleRegenerateFromPlan, lifted out so
 * the planner can push its week without the parent leaving the planner. One
 * path means one set of rules:
 *
 *   - Generation is window-scoped (US-713): the days asked for, not the
 *     120-day context the plan holds.
 *   - A family recipe counts once across kids (mealPlanner.generateGroceryList).
 *   - Writes go through mergeGroceryItems and deleteGroceryItems, which
 *     persist and stack duplicates; nothing here sets local state directly.
 *   - A kept row the week now needs more of is bumped to the new count through
 *     the same merge, so it is one request and one Undo entry.
 *   - "replace" retires stale plan-sync rows, but only those whose source plan
 *     entry is inside the window (or no longer in the plan at all), so pushing
 *     next week cannot delete this week's rows. "additive" (the default) never
 *     retires anything. Pass the whole plan as `entries`; the window does the
 *     scoping.
 *   - Running push twice for the same week is a no-op.
 */

import { useCallback, useMemo, useRef } from "react";
import { useFoods, useGrocery } from "@/contexts/AppContext";
import type { GroceryMergeBump } from "@/contexts/GroceryContext";
import { generateGroceryList, type ShoppingWindow } from "@/lib/mealPlanner";
import { resolveFood, type EffectiveFood } from "@/lib/effectiveFood";
import { planRegenerationFromPlan } from "@/lib/groceryData";
import type { GroceryAddInput } from "@/lib/groceryMerge";
import type { GroceryItem, PlanEntry } from "@/types";

export type PlanToGroceryWindow = ShoppingWindow;

export interface PlanToGroceryPreview {
  /** Rows a push would add to the list. */
  toAdd: number;
  /** Foods in the window the pantry already covers. */
  alreadyHave: number;
  /** Foods the plan needs that are already on the list. */
  onList: number;
}

export interface PlanToGroceryOptions {
  /** "additive" (default) only adds; "replace" also retires stale in-window rows. */
  mode?: "additive" | "replace";
  /** Restrict to these kids' entries. Omitted: every kid in `entries`. */
  kidIds?: readonly string[];
  /** The list to write to. Omitted: the household's default list. */
  selectedListId?: string | null;
  /** US-714: the list that owns rows with a null grocery_list_id. */
  defaultListId?: string | null;
}

export interface PlanToGroceryResult {
  /** List lines touched: new rows plus existing rows whose quantity was bumped. */
  added: number;
  retired: number;
  /** Rows left exactly as they were (hand-added, bought, or already synced). */
  kept: number;
  /**
   * Ids of the rows this push inserted, for an Undo. Known when push returns:
   * the grocery context mints them on the client (US-823), so there is no
   * matching by name, and a co-parent's row that happens to share a name can
   * never be swept into this push's Undo.
   */
  insertedIds: string[];
  /** Rows the plan called for before comparing with the list; 0 means nothing needed. */
  generated: number;
  /** The rows a replace retired, as they were, so an Undo can restore them. */
  retiredRows: GroceryItem[];
  /** Existing rows whose quantity this push raised, with what they held before. */
  bumps: GroceryMergeBump[];
}

const dateKey = (value: string) => value.slice(0, 10);

/**
 * The plan entries a push covers: inside the window, and for the given kids
 * when there are any. Exported so the page can build its kid index
 * (buildGroceryKidIndex) from exactly the entries a push would read.
 */
export function scopeEntries(
  entries: readonly PlanEntry[],
  window: PlanToGroceryWindow,
  kidIds: readonly string[] | undefined,
): PlanEntry[] {
  const kids = kidIds ? new Set(kidIds) : null;
  return entries.filter(
    (e) =>
      typeof e.date === "string" &&
      dateKey(e.date) >= window.from &&
      dateKey(e.date) <= window.to &&
      (kids === null || kids.has(e.kid_id)),
  );
}

export function usePlanToGrocery() {
  const { foods, catalogById } = useFoods();
  const { groceryItems, mergeGroceryItems, deleteGroceryItems } = useGrocery();

  // US-795: resolve every food once; generateGroceryList is a plain library
  // and cannot read the catalog itself.
  const effectiveFoodById = useMemo(() => {
    const map: Record<string, EffectiveFood> = {};
    for (const food of foods) {
      const catalog = food.canonical_id ? catalogById[food.canonical_id] : null;
      map[food.id] = resolveFood(food, catalog);
    }
    return map;
  }, [foods, catalogById]);

  // push reads the list through a ref so it keeps a stable identity while the
  // list changes.
  const groceryRef = useRef(groceryItems);
  groceryRef.current = groceryItems;

  const compute = useCallback(
    (entries: readonly PlanEntry[], window: PlanToGroceryWindow, opts: PlanToGroceryOptions = {}) => {
      const scoped = scopeEntries(entries, window, opts.kidIds);
      const generated = generateGroceryList(scoped, foods, effectiveFoodById, window);
      // Which rows a replace may retire. A row whose source entry is in the
      // plan but outside this window or these kids belongs to another sync and
      // is left alone. A row whose source entry is gone from the plan
      // entirely (the meal was deleted) is fair game, since nothing plans it
      // any more and its date can no longer be known. That is why callers
      // pass the whole plan as `entries`, not just the week.
      const scopedIds = new Set(scoped.map((e) => e.id));
      const outOfScope = new Set(entries.filter((e) => !scopedIds.has(e.id)).map((e) => e.id));
      const windowEntryIds = new Set<string>(scopedIds);
      for (const item of groceryRef.current) {
        const source = item.source_plan_entry_id;
        if (source && !outOfScope.has(source)) windowEntryIds.add(source);
      }
      const plan = planRegenerationFromPlan({
        existing: groceryRef.current,
        generated,
        selectedListId: opts.selectedListId ?? null,
        defaultListId: opts.defaultListId,
        windowEntryIds,
      });
      return { scoped, generated, plan };
    },
    [foods, effectiveFoodById],
  );

  const preview = useCallback(
    (entries: readonly PlanEntry[], window: PlanToGroceryWindow, opts?: PlanToGroceryOptions): PlanToGroceryPreview => {
      const { scoped, generated, plan } = compute(entries, window, opts);
      const known = new Set(foods.map((f) => f.id));
      const plannedFoods = new Set(scoped.map((e) => e.food_id).filter((id) => known.has(id)));
      return {
        toAdd: plan.additions.length,
        alreadyHave: Math.max(0, plannedFoods.size - generated.length),
        onList: generated.length - plan.additions.length,
      };
    },
    [compute, foods],
  );

  const push = useCallback(
    (entries: readonly PlanEntry[], window: PlanToGroceryWindow, opts: PlanToGroceryOptions = {}): PlanToGroceryResult => {
      const mode = opts.mode ?? "additive";
      const { generated, plan } = compute(entries, window, opts);

      // Retire BEFORE the nothing-to-add return. A replace over a week the
      // parent emptied is exactly the case that has to clear the old rows;
      // returning first left every one of them on the list.
      const retireIds = mode === "replace" ? plan.retireIds : [];
      const retireSet = new Set(retireIds);
      const retiredRows = groceryRef.current.filter((item) => retireSet.has(item.id)).map((item) => ({ ...item }));
      if (retireIds.length > 0) deleteGroceryItems(retireIds);

      if (generated.length === 0) {
        return {
          added: 0,
          retired: retireIds.length,
          kept: plan.preservedCount,
          insertedIds: [],
          generated: 0,
          retiredRows,
          bumps: [],
        };
      }

      // A kept row the week needs more of goes in as the difference, so the
      // merge's bump lands it on the new total (absolute on the wire, so a
      // replayed bump is idempotent).
      const growth: GroceryAddInput[] = plan.updates.map((u) => ({
        name: u.name,
        quantity: u.delta,
        unit: u.unit,
        grocery_list_id: opts.selectedListId ?? undefined,
      }));
      const batch: GroceryAddInput[] = [...plan.additions, ...growth];

      let added = 0;
      let insertedIds: string[] = [];
      let bumps: GroceryMergeBump[] = [];
      if (batch.length > 0) {
        const result = mergeGroceryItems(batch, { defaultListId: opts.defaultListId });
        added = result.touched;
        insertedIds = result.insertedIds;
        bumps = result.bumps;
      }

      return {
        added,
        retired: retireIds.length,
        kept: plan.preservedCount,
        insertedIds,
        generated: generated.length,
        retiredRows,
        bumps,
      };
    },
    [compute, mergeGroceryItems, deleteGroceryItems],
  );

  return { preview, push };
}
