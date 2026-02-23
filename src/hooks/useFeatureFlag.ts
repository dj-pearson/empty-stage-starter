// @ts-nocheck - Feature flag functions not yet in generated types
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Custom hook to check if a feature flag is enabled for the current user
 * @param flagKey - The unique key of the feature flag
 * @param defaultValue - Default value if flag cannot be evaluated
 * @returns boolean indicating if the feature is enabled
 */
const FLAG_CACHE_KEY = "eatpal_feature_flags";
const FLAG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

export function useFeatureFlag(flagKey: string, defaultValue: boolean = false): boolean {
  // Check localStorage cache first for instant response
  const cachedValue = getCachedFlag(flagKey);
  const [isEnabled, setIsEnabled] = useState<boolean>(cachedValue ?? defaultValue);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    checkFeatureFlag();
  }, [flagKey]);

  const checkFeatureFlag = async () => {
    try {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsEnabled(defaultValue);
        return;
      }

      // Evaluate feature flag
      const { data, error } = await supabase.rpc("evaluate_feature_flag", {
        p_flag_key: flagKey,
        p_user_id: user.id,
      });

      if (error) {
        console.error("Error evaluating feature flag:", error);
        setIsEnabled(defaultValue);
        return;
      }

      const result = data ?? defaultValue;
      setIsEnabled(result);
      setCachedFlag(flagKey, result);
    } catch (error) {
      console.error("Error checking feature flag:", error);
      setIsEnabled(defaultValue);
    } finally {
      setLoading(false);
    }
  };

  return isEnabled;
}

/**
 * Hook to get all feature flags for the current user
 * @returns Object with flag keys as properties and boolean values
 */
export function useFeatureFlags(): { flags: Record<string, boolean>; loading: boolean } {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchAllFlags();
  }, []);

  const fetchAllFlags = async () => {
    try {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setFlags({});
        return;
      }

      // Get all flags for user
      const { data, error } = await supabase.rpc("get_user_feature_flags", {
        p_user_id: user.id,
      });

      if (error) {
        console.error("Error fetching feature flags:", error);
        return;
      }

      // Convert array to object
      const flagsObject: Record<string, boolean> = {};
      data?.forEach((flag: { flag_key: string; enabled: boolean }) => {
        flagsObject[flag.flag_key] = flag.enabled;
      });

      setFlags(flagsObject);
    } catch (error) {
      console.error("Error fetching feature flags:", error);
    } finally {
      setLoading(false);
    }
  };

  return { flags, loading };
}

