import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { MealSlot, PlanEntry } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId } from "@/lib/utils";
import { registerSubscription, unregisterSubscription } from "@/hooks/useRealtimeSubscription";
import { runOptimisticInsert, runOptimisticMutation } from "@/lib/optimisticMutation";
import { useAuth } from "./AuthContext";
import { parsePlanEntryRow, parsePlanEntryRows } from "@/lib/normalizeEntities";
import { addIsoDays } from "@/lib/date-utils";
import { trackActivationOnce } from "@/lib/trackActivation";
import { logger } from "@/lib/logger";

interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T;
}

/**
 * Merge a realtime plan_entries payload into prior state (US-333): normalize
 * the raw row and dedupe by id.
 */
export function applyPlanEntryRealtime(
  prev: PlanEntry[],
  payload: RealtimePayload<Record<string, unknown>>,
): PlanEntry[] {
  if (payload.eventType === 'DELETE') {
    const id = (payload.old as { id?: string })?.id;
    return id ? prev.filter((e) => e.id !== id) : prev;
  }
  const entry = parsePlanEntryRow(payload.new);
  if (!entry) return prev; // US-536: drop an invalid realtime row
  const idx = prev.findIndex((e) => e.id === entry.id);
  if (idx === -1) return [...prev, entry];
  const next = prev.slice();
  next[idx] = entry;
  return next;
}

/** US-812: every plan write resolves once the server has answered. */
export interface PlanWriteResult {
  error: unknown;
}

export interface PlanInsertResult extends PlanWriteResult {
  /** Ids of the rows that landed (server ids when signed in). */
  insertedIds: string[];
}

export interface PlanDeleteResult extends PlanWriteResult {
  /** The rows that were removed, as they were, so a caller can offer Undo. */
  removed: PlanEntry[];
}

export interface CopyWeekResult extends PlanInsertResult {
  copied: number;
  /** Rows not copied because the destination already had that food there. */
  skipped: number;
}

export interface ReplaceWeekResult extends PlanWriteResult {
  removed: PlanEntry[];
  insertedIds: string[];
}

export interface ScheduleRecipeResult extends PlanWriteResult {
  /** Kid ids the recipe was scheduled for. */
  succeeded: string[];
  failed: string[];
  /**
   * The rows the RPC wrote, from the scoped read-back. Empty when nothing was
   * scheduled or the read-back failed (realtime still delivers them then).
   */
  rows: PlanEntry[];
}

export type SlotTarget = { foodId: string } | { recipeId: string };

type NewPlanEntry = Omit<PlanEntry, "id">;

interface PlanContextType {
  planEntries: PlanEntry[];
  /**
   * SERVER-LOAD ONLY (US-715).
   *
   * Replaces the whole plan slice in local state and writes nothing. Its only
   * legitimate use is dropping in a fresh load from Supabase. Quick Build and
   * AI Generate Week both used it to "save" a generated week: nothing was
   * inserted, so the week was gone on reload and never reached another device,
   * and the wholesale replace wiped every other kid and every other week on the
   * way. To CHANGE the plan use addPlanEntries, updatePlanEntry,
   * replaceWeekPlan or deleteWeekPlan, which persist. An eslint
   * no-restricted-syntax rule blocks new callers outside src/contexts.
   */
  setPlanEntries: (entries: PlanEntry[]) => void;
  setPlanEntriesState: React.Dispatch<React.SetStateAction<PlanEntry[]>>;
  /**
   * US-812: every write below resolves once the server has answered, with the
   * error if there was one. They used to return void, so a caller had no way
   * to tell a saved write from a rejected one and toasted success either way.
   * The rollback and the failure toast still happen in here.
   */
  addPlanEntry: (entry: NewPlanEntry) => Promise<PlanInsertResult>;
  addPlanEntries: (entries: NewPlanEntry[]) => Promise<PlanInsertResult>;
  updatePlanEntry: (id: string, updates: Partial<PlanEntry>) => Promise<{ error: unknown }>;
  copyWeekPlan: (fromDate: string, toDate: string, kidId: string) => Promise<CopyWeekResult>;
  deleteWeekPlan: (weekStart: string, kidId: string) => Promise<PlanDeleteResult>;
  deletePlanEntries: (ids: string[]) => Promise<PlanDeleteResult>;
  deletePlanEntry: (id: string) => Promise<PlanDeleteResult>;
  /** One UPDATE ... WHERE id IN (...) and one rollback. */
  movePlanEntries: (
    ids: string[],
    to: { date: string; meal_slot: MealSlot },
  ) => Promise<PlanWriteResult>;
  /** Empty (kid, date, slot) for each kid and put one food or one recipe there. */
  replaceSlot: (
    kidIds: string[],
    date: string,
    slot: MealSlot,
    target: SlotTarget,
  ) => Promise<PlanWriteResult>;
  /**
   * Make one kid's week equal `next` without destroying what is already there.
   * Rows whose (date, slot, food) survive are kept as they are, logged result
   * and notes included; only the difference is written.
   */
  replaceWeekPlan: (
    weekStart: string,
    kidId: string,
    next: NewPlanEntry[],
  ) => Promise<ReplaceWeekResult>;
  scheduleRecipe: (
    recipeId: string,
    date: string,
    slot: MealSlot,
    kidIds: string[],
  ) => Promise<ScheduleRecipeResult>;
}

const DUPLICATE_MEAL_MESSAGE = "That meal is already planned there";

/** The identity of a planned food inside one kid's week. */
const weekKey = (e: Pick<PlanEntry, "date" | "meal_slot" | "food_id">) =>
  `${e.date}|${e.meal_slot}|${e.food_id}`;

/** The same, across kids. */
const slotFoodKey = (e: Pick<PlanEntry, "kid_id" | "date" | "meal_slot" | "food_id">) =>
  `${e.kid_id}|${e.date}|${e.meal_slot}|${e.food_id}`;

/** Is an ISO date inside the 7-day week starting at weekStart? */
function inWeek(date: string, weekStart: string): boolean {
  const d = date.slice(0, 10);
  return d >= weekStart && d <= addIsoDays(weekStart, 6);
}

/**
 * The writable columns of a plan row. Loaded rows pass straight through the
 * normalizer, so they also carry user_id, household_id and created_at; an
 * Undo that re-inserts one must not send those back.
 */
export function toInsertablePlanEntry(e: PlanEntry | NewPlanEntry): NewPlanEntry {
  const out: NewPlanEntry = {
    kid_id: e.kid_id,
    date: e.date,
    meal_slot: e.meal_slot,
    food_id: e.food_id,
    result: e.result ?? null,
  };
  if (e.recipe_id !== undefined) out.recipe_id = e.recipe_id;
  if (e.is_primary_dish !== undefined) out.is_primary_dish = e.is_primary_dish;
  if (e.notes !== undefined) out.notes = e.notes;
  if (e.amount_eaten !== undefined) out.amount_eaten = e.amount_eaten;
  if (e.food_attempt_id !== undefined) out.food_attempt_id = e.food_attempt_id;
  return out;
}

const PlanContext = createContext<PlanContextType | undefined>(undefined);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [planEntries, setPlanEntriesRaw] = useState<PlanEntry[]>([]);
  const { userId, householdId } = useAuth();

  // US-551: keep the latest entries in a ref so copyWeekPlan/deleteWeekPlan can
  // read current state directly, instead of the impure
  // `setPlanEntriesRaw(prev => { currentEntries = prev; return prev; })` hack
  // (a state updater with a side effect double-fires under StrictMode).
  const planEntriesRef = useRef<PlanEntry[]>(planEntries);
  planEntriesRef.current = planEntries;

  // Real-time subscription for plan_entries
  useEffect(() => {
    if (!userId || !householdId) return;

    // Apply EVERY payload (US-525): a trailing debounce dropped distinct events
    // (bulk inserts / DELETE+INSERT pairs) down to the last one.
    const handleChange = (payload: RealtimePayload<Record<string, unknown>>) => {
      setPlanEntriesRaw((prev) => applyPlanEntryRealtime(prev, payload));
    };

    // Household-scoped channel name so switching households tears down the old
    // channel and opens a distinct one (no stale/duplicate channels). (US-332)
    const channelName = `plan_entries:${householdId}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'plan_entries',
        filter: `household_id=eq.${householdId}`
      }, handleChange)
      .subscribe();

    registerSubscription(channelName, 'plan_entries');

    return () => {
      unregisterSubscription(channelName);
      supabase.removeChannel(channel);
    };
  }, [userId, householdId]);

  const setPlanEntries = useCallback((entries: PlanEntry[]) => {
    setPlanEntriesRaw(entries);
  }, []);

  const addPlanEntries = useCallback(async (entries: NewPlanEntry[]): Promise<PlanInsertResult> => {
    if (entries.length === 0) return { error: null, insertedIds: [] };
    if (userId && householdId) {
      const rows = entries.map(e => ({ ...e, user_id: userId, household_id: householdId }));
      let insertedIds: string[] = [];
      // US-717: a rejected insert used to append locally-generated rows anyway,
      // so the meals looked planned, reached the localStorage backup and
      // existed nowhere else. Roll them back and say so instead.
      const { error } = await runOptimisticInsert<PlanEntry>(
        setPlanEntriesRaw,
        entries.map(e => ({ ...e, id: generateId() })),
        () => supabase.from('plan_entries').insert(rows).select(),
        (data) => {
          const parsed = parsePlanEntryRows(Array.isArray(data) ? data : [data]);
          insertedIds = parsed.map(r => r.id);
          return parsed;
        },
        {
          logLabel: 'Supabase addPlanEntries error:',
          toastMessage: entries.length === 1
            ? "Couldn't save that meal — it's been removed. Please try again."
            : "Couldn't save those meals — they've been removed. Please try again.",
          uniqueViolationMessage: DUPLICATE_MEAL_MESSAGE,
        },
      );
      // US-707: a meal on the planner is the activation step. Fired only on a
      // landed insert, and a generated week is one activation, not seven.
      if (!error) trackActivationOnce('meal_planned', userId, { meal_slot: entries[0]?.meal_slot });
      return { error, insertedIds: error ? [] : insertedIds };
    }
    // Signed out, so local state is the whole story and it cannot fail.
    const local = entries.map(e => ({ ...e, id: generateId() }));
    setPlanEntriesRaw(prev => [...prev, ...local]);
    return { error: null, insertedIds: local.map(e => e.id) };
  }, [userId, householdId]);

  const addPlanEntry = useCallback(
    (entry: NewPlanEntry) => addPlanEntries([entry]),
    [addPlanEntries],
  );

  const updatePlanEntry = useCallback(async (id: string, updates: Partial<PlanEntry>) => {
    if (userId) {
      // US-320: optimistic update with rollback + toast on server rejection.
      // US-812: the result is returned rather than discarded, so a caller can
      // avoid announcing a success the server never gave it.
      return runOptimisticMutation<PlanEntry>(
        setPlanEntriesRaw,
        prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)),
        () => supabase.from('plan_entries').update(updates).eq('id', id),
        { logLabel: 'Supabase updatePlanEntry error:', uniqueViolationMessage: DUPLICATE_MEAL_MESSAGE }
      );
    }
    setPlanEntriesRaw(prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)));
    return { error: null };
  }, [userId]);

  const deletePlanEntries = useCallback(async (ids: string[]): Promise<PlanDeleteResult> => {
    const idSet = new Set(ids);
    const removed = planEntriesRef.current.filter(e => idSet.has(e.id));
    if (idSet.size === 0) return { error: null, removed: [] };
    if (userId) {
      const { error } = await runOptimisticMutation<PlanEntry>(
        setPlanEntriesRaw,
        prev => prev.filter(e => !idSet.has(e.id)),
        () => supabase.from('plan_entries').delete().in('id', [...idSet]),
        {
          logLabel: 'Supabase deletePlanEntries error:',
          toastMessage: "Couldn't remove that, so it's been put back. Please try again.",
        },
      );
      return error ? { error, removed: [] } : { error: null, removed };
    }
    setPlanEntriesRaw(prev => prev.filter(e => !idSet.has(e.id)));
    return { error: null, removed };
  }, [userId]);

  const deletePlanEntry = useCallback(
    (id: string) => deletePlanEntries([id]),
    [deletePlanEntries],
  );

  const movePlanEntries = useCallback(async (
    ids: string[],
    to: { date: string; meal_slot: MealSlot },
  ): Promise<PlanWriteResult> => {
    const idSet = new Set(ids);
    if (idSet.size === 0) return { error: null };
    const apply = (prev: PlanEntry[]) =>
      prev.map(e => (idSet.has(e.id) ? { ...e, date: to.date, meal_slot: to.meal_slot } : e));
    if (userId) {
      return runOptimisticMutation<PlanEntry>(
        setPlanEntriesRaw,
        apply,
        () => supabase
          .from('plan_entries')
          .update({ date: to.date, meal_slot: to.meal_slot })
          .in('id', [...idSet]),
        {
          logLabel: 'Supabase movePlanEntries error:',
          toastMessage: "Couldn't move that meal, so it's back where it was.",
          uniqueViolationMessage: DUPLICATE_MEAL_MESSAGE,
        },
      );
    }
    setPlanEntriesRaw(apply);
    return { error: null };
  }, [userId]);

  const scheduleRecipe = useCallback(async (
    recipeId: string,
    date: string,
    slot: MealSlot,
    kidIds: string[],
  ): Promise<ScheduleRecipeResult> => {
    const kids = [...new Set(kidIds)];
    if (kids.length === 0) return { error: null, succeeded: [], failed: [], rows: [] };

    const settled = await Promise.allSettled(
      kids.map(async (kidId) => {
        const { error } = await supabase.rpc('schedule_recipe_to_plan', {
          p_kid_id: kidId,
          p_recipe_id: recipeId,
          p_date: date,
          p_meal_slot: slot,
        });
        if (error) throw error;
      }),
    );
    const succeeded: string[] = [];
    const failed: string[] = [];
    let firstError: unknown = null;
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') succeeded.push(kids[i]);
      else {
        failed.push(kids[i]);
        if (firstError === null) firstError = r.reason ?? new Error('schedule failed');
      }
    });
    if (firstError) logger.error('schedule_recipe_to_plan failed:', firstError);
    if (succeeded.length === 0) return { error: firstError, succeeded, failed, rows: [] };

    // One scoped read of exactly the rows the RPC wrote. The page used to
    // reload the WHOLE household plan (select('*') with no filter) after every
    // recipe and replace the slice with it, which threw away any optimistic
    // row still in flight and cost a full-table read per tap.
    const { data, error: readError } = await supabase
      .from('plan_entries')
      .select('*')
      .in('kid_id', succeeded)
      .eq('date', date)
      .eq('meal_slot', slot)
      .eq('recipe_id', recipeId);

    let rows: PlanEntry[] = [];
    if (readError) {
      // The rows are saved; realtime will deliver them. Nothing to roll back.
      logger.error('Scoped plan_entries read after schedule failed:', readError);
    } else {
      rows = parsePlanEntryRows((data ?? []) as unknown[]);
      const fresh = new Set(rows.map(r => r.id));
      const scope = new Set(succeeded);
      setPlanEntriesRaw(prev => {
        // The RPC deletes and re-inserts this recipe's rows for the slot, so a
        // row we held for it that the server no longer has is gone. Anything
        // outside (succeeded kids, date, slot, recipe) is left alone.
        let next = prev.filter(e =>
          !(scope.has(e.kid_id) && e.date === date && e.meal_slot === slot &&
            e.recipe_id === recipeId && !fresh.has(e.id)),
        );
        for (const row of rows) {
          next = applyPlanEntryRealtime(next, {
            eventType: 'INSERT',
            new: row as unknown as Record<string, unknown>,
            old: {},
          });
        }
        return next;
      });
    }
    return { error: failed.length > 0 ? firstError : null, succeeded, failed, rows };
  }, []);

  const replaceSlot = useCallback(async (
    kidIds: string[],
    date: string,
    slot: MealSlot,
    target: SlotTarget,
  ): Promise<PlanWriteResult> => {
    const kids = [...new Set(kidIds)];
    const inSlot = (e: PlanEntry) => kids.includes(e.kid_id) && e.date === date && e.meal_slot === slot;
    const current = planEntriesRef.current.filter(inSlot);

    if ('foodId' in target) {
      // The unique index is (household, kid, date, slot, food), so a kid that
      // already has this food in the slot keeps that row rather than having a
      // second one inserted next to it.
      const keep = new Map<string, PlanEntry>();
      for (const e of current) {
        if (e.food_id === target.foodId && !keep.has(e.kid_id)) keep.set(e.kid_id, e);
      }
      const stale = current.filter(e => keep.get(e.kid_id) !== e);
      const toInsert: NewPlanEntry[] = kids
        .filter(k => !keep.has(k))
        .map(k => ({
          kid_id: k, date, meal_slot: slot, food_id: target.foodId,
          recipe_id: null, is_primary_dish: false, result: null,
        }));

      // Insert first, delete second: a rejected insert leaves the slot as it
      // was instead of empty.
      const inserted = await addPlanEntries(toInsert);
      if (inserted.error) return { error: inserted.error };
      const del = await deletePlanEntries(stale.map(e => e.id));
      if (del.error) {
        await deletePlanEntries(inserted.insertedIds);
        return { error: del.error };
      }
      // A kept row that belonged to a recipe is now a plain food row.
      for (const row of keep.values()) {
        if (row.recipe_id) await updatePlanEntry(row.id, { recipe_id: null, is_primary_dish: false });
      }
      return { error: null };
    }

    // Recipe: clear the slot first (the RPC inserts every food of the recipe,
    // and any of those may already be in the slot under another dish).
    const del = await deletePlanEntries(current.map(e => e.id));
    if (del.error) return { error: del.error };
    const sched = await scheduleRecipe(target.recipeId, date, slot, kids);
    if (sched.failed.length > 0) {
      // Put back what the kids the RPC failed for had.
      const failed = new Set(sched.failed);
      const restore = del.removed.filter(e => failed.has(e.kid_id)).map(toInsertablePlanEntry);
      if (restore.length > 0) await addPlanEntries(restore);
    }
    return { error: sched.error };
  }, [addPlanEntries, deletePlanEntries, updatePlanEntry, scheduleRecipe]);

  const replaceWeekPlan = useCallback(async (
    weekStart: string,
    kidId: string,
    next: NewPlanEntry[],
  ): Promise<ReplaceWeekResult> => {
    const current = planEntriesRef.current.filter(e => e.kid_id === kidId && inWeek(e.date, weekStart));

    const existing = new Map<string, PlanEntry>();
    const duplicates: PlanEntry[] = [];
    for (const e of current) {
      const k = weekKey(e);
      if (existing.has(k)) duplicates.push(e);
      else existing.set(k, e);
    }

    const nextKeys = new Set<string>();
    const toInsert: NewPlanEntry[] = [];
    for (const e of next) {
      if (e.kid_id !== kidId || !inWeek(e.date, weekStart)) continue;
      const k = weekKey(e);
      if (nextKeys.has(k)) continue;
      nextKeys.add(k);
      // Present on both sides: keep the row we have, with whatever the parent
      // already logged on it.
      if (!existing.has(k)) toInsert.push(e);
    }
    const stale = [
      ...current.filter(e => existing.get(weekKey(e)) === e && !nextKeys.has(weekKey(e))),
      ...duplicates,
    ];

    // Insert first. If that is refused, the old week is untouched.
    const inserted = await addPlanEntries(toInsert);
    if (inserted.error) return { error: inserted.error, removed: [], insertedIds: [] };

    const del = await deletePlanEntries(stale.map(e => e.id));
    if (del.error) {
      // Leave one week, not two stacked on each other.
      await deletePlanEntries(inserted.insertedIds);
      return { error: del.error, removed: [], insertedIds: [] };
    }
    return { error: null, removed: stale, insertedIds: inserted.insertedIds };
  }, [addPlanEntries, deletePlanEntries]);

  const copyWeekPlan = useCallback(async (
    fromDate: string,
    toDate: string,
    kidId: string,
  ): Promise<CopyWeekResult> => {
    // BOTH sides of the day-difference below are parsed the same way, as UTC
    // midnight, ON PURPOSE. UTC days are always exactly 24h, so the division
    // is exact. Parsing either side as LOCAL midnight would make the span 23h
    // or 25h across a DST boundary and collapse or duplicate a day -- which is
    // US-818, the bug addIsoDays exists to prevent. parseIsoDate is for
    // DISPLAY; day arithmetic stays in UTC.
    const fromDateObj = new Date(fromDate);
    const current = planEntriesRef.current;
    const source = current.filter(e => e.kid_id === kidId && inWeek(e.date, fromDate));
    const taken = new Set(
      current.filter(e => e.kid_id === kidId && inWeek(e.date, toDate)).map(slotFoodKey),
    );

    const newEntries: NewPlanEntry[] = [];
    let skipped = 0;
    for (const entry of source) {
      const entryDate = new Date(entry.date);
      const offset = Math.round((entryDate.getTime() - fromDateObj.getTime()) / 86_400_000);
      const copy: NewPlanEntry = {
        kid_id: entry.kid_id,
        food_id: entry.food_id,
        recipe_id: entry.recipe_id ?? null,
        is_primary_dish: entry.is_primary_dish ?? false,
        meal_slot: entry.meal_slot,
        date: addIsoDays(toDate, offset),
        notes: entry.notes,
        // A copied meal has not been eaten yet.
        result: null,
      };
      const k = slotFoodKey(copy);
      // US-716's unique index would reject the whole batch with a 23505.
      if (taken.has(k)) { skipped++; continue; }
      taken.add(k);
      newEntries.push(copy);
    }

    const { error, insertedIds } = await addPlanEntries(newEntries);
    return { error, insertedIds, copied: error ? 0 : newEntries.length, skipped };
  }, [addPlanEntries]);

  const deleteWeekPlan = useCallback(async (weekStart: string, kidId: string): Promise<PlanDeleteResult> => {
    const ids = planEntriesRef.current
      .filter(e => e.kid_id === kidId && inWeek(e.date, weekStart))
      .map(e => e.id);
    if (ids.length === 0) return { error: null, removed: [] };
    // US-320: optimistic week clear; restored on server rejection.
    return deletePlanEntries(ids);
  }, [deletePlanEntries]);

  const value = useMemo(() => ({
    planEntries, setPlanEntries, setPlanEntriesState: setPlanEntriesRaw,
    addPlanEntry, addPlanEntries, updatePlanEntry, copyWeekPlan, deleteWeekPlan,
    deletePlanEntries, deletePlanEntry, movePlanEntries, replaceSlot, replaceWeekPlan, scheduleRecipe,
  }), [planEntries, setPlanEntries, addPlanEntry, addPlanEntries, updatePlanEntry, copyWeekPlan, deleteWeekPlan,
    deletePlanEntries, deletePlanEntry, movePlanEntries, replaceSlot, replaceWeekPlan, scheduleRecipe]);

  return (
    <PlanContext.Provider value={value}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const context = useContext(PlanContext);
  if (!context) throw new Error("usePlan must be used within PlanProvider");
  return context;
}
