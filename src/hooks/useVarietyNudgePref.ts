import { useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { analytics } from '@/lib/analytics';

/**
 * US-298: "Variety nudges" user preference.
 *
 * Gates the variety-fatigue banner, the planner repeat chip, and the
 * Dashboard "most-repeated meals" insight card. Defaults ON.
 *
 * Persisted client-side (localStorage / safeStorage round-trip) so the
 * nudges respect the toggle without a network round-trip. The companion
 * additive `user_preferences` table (migration 20260516000000) is the
 * forward-compat home for cross-device sync; this hook is the source of
 * truth for UI gating today.
 */
const NUDGE_VARIETY_KEY = 'eatpal.nudge_variety';

export function useVarietyNudgePref(): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
} {
  const [enabled, setStored] = useLocalStorage<boolean>(NUDGE_VARIETY_KEY, true);

  const setEnabled = useCallback(
    (next: boolean) => {
      setStored(next);
      analytics.trackEvent('variety_nudge_toggled', { enabled: next });
    },
    [setStored]
  );

  return { enabled, setEnabled };
}
