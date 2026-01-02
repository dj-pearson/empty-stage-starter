import { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { getSyncStorage } from "@/lib/platform";

interface SmartDefaultsOptions {
  storageKey: string;
  defaultValue: any;
  ttl?: number; // Time to live in milliseconds
}

/**
 * Hook for managing smart defaults based on user behavior
 * Learns from user's previous inputs and suggests defaults
 * Uses platform-safe storage that works on both web and mobile
 */
export function useSmartDefaults<T>({
  storageKey,
  defaultValue,
  ttl = 30 * 24 * 60 * 60 * 1000, // 30 days default
}: SmartDefaultsOptions) {
  const [smartDefault, setSmartDefault] = useState<T>(defaultValue);
  const storage = useMemo(() => getSyncStorage(), []);

  useEffect(() => {
    const stored = storage.getItem(`smart-default-${storageKey}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const now = Date.now();

        // Check if stored value is still valid
        if (!parsed.expiresAt || parsed.expiresAt > now) {
          setSmartDefault(parsed.value);
        } else {
          // Expired, remove it
          storage.removeItem(`smart-default-${storageKey}`);
        }
      } catch (error) {
        console.error("Error parsing smart default:", error);
      }
    }
  }, [storageKey, storage]);

  const updateDefault = (value: T) => {
    const expiresAt = Date.now() + ttl;
    storage.setItem(
      `smart-default-${storageKey}`,
      JSON.stringify({ value, expiresAt })
    );
    setSmartDefault(value);
  };

  const clearDefault = () => {
    storage.removeItem(`smart-default-${storageKey}`);
    setSmartDefault(defaultValue);
  };

  return {
    smartDefault,
    updateDefault,
    clearDefault,
  };
}

/**
 * Hook for tracking frequency of selections to suggest most common choices
 * Uses platform-safe storage that works on both web and mobile
 */
export function useFrequencyTracker(storageKey: string) {
  const [frequencies, setFrequencies] = useState<Record<string, number>>({});
  const storage = useMemo(() => getSyncStorage(), []);

  useEffect(() => {
    const stored = storage.getItem(`frequency-${storageKey}`);
    if (stored) {
      try {
        setFrequencies(JSON.parse(stored));
      } catch (error) {
        console.error("Error parsing frequency data:", error);
      }
    }
  }, [storageKey, storage]);

  const track = (item: string) => {
    setFrequencies((prev) => {
      const updated = {
        ...prev,
        [item]: (prev[item] || 0) + 1,
      };
      storage.setItem(`frequency-${storageKey}`, JSON.stringify(updated));
      return updated;
    });
  };

  const getMostFrequent = (count: number = 5): string[] => {
    return Object.entries(frequencies)
      .sort(([, a], [, b]) => b - a)
      .slice(0, count)
      .map(([item]) => item);
  };

  const clear = () => {
    storage.removeItem(`frequency-${storageKey}`);
    setFrequencies({});
  };

  return {
    frequencies,
    track,
    getMostFrequent,
    clear,
  };
}

/**
 * Hook for context-aware form pre-filling based on current page/route
 */
export function useContextAwareDefaults() {
  const location = useLocation();
  const [context, setContext] = useState<Record<string, any>>({});

  useEffect(() => {
    // Extract context from URL params and location state
    const searchParams = new URLSearchParams(location.search);
    const urlContext: Record<string, any> = {};

    searchParams.forEach((value, key) => {
      urlContext[key] = value;
    });

    setContext({
      ...urlContext,
      ...(location.state as Record<string, any> || {}),
      pathname: location.pathname,
    });
  }, [location]);

  const getDefault = (key: string, fallback: any = null) => {
    return context[key] || fallback;
  };

  return {
    context,
    getDefault,
  };
}

/**
 * Hook for auto-filling forms based on recent entries
 * Uses platform-safe storage that works on both web and mobile
 */
export function useRecentEntries<T>(storageKey: string, maxEntries: number = 10) {
  const [recentEntries, setRecentEntries] = useState<T[]>([]);
  const storage = useMemo(() => getSyncStorage(), []);

  useEffect(() => {
    const stored = storage.getItem(`recent-${storageKey}`);
    if (stored) {
      try {
        setRecentEntries(JSON.parse(stored));
      } catch (error) {
        console.error("Error parsing recent entries:", error);
      }
    }
  }, [storageKey, storage]);

  const addEntry = (entry: T) => {
    setRecentEntries((prev) => {
      // Remove duplicates and add to front
      const filtered = prev.filter(
        (e) => JSON.stringify(e) !== JSON.stringify(entry)
      );
      const updated = [entry, ...filtered].slice(0, maxEntries);
      storage.setItem(`recent-${storageKey}`, JSON.stringify(updated));
      return updated;
    });
  };

  const clear = () => {
    storage.removeItem(`recent-${storageKey}`);
    setRecentEntries([]);
  };

  return {
    recentEntries,
    addEntry,
    clear,
  };
}

/**
 * Hook for learning user preferences over time
 * Uses platform-safe storage that works on both web and mobile
 */
export function usePreferenceLearning(storageKey: string) {
  const [preferences, setPreferences] = useState<Record<string, any>>({});
  const storage = useMemo(() => getSyncStorage(), []);

  useEffect(() => {
    const stored = storage.getItem(`prefs-${storageKey}`);
    if (stored) {
      try {
        setPreferences(JSON.parse(stored));
      } catch (error) {
        console.error("Error parsing preferences:", error);
      }
    }
  }, [storageKey, storage]);

  const learnPreference = (key: string, value: any) => {
    setPreferences((prev) => {
      const updated = { ...prev, [key]: value };
      storage.setItem(`prefs-${storageKey}`, JSON.stringify(updated));
      return updated;
    });
  };

  const getPreference = (key: string, fallback: any = null) => {
    return preferences[key] ?? fallback;
  };

  const clearPreferences = () => {
    storage.removeItem(`prefs-${storageKey}`);
    setPreferences({});
  };

  return {
    preferences,
    learnPreference,
    getPreference,
    clearPreferences,
  };
}

/**
 * Helper to suggest time-based defaults (e.g., breakfast time, lunch time)
 */
export function useTimeBasedDefaults() {
  const getTimeOfDay = (): "breakfast" | "lunch" | "dinner" | "snack" => {
    const hour = new Date().getHours();

    if (hour >= 6 && hour < 11) return "breakfast";
    if (hour >= 11 && hour < 15) return "lunch";
    if (hour >= 17 && hour < 22) return "dinner";
    return "snack";
  };

  const getMealSuggestion = () => {
    return getTimeOfDay();
  };

  const getDayOfWeek = () => {
    return new Date().toLocaleDateString("en-US", { weekday: "long" });
  };

  return {
    getTimeOfDay,
    getMealSuggestion,
    getDayOfWeek,
  };
}
