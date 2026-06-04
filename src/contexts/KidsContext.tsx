import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { Kid } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId, debounce } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { registerSubscription, unregisterSubscription } from "@/hooks/useRealtimeSubscription";
import { checkFeatureLimit } from "@/lib/featureLimits";
import { requestUpgradePrompt } from "@/lib/upgradePromptBus";
import { runOptimisticMutation } from "@/lib/optimisticMutation";
import { useAuth } from "./AuthContext";

interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T;
}

interface KidsContextType {
  kids: Kid[];
  setKids: React.Dispatch<React.SetStateAction<Kid[]>>;
  activeKidId: string | null;
  setActiveKidId: React.Dispatch<React.SetStateAction<string | null>>;
  addKid: (kid: Omit<Kid, "id">) => Promise<boolean>;
  updateKid: (id: string, kid: Partial<Kid>) => void;
  deleteKid: (id: string) => void;
  setActiveKid: (id: string | null) => void;
  refreshKids: () => Promise<void>;
}

const KidsContext = createContext<KidsContextType | undefined>(undefined);

export function KidsProvider({ children }: { children: React.ReactNode }) {
  const [kids, setKids] = useState<Kid[]>([]);
  const [activeKidId, setActiveKidId] = useState<string | null>(null);
  const { userId, householdId } = useAuth();

  // Real-time subscription for kids
  useEffect(() => {
    if (!userId || !householdId) return;

    const debouncedUpdate = debounce((payload: RealtimePayload<Kid>) => {
      if (payload.eventType === 'INSERT') {
        setKids(prev => {
          const exists = prev.some(kid => kid.id === payload.new.id);
          if (exists) return prev;
          return [...prev, payload.new];
        });
      } else if (payload.eventType === 'UPDATE') {
        setKids(prev => prev.map(kid => kid.id === payload.new.id ? payload.new : kid));
      } else if (payload.eventType === 'DELETE') {
        setKids(prev => prev.filter(kid => kid.id !== payload.old.id));
      }
    }, 300);

    const channel = supabase
      .channel('kids_changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'kids',
        filter: `household_id=eq.${householdId}`
      }, debouncedUpdate)
      .subscribe();

    registerSubscription('kids_changes', 'kids');

    return () => {
      unregisterSubscription('kids_changes');
      supabase.removeChannel(channel);
    };
  }, [userId, householdId]);

  const addKid = useCallback(async (kid: Omit<Kid, "id">): Promise<boolean> => {
    if (userId && householdId) {
      const limit = await checkFeatureLimit('children', kids.length);
      if (!limit.allowed) {
        requestUpgradePrompt({
          feature: 'Additional child profiles',
          message: limit.message,
        });
        return false;
      }

      const { data, error } = await supabase
        .from('kids')
        .insert([{ ...kid, user_id: userId, household_id: householdId }])
        .select()
        .single();

      if (error) {
        logger.error('Supabase addKid error:', error);
        setKids(prev => [...prev, { ...kid, id: generateId() }]);
      } else if (data) {
        setKids(prev => [...prev, data as unknown as Kid]);
      }
      return true;
    }

    setKids(prev => [...prev, { ...kid, id: generateId() }]);
    return true;
  }, [userId, householdId, kids.length]);

  const updateKid = useCallback((id: string, updates: Partial<Kid>) => {
    if (userId) {
      // US-320: optimistic update with rollback + toast on server rejection.
      void runOptimisticMutation<Kid>(
        setKids,
        prev => prev.map(k => (k.id === id ? { ...k, ...updates } : k)),
        () => supabase.from('kids').update(updates).eq('id', id),
        { logLabel: 'Supabase updateKid error:' }
      );
    } else {
      setKids(prev => prev.map(k => (k.id === id ? { ...k, ...updates } : k)));
    }
  }, [userId]);

  const deleteKid = useCallback((id: string) => {
    // Keep the active-kid fixup whether the delete is local or server-backed.
    const fixActiveKid = (remaining: Kid[]) => {
      setActiveKidId(currentActive =>
        currentActive === id ? (remaining[0]?.id ?? null) : currentActive
      );
    };

    if (userId) {
      // US-320: optimistic delete; roll back (re-add) on server rejection.
      void runOptimisticMutation<Kid>(
        setKids,
        prev => {
          const remaining = prev.filter(k => k.id !== id);
          fixActiveKid(remaining);
          return remaining;
        },
        () => supabase.from('kids').delete().eq('id', id),
        { logLabel: 'Supabase deleteKid error:', toastMessage: "Couldn't delete that child — restored. Please try again." }
      );
    } else {
      setKids(prev => {
        const remaining = prev.filter(k => k.id !== id);
        fixActiveKid(remaining);
        return remaining;
      });
    }
  }, [userId]);

  const setActiveKid = useCallback((id: string | null) => {
    setActiveKidId(id);
  }, []);

  const refreshKids = useCallback(async () => {
    if (userId) {
      const { data } = await supabase.from('kids').select('*').order('created_at', { ascending: true });
      if (data) setKids(data as unknown as Kid[]);
    }
  }, [userId]);

  const value = useMemo(() => ({
    kids, setKids, activeKidId, setActiveKidId, addKid, updateKid, deleteKid, setActiveKid, refreshKids
  }), [kids, activeKidId, addKid, updateKid, deleteKid, setActiveKid, refreshKids]);

  return (
    <KidsContext.Provider value={value}>
      {children}
    </KidsContext.Provider>
  );
}

export function useKids() {
  const context = useContext(KidsContext);
  if (!context) throw new Error("useKids must be used within KidsProvider");
  return context;
}
