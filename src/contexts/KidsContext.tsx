import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { Kid } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { generateId } from "@/lib/utils";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { registerSubscription, unregisterSubscription } from "@/hooks/useRealtimeSubscription";
import { checkFeatureLimit, isPlanLimitError } from "@/lib/featureLimits";
import { requestUpgradePrompt } from "@/lib/upgradePromptBus";
import { runOptimisticMutation } from "@/lib/optimisticMutation";
import { useAuth } from "./AuthContext";
import { parseKidRow, parseKidRows, upsertById } from "@/lib/normalizeEntities";
import { deleteStorageObject } from '@/lib/storageCleanup';
import { trackActivationOnce } from "@/lib/trackActivation";

interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T;
}

/**
 * Merge a realtime kids payload into prior state (US-333): normalize the raw
 * row (array fields coerced to arrays) and dedupe by id.
 */
export function applyKidRealtime(
  prev: Kid[],
  payload: RealtimePayload<Record<string, unknown>>,
): Kid[] {
  if (payload.eventType === 'DELETE') {
    const id = (payload.old as { id?: string })?.id;
    return id ? prev.filter((k) => k.id !== id) : prev;
  }
  const kid = parseKidRow(payload.new);
  if (!kid) return prev; // US-536: drop an invalid realtime row
  const idx = prev.findIndex((k) => k.id === kid.id);
  if (idx === -1) return [...prev, kid];
  const next = prev.slice();
  next[idx] = kid;
  return next;
}

/**
 * A patch for updateKid. `null` clears a nullable column (the only way to
 * clear one: an `undefined` value is stripped, because JSON drops it from the
 * PATCH body and local state would then disagree with the server).
 */
export type KidPatch = { [K in keyof Kid]?: Kid[K] | null };

/**
 * Drop undefined-valued keys so the optimistic merge and the PATCH body are
 * built from the same object.
 */
function stripUndefined<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== undefined) out[key] = patch[key];
  }
  return out;
}

/**
 * Apply a stripped patch to a kid for local state. A null clears the field,
 * which locally means "absent", matching what normalizeKidFromDB produces
 * when the row comes back (null allergens = not recorded, not "none").
 */
function mergeKidPatch(kid: Kid, patch: Partial<KidPatch>): Kid {
  const out = { ...kid } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out as unknown as Kid;
}

interface KidsContextType {
  kids: Kid[];
  setKids: React.Dispatch<React.SetStateAction<Kid[]>>;
  activeKidId: string | null;
  setActiveKidId: React.Dispatch<React.SetStateAction<string | null>>;
  /** `allergens: null` records "not sure yet"; omitting the key lets the DB default ('{}' = none) apply. */
  addKid: (kid: Omit<Kid, "id" | "allergens"> & { allergens?: string[] | null }) => Promise<boolean>;
  /** Resolves true when the change is saved (or applied locally when signed out). */
  updateKid: (id: string, patch: KidPatch) => Promise<boolean>;
  deleteKid: (id: string) => Promise<boolean>;
  setActiveKid: (id: string | null) => void;
  refreshKids: () => Promise<void>;
  /**
   * False until the kids slice holds something true: a non-empty cache, or a
   * settled server load for the current scope. Mirrors foodsHydrated.
   */
  kidsHydrated: boolean;
  setKidsHydrated: (hydrated: boolean) => void;
  /** Message from the last failed kids read, or null once one succeeds. */
  kidsLoadError: string | null;
  setKidsLoadError: (error: string | null) => void;
}

const KidsContext = createContext<KidsContextType | undefined>(undefined);

export function KidsProvider({ children }: { children: React.ReactNode }) {
  const [kids, setKids] = useState<Kid[]>([]);
  const [activeKidId, setActiveKidId] = useState<string | null>(null);
  const [kidsHydrated, setKidsHydratedState] = useState(false);
  const [kidsLoadError, setKidsLoadErrorState] = useState<string | null>(null);
  const setKidsHydrated = useCallback((hydrated: boolean) => {
    setKidsHydratedState(hydrated);
  }, []);
  const setKidsLoadError = useCallback((error: string | null) => {
    setKidsLoadErrorState(error);
  }, []);
  const { userId, householdId } = useAuth();

  // Real-time subscription for kids
  useEffect(() => {
    if (!userId || !householdId) return;

    // Apply EVERY payload (US-525): a trailing debounce dropped distinct events
    // (bulk inserts / DELETE+INSERT pairs) down to the last one.
    const handleChange = (payload: RealtimePayload<Record<string, unknown>>) => {
      setKids((prev) => {
        const next = applyKidRealtime(prev, payload);
        // A DELETE from another device can remove the selected child. Same
        // rule as deleteKid's fixActiveKid: fall to the first remaining kid.
        setActiveKidId((cur) => (cur && !next.some((k) => k.id === cur) ? (next[0]?.id ?? null) : cur));
        return next;
      });
    };

    // Household-scoped channel name so switching households tears down the old
    // channel and opens a distinct one (no stale/duplicate channels). (US-332)
    const channelName = `kids:${householdId}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'kids',
        filter: `household_id=eq.${householdId}`
      }, handleChange)
      .subscribe();

    registerSubscription(channelName, 'kids');

    return () => {
      unregisterSubscription(channelName);
      supabase.removeChannel(channel);
    };
  }, [userId, householdId]);

  const addKid = useCallback(async (
    kid: Omit<Kid, "id" | "allergens"> & { allergens?: string[] | null },
  ): Promise<boolean> => {
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
        // `allergens: null` is sent as-is: the column default ('{}', "no known
        // allergies") only applies when the key is absent, and null is how
        // "not sure yet" is recorded.
        .insert([{ ...kid, user_id: userId, household_id: householdId }])
        .select()
        .single();

      if (error) {
        // Server-side plan-limit trigger rejected the insert — show the upgrade
        // prompt instead of adding a child the server refused.
        if (isPlanLimitError(error)) {
          requestUpgradePrompt({
            feature: 'Additional child profiles',
            message: "You've reached your child profile limit. Upgrade to add more.",
          });
          return false;
        }
        // US-717: a rejected insert used to append a locally-generated child
        // anyway, so the profile looked created and existed nowhere else.
        logger.error('Supabase addKid error:', error);
        toast.error("Couldn't save that child profile. Please try again.");
        return false;
      } else if (data) {
        const inserted = parseKidRow(data as Record<string, unknown>);
        if (inserted) setKids(prev => upsertById(prev, inserted));
      }
      // US-707: the first child is the activation step for a family account.
      // Once per user -- the tenth child is not a tenth activation.
      trackActivationOnce('child_created', userId);
      return true;
    }

    const { allergens, ...rest } = kid;
    const local: Kid = { ...rest, id: generateId() };
    if (allergens != null) local.allergens = allergens;
    setKids(prev => [...prev, local]);
    return true;
  }, [userId, householdId, kids.length]);

  const updateKid = useCallback(async (id: string, patch: KidPatch): Promise<boolean> => {
    // One object feeds both the local merge and the PATCH body, so what the
    // screen shows is exactly what was sent. An undefined value would vanish
    // from the JSON body while still overwriting the field locally.
    const updates = stripUndefined(patch as Record<string, unknown>) as Partial<KidPatch>;
    if (Object.keys(updates).length === 0) return true;
    if (userId) {
      // US-320: optimistic update with rollback + toast on server rejection.
      const result = await runOptimisticMutation<Kid>(
        setKids,
        prev => prev.map(k => (k.id === id ? mergeKidPatch(k, updates) : k)),
        // Every Kid field maps onto a kids column since item 25 added
        // pickiness_level, texture_sensitivity_level and preferred_preparations.
        () => supabase.from('kids').update(updates as TablesUpdate<'kids'>).eq('id', id),
        { logLabel: 'Supabase updateKid error:' }
      );
      return result.error == null;
    }
    setKids(prev => prev.map(k => (k.id === id ? mergeKidPatch(k, updates) : k)));
    return true;
  }, [userId]);

  const deleteKid = useCallback(async (id: string): Promise<boolean> => {
    // Keep the active-kid fixup whether the delete is local or server-backed.
    const fixActiveKid = (remaining: Kid[]) => {
      setActiveKidId(currentActive =>
        currentActive === id ? (remaining[0]?.id ?? null) : currentActive
      );
    };

    // US-628: capture the photo URL before the row goes, so the uploaded object
    // can be removed too. The Privacy Policy tells guardians that deleting a
    // child profile deletes that child's data; leaving the photo behind in a
    // URL-readable bucket makes that untrue.
    const photoUrl = kids.find(k => k.id === id)?.profile_picture_url ?? null;

    if (userId) {
      // US-320: optimistic delete; roll back (re-add) on server rejection.
      const result = await runOptimisticMutation<Kid>(
        setKids,
        prev => {
          const remaining = prev.filter(k => k.id !== id);
          fixActiveKid(remaining);
          return remaining;
        },
        async () => {
          const result = await supabase.from('kids').delete().eq('id', id);
          // Best-effort and deliberately after the row delete: an orphaned
          // object is recoverable, a deleted photo on a kid that came back is
          // not. Never let a storage failure fail the delete.
          if (!result.error) await deleteStorageObject(photoUrl);
          return result;
        },
        { logLabel: 'Supabase deleteKid error:', toastMessage: "Couldn't delete that child — restored. Please try again." }
      );
      return result.error == null;
    }
    setKids(prev => {
      const remaining = prev.filter(k => k.id !== id);
      fixActiveKid(remaining);
      return remaining;
    });
    return true;
  }, [userId, kids]);

  const setActiveKid = useCallback((id: string | null) => {
    setActiveKidId(id);
  }, []);

  const refreshKids = useCallback(async () => {
    // US-550: always scope by household_id (defense-in-depth alongside RLS).
    if (userId && householdId) {
      try {
        const { data, error } = await supabase.from('kids').select('*')
          .eq('household_id', householdId)
          .order('created_at', { ascending: true });
        if (error) {
          // Keep what is on screen and say so, rather than swallowing it.
          logger.error('Supabase refreshKids error:', error);
          setKidsLoadErrorState(
            typeof (error as { message?: unknown }).message === 'string'
              ? (error as { message: string }).message
              : 'Could not load children',
          );
          return;
        }
        if (data) setKids(parseKidRows(data as unknown[]));
        setKidsLoadErrorState(null);
        setKidsHydratedState(true);
      } catch (error) {
        logger.error('Supabase refreshKids error:', error);
        setKidsLoadErrorState(error instanceof Error ? error.message : 'Could not load children');
      }
    }
  }, [userId, householdId]);

  const value = useMemo(() => ({
    kids, setKids, activeKidId, setActiveKidId, addKid, updateKid, deleteKid, setActiveKid, refreshKids,
    kidsHydrated, setKidsHydrated, kidsLoadError, setKidsLoadError,
  }), [kids, activeKidId, addKid, updateKid, deleteKid, setActiveKid, refreshKids,
    kidsHydrated, setKidsHydrated, kidsLoadError, setKidsLoadError]);

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
