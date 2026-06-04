import { useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { analytics } from '@/lib/analytics';

/**
 * US-299: "Auto-restock from forecast" user preference + lead time.
 *
 * When `enabled` is true AND a pantry food's depletion forecast lands within
 * `leadDays` of today, the SmartRestock card auto-adds it to the active
 * grocery list. Defaults OFF per AC so we never burst-add for new users.
 *
 * Persisted client-side; the additive `household_preferences` migration is
 * forward-compat scaffolding for cross-device sync when the typed client
 * picks up the column.
 */
const ENABLED_KEY = 'eatpal.auto_restock_enabled';
const LEAD_DAYS_KEY = 'eatpal.auto_restock_lead_days';
const DEFAULT_LEAD_DAYS = 2;

export function useAutoRestockPref(): {
  enabled: boolean;
  leadDays: number;
  setEnabled: (next: boolean) => void;
  setLeadDays: (next: number) => void;
} {
  const [enabled, setEnabledStored] = useLocalStorage<boolean>(ENABLED_KEY, false);
  const [leadDays, setLeadDaysStored] = useLocalStorage<number>(
    LEAD_DAYS_KEY,
    DEFAULT_LEAD_DAYS
  );

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledStored(next);
      analytics.trackEvent('auto_restock_toggled', { enabled: next });
    },
    [setEnabledStored]
  );

  const setLeadDays = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(7, Math.floor(next)));
      setLeadDaysStored(clamped);
      analytics.trackEvent('auto_restock_lead_days_changed', { lead_days: clamped });
    },
    [setLeadDaysStored]
  );

  return { enabled, leadDays, setEnabled, setLeadDays };
}
