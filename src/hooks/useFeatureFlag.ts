// @ts-nocheck - Feature flag functions not yet in generated types
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared localStorage cache used by both the useFeatureFlag hook and the
 * admin FeatureFlagDashboard. The admin dashboard writes to this same key
 * whenever a flag is toggled so frontend consumers see changes immediately.
 */
const FLAG_CACHE_KEY = "eatpal_feature_flags";
const FLAG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function getCachedFlag(flagKey: string): boolean | null {
  try {
    const cached = localStorage.getItem(FLAG_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp > FLAG_CACHE_TTL) return null;
    return parsed.flags?.[flagKey] ?? null;
  } catch {
    return null;
  }
}

function setCachedFlag(flagKey: string, value: boolean): void {
  try {
    const cached = localStorage.getItem(FLAG_CACHE_KEY);
    const parsed = cached ? JSON.parse(cached) : { flags: {}, timestamp: Date.now() };
    parsed.flags[flagKey] = value;
    parsed.timestamp = Date.now();
    localStorage.setItem(FLAG_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // localStorage may be unavailable
  }
}

function setCachedFlags(flagsObj: Record<string, boolean>): void {
  try {
    const cached = localStorage.getItem(FLAG_CACHE_KEY);
    const parsed = cached ? JSON.parse(cached) : { flags: {}, timestamp: Date.now() };
    Object.assign(parsed.flags, flagsObj);
    parsed.timestamp = Date.now();
    localStorage.setItem(FLAG_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // localStorage may be unavailable
  }
}

function getAllCachedFlags(): Record<string, boolean> | null {
  try {
    const cached = localStorage.getItem(FLAG_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp > FLAG_CACHE_TTL) return null;
    return parsed.flags ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// useFeatureFlag – single flag check
// ---------------------------------------------------------------------------

/**
 * Custom hook to check if a feature flag is enabled for the current user.
 *
 * Resolution order:
 * 1. localStorage cache (instant, populated by admin dashboard or previous checks)
 * 2. Supabase RPC `evaluate_feature_flag` (handles rollout percentage server-side)
 * 3. Direct query to `feature_flags` table with client-side rollout evaluation
 * 4. Falls back to `defaultValue` on any failure
 *
 * @param flagKey - The unique key of the feature flag
 * @param defaultValue - Default value if flag cannot be evaluated (default: false)
 * @returns boolean indicating if the feature is enabled
 */
export function useFeatureFlag(flagKey: string, defaultValue: boolean = false): boolean {
  // Check localStorage cache first for instant response
  const cachedValue = getCachedFlag(flagKey);
  const [isEnabled, setIsEnabled] = useState<boolean>(cachedValue ?? defaultValue);

  const checkFeatureFlag = useCallback(async () => {
    try {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsEnabled(defaultValue);
        return;
      }

      // Strategy 1: Try the RPC (handles rollout percentage server-side)
      try {
        const { data, error } = await supabase.rpc("evaluate_feature_flag", {
          p_flag_key: flagKey,
          p_user_id: user.id,
        });

        if (!error && data !== null && data !== undefined) {
          const result = Boolean(data);
          setIsEnabled(result);
          setCachedFlag(flagKey, result);
          return;
        }
      } catch {
        // RPC may not exist yet, fall through to direct query
      }

      // Strategy 2: Direct query with client-side rollout evaluation
      try {
        const { data: flagRow, error: queryError } = await supabase
          .from("feature_flags")
          .select("enabled, rollout_percentage")
          .eq("key", flagKey)
          .maybeSingle();

        if (!queryError && flagRow) {
          let result = flagRow.enabled;

          // Client-side rollout: use a deterministic hash of user ID + flag key
          if (result && flagRow.rollout_percentage < 100) {
            const hash = simpleHash(user.id + flagKey);
            const bucket = hash % 100;
            result = bucket < flagRow.rollout_percentage;
          }

          setIsEnabled(result);
          setCachedFlag(flagKey, result);
          return;
        }
      } catch {
        // Table may not exist, fall through
      }

      // Strategy 3: Use cached value or default
      const cached = getCachedFlag(flagKey);
      setIsEnabled(cached ?? defaultValue);
    } catch (error) {
      console.error("Error checking feature flag:", error);
      setIsEnabled(getCachedFlag(flagKey) ?? defaultValue);
    }
  }, [flagKey, defaultValue]);

  useEffect(() => {
    checkFeatureFlag();
  }, [checkFeatureFlag]);

  return isEnabled;
}

// ---------------------------------------------------------------------------
// useFeatureFlags – all flags for the current user
// ---------------------------------------------------------------------------

/**
 * Hook to get all feature flags for the current user.
 * Uses localStorage cache for initial render, then refreshes from Supabase.
 *
 * @returns Object with flag keys as properties and boolean values, plus loading state
 */
export function useFeatureFlags(): {
  flags: Record<string, boolean>;
  loading: boolean;
} {
  const [flags, setFlags] = useState<Record<string, boolean>>(
    () => getAllCachedFlags() ?? {},
  );
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAllFlags = useCallback(async () => {
    try {
      setLoading(true);

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setFlags({});
        return;
      }

      // Strategy 1: Try the RPC
      try {
        const { data, error } = await supabase.rpc("get_user_feature_flags", {
          p_user_id: user.id,
        });

        if (!error && data) {
          const flagsObject: Record<string, boolean> = {};
          (data as Array<{ flag_key: string; enabled: boolean }>).forEach((flag) => {
            flagsObject[flag.flag_key] = flag.enabled;
          });
          setFlags(flagsObject);
          setCachedFlags(flagsObject);
          return;
        }
      } catch {
        // RPC may not exist, fall through
      }

      // Strategy 2: Direct query
      try {
        const { data: allFlags, error: queryError } = await supabase
          .from("feature_flags")
          .select("key, enabled, rollout_percentage");

        if (!queryError && allFlags) {
          const flagsObject: Record<string, boolean> = {};
          (allFlags as Array<{ key: string; enabled: boolean; rollout_percentage: number }>).forEach((flag) => {
            let result = flag.enabled;
            // For rollout, use a deterministic hash with user ID
            if (result && flag.rollout_percentage < 100) {
              const hash = simpleHash(user.id + flag.key);
              const bucket = hash % 100;
              result = bucket < flag.rollout_percentage;
            }
            flagsObject[flag.key] = result;
          });
          setFlags(flagsObject);
          setCachedFlags(flagsObject);
          return;
        }
      } catch {
        // Table may not exist, fall through
      }

      // Strategy 3: Use cached flags
      const cached = getAllCachedFlags();
      if (cached) {
        setFlags(cached);
      }
    } catch (error) {
      console.error("Error fetching feature flags:", error);
      const cached = getAllCachedFlags();
      if (cached) {
        setFlags(cached);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllFlags();
  }, [fetchAllFlags]);

  return { flags, loading };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Simple deterministic hash for consistent rollout bucketing.
 * Uses DJB2 algorithm to produce a positive integer from a string.
 */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}
