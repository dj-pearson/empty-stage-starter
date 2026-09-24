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
 *   - Writes go through addGroceryItemsMerged and deleteGroceryItems, which
 *     persist and stack duplicates; nothing here sets local state directly.
 *   - "replace" retires stale plan-sync rows, but only those whose source plan
 *     entry is inside the window (or no longer in the plan at all), so pushing
 *     next week cannot delete this week's rows. "additive" (the default) never
 *     retires anything. Pass the whole plan as `entries`; the window does the
 *     scoping.
 *   - Running push twice for the same week is a no-op.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFoods, useGrocery } from "@/contexts/AppContext";
import { generateGroceryList, type ShoppingWindow } from "@/lib/mealPlanner";
import { resolveFood, type EffectiveFood } from "@/lib/effectiveFood";
import { MEAL_PLAN_SYNC, planRegenerationFromPlan } from "@/lib/groceryData";
import type { PlanEntry } from "@/types";

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
   * Ids of the rows this push inserted, for an Undo. The ids are assigned
   * inside the grocery context, so this array is filled when the inserted
   * rows commit, which happens in the same act/tick as the push and before
   * any toast action can be clicked. Read it lazily (e.g. inside onClick).
   */
  insertedIds: string[];
  /** Rows the plan called for before comparing with the list; 0 means nothing needed. */
  generated: number;
}

interface PendingInsert {
  before: ReadonlySet<string>;
  names: ReadonlySet<string>;
  target: string[];
}

const nameKey = (name: string) => name.trim().toLowerCase();
const dateKey = (value: string) => value.slice(0, 10);

function scopeEntries(
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
  const { groceryItems, addGroceryItemsMerged, deleteGroceryItems } = useGrocery();

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

  // push reads the list through a ref so two pushes in one handler see the
  // same list, and so push keeps a stable identity while the list changes.
  const groceryRef = useRef(groceryItems);
  groceryRef.current = groceryItems;
  const pendingRef = useRef<PendingInsert[]>([]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (pending.length === 0) return;
    pendingRef.current = [];
    for (const p of pending) {
      for (const item of groceryItems) {
        if (p.before.has(item.id)) continue;
        if (item.added_via !== MEAL_PLAN_SYNC) continue;
        if (!p.names.has(nameKey(item.name))) continue;
        if (!p.target.includes(item.id)) p.target.push(item.id);
      }
    }
  }, [groceryItems]);

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
      const insertedIds: string[] = [];
      if (generated.length === 0) {
        return { added: 0, retired: 0, kept: plan.preservedCount, insertedIds, generated: 0 };
      }

      const retireIds = mode === "replace" ? plan.retireIds : [];
      if (retireIds.length > 0) deleteGroceryItems(retireIds);

      let added = 0;
      if (plan.additions.length > 0) {
        pendingRef.current.push({
          before: new Set(groceryRef.current.map((i) => i.id)),
          names: new Set(plan.additions.map((a) => nameKey(a.name))),
          target: insertedIds,
        });
        added = addGroceryItemsMerged(plan.additions, { defaultListId: opts.defaultListId });
      }

      return {
        added,
        retired: retireIds.length,
        kept: plan.preservedCount,
        insertedIds,
        generated: generated.length,
      };
    },
    [compute, addGroceryItemsMerged, deleteGroceryItems],
  );

  return { preview, push };
}
