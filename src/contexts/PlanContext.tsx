import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { PlanEntry } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId, debounce } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { registerSubscription, unregisterSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "./AuthContext";

interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T;
}

interface PlanContextType {
  planEntries: PlanEntry[];
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

  // Real-time subscription for plan_entries
  useEffect(() => {
    if (!userId || !householdId) return;

    const debouncedUpdate = debounce((payload: RealtimePayload<PlanEntry>) => {
      if (payload.eventType === 'INSERT') {
        setPlanEntriesRaw(prev => {
          const exists = prev.some(entry => entry.id === payload.new.id);
          if (exists) return prev;
          return [...prev, payload.new];
        });
      } else if (payload.eventType === 'UPDATE') {
        setPlanEntriesRaw(prev => prev.map(entry => entry.id === payload.new.id ? payload.new : entry));
      } else if (payload.eventType === 'DELETE') {
        setPlanEntriesRaw(prev => prev.filter(entry => entry.id !== payload.old.id));
      }
    }, 300);

    const channel = supabase
      .channel('plan_entries_changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'plan_entries',
        filter: `household_id=eq.${householdId}`
      }, debouncedUpdate)
      .subscribe();

    registerSubscription('plan_entries_changes', 'plan_entries');

    return () => {
      unregisterSubscription('plan_entries_changes');
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
            setPlanEntriesRaw(prev => [...prev, data as unknown as PlanEntry]);
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
        setPlanEntriesRaw(prev => [...prev, ...(data as unknown as PlanEntry[])]);
      }
    } else {
      const newEntries = entries.map(e => ({ ...e, id: generateId() }));
      setPlanEntriesRaw(prev => [...prev, ...newEntries]);
    }
  }, [userId, householdId]);

  const updatePlanEntry = useCallback((id: string, updates: Partial<PlanEntry>) => {
    if (userId) {
      supabase.from('plan_entries').update(updates).eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase updatePlanEntry error:', error);
          setPlanEntriesRaw(prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)));
        });
    } else {
      setPlanEntriesRaw(prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)));
    }
  }, [userId]);

  const copyWeekPlan = useCallback(async (fromDate: string, toDate: string, kidId: string) => {
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);

    // Read current planEntries via functional ref
    let currentEntries: PlanEntry[] = [];
    setPlanEntriesRaw(prev => { currentEntries = prev; return prev; });

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
        // @ts-ignore - outcome field type mismatch
        outcome: undefined,
        notes: entry.notes,
        // @ts-ignore - result field type mismatch
        result: undefined,
      };
    });

    // @ts-ignore - Type mismatch with PlanEntry
    await addPlanEntries(newEntries);
  }, [addPlanEntries]);

  const deleteWeekPlan = useCallback(async (weekStart: string, kidId: string) => {
    const weekStartObj = new Date(weekStart);

    let currentEntries: PlanEntry[] = [];
    setPlanEntriesRaw(prev => { currentEntries = prev; return prev; });

    const entriesToDelete = currentEntries.filter(entry => {
      const entryDate = new Date(entry.date);
      const daysDiff = Math.floor((entryDate.getTime() - weekStartObj.getTime()) / (1000 * 60 * 60 * 24));
      return entry.kid_id === kidId && daysDiff >= 0 && daysDiff < 7;
    });

    const idsToDelete = entriesToDelete.map(e => e.id);

    if (userId && idsToDelete.length > 0) {
      const { error } = await supabase.from('plan_entries').delete().in('id', idsToDelete);
      if (error) logger.error('Supabase deleteWeekPlan error:', error);
    }

    setPlanEntriesRaw(prev => prev.filter(e => !idsToDelete.includes(e.id)));
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
