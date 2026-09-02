import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PlanEntry } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { registerSubscription, unregisterSubscription } from "@/hooks/useRealtimeSubscription";
import { runOptimisticMutation } from "@/lib/optimisticMutation";
import { useAuth } from "./AuthContext";
import { parsePlanEntryRow, parsePlanEntryRows, upsertById, upsertManyById } from "@/lib/normalizeEntities";

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
   * way. To CHANGE the plan use addPlanEntries, updatePlanEntry or
   * deleteWeekPlan, which persist. An eslint no-restricted-syntax rule blocks
   * new callers outside src/contexts.
   */
  setPlanEntries: (entries: PlanEntry[]) => void;
  setPlanEntriesState: React.Dispatch<React.SetStateAction<PlanEntry[]>>;
  addPlanEntry: (entry: Omit<PlanEntry, "id">) => void;
  addPlanEntries: (entries: Omit<PlanEntry, "id">[]) => Promise<void>;
  updatePlanEntry: (id: string, updates: Partial<PlanEntry>) => void;
  copyWeekPlan: (fromDate: string, toDate: string, kidId: string) => Promise<void>;
  deleteWeekPlan: (weekStart: string, kidId: string) => Promise<void>;
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

  const addPlanEntry = useCallback((entry: Omit<PlanEntry, "id">) => {
    if (userId && householdId) {
      supabase
        .from('plan_entries')
        .insert([{ ...entry, user_id: userId, household_id: householdId }])
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) {
            logger.error('Supabase addPlanEntry error:', error);
            setPlanEntriesRaw(prev => [...prev, { ...entry, id: generateId() }]);
          } else if (data) {
            const inserted = parsePlanEntryRow(data as Record<string, unknown>);
            if (inserted) setPlanEntriesRaw(prev => upsertById(prev, inserted));
          }
        });
    } else {
      setPlanEntriesRaw(prev => [...prev, { ...entry, id: generateId() }]);
    }
  }, [userId, householdId]);

  const addPlanEntries = useCallback(async (entries: Omit<PlanEntry, "id">[]) => {
    if (userId && householdId) {
      const entriesWithIds = entries.map(e => ({ ...e, user_id: userId, household_id: householdId }));
      const { data, error } = await supabase.from('plan_entries').insert(entriesWithIds).select();

      if (error) {
        logger.error('Supabase addPlanEntries error:', error);
        const localEntries = entries.map(e => ({ ...e, id: generateId() }));
        setPlanEntriesRaw(prev => [...prev, ...localEntries]);
      } else if (data) {
        setPlanEntriesRaw(prev => upsertManyById(prev, parsePlanEntryRows(data as unknown[])));
      }
    } else {
      const newEntries = entries.map(e => ({ ...e, id: generateId() }));
      setPlanEntriesRaw(prev => [...prev, ...newEntries]);
    }
  }, [userId, householdId]);

  const updatePlanEntry = useCallback((id: string, updates: Partial<PlanEntry>) => {
    if (userId) {
      // US-320: optimistic update with rollback + toast on server rejection.
      void runOptimisticMutation<PlanEntry>(
        setPlanEntriesRaw,
        prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)),
        () => supabase.from('plan_entries').update(updates).eq('id', id),
        { logLabel: 'Supabase updatePlanEntry error:' }
      );
    } else {
      setPlanEntriesRaw(prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)));
    }
  }, [userId]);

  const copyWeekPlan = useCallback(async (fromDate: string, toDate: string, kidId: string) => {
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);

    const currentEntries = planEntriesRef.current;

    const weekEntries = currentEntries.filter(entry => {
      const entryDate = new Date(entry.date);
      const daysDiff = Math.floor((entryDate.getTime() - fromDateObj.getTime()) / (1000 * 60 * 60 * 24));
      return entry.kid_id === kidId && daysDiff >= 0 && daysDiff < 7;
    });

    const newEntries = weekEntries.map(entry => {
      const entryDate = new Date(entry.date);
      const daysDiff = Math.floor((entryDate.getTime() - fromDateObj.getTime()) / (1000 * 60 * 60 * 24));
      const newDate = new Date(toDateObj);
      newDate.setDate(newDate.getDate() + daysDiff);

      return {
        kid_id: entry.kid_id,
        food_id: entry.food_id,
        recipe_id: entry.recipe_id,
        meal_slot: entry.meal_slot,
        date: newDate.toISOString().split('T')[0],
        // @ts-expect-error - outcome field type mismatch
        outcome: undefined,
        notes: entry.notes,
        // @ts-expect-error - result field type mismatch
        result: undefined,
      };
    });

    // @ts-expect-error - Type mismatch with PlanEntry
    await addPlanEntries(newEntries);
  }, [addPlanEntries]);

  const deleteWeekPlan = useCallback(async (weekStart: string, kidId: string) => {
    const weekStartObj = new Date(weekStart);

    const currentEntries = planEntriesRef.current;

    const entriesToDelete = currentEntries.filter(entry => {
      const entryDate = new Date(entry.date);
      const daysDiff = Math.floor((entryDate.getTime() - weekStartObj.getTime()) / (1000 * 60 * 60 * 24));
      return entry.kid_id === kidId && daysDiff >= 0 && daysDiff < 7;
    });

    const idsToDelete = entriesToDelete.map(e => e.id);
    if (idsToDelete.length === 0) return;

    if (userId) {
      // US-320: optimistic week clear; roll back (restore) on server rejection.
      await runOptimisticMutation<PlanEntry>(
        setPlanEntriesRaw,
        prev => prev.filter(e => !idsToDelete.includes(e.id)),
        () => supabase.from('plan_entries').delete().in('id', idsToDelete),
        { logLabel: 'Supabase deleteWeekPlan error:', toastMessage: "Couldn't clear that week — restored. Please try again." }
      );
    } else {
      setPlanEntriesRaw(prev => prev.filter(e => !idsToDelete.includes(e.id)));
    }
  }, [userId]);

  const value = useMemo(() => ({
    planEntries, setPlanEntries, setPlanEntriesState: setPlanEntriesRaw,
    addPlanEntry, addPlanEntries, updatePlanEntry, copyWeekPlan, deleteWeekPlan
  }), [planEntries, setPlanEntries, addPlanEntry, addPlanEntries, updatePlanEntry, copyWeekPlan, deleteWeekPlan]);

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
