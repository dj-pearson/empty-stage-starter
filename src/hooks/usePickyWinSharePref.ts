import { useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { analytics } from '@/lib/analytics';

/**
 * US-296: "Share my food-chain outcomes anonymously" user preference.
 *
 * Default ON per AC — most users benefit from the aggregate community
 * wins, and the share is anonymous (server scrubs identifiers). Users
 * who explicitly opt out via the toggle in Account → Notifications stop
 * contributing to the aggregate but can still SEE other families' wins
 * if the `picky_win_network` feature flag is on.
 *
 * Persisted client-side; cross-device sync lands when the typed
 * `user_preferences.share_chain_outcomes` column is exposed.
 */
const SHARE_KEY = 'eatpal.share_chain_outcomes';

export function usePickyWinSharePref(): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
} {
  const [enabled, setStored] = useLocalStorage<boolean>(SHARE_KEY, true);

  const setEnabled = useCallback(
    (next: boolean) => {
      setStored(next);
      analytics.trackEvent('picky_win_outcome_shared', { enabled: next });
    },
    [setStored]
  );

  return { enabled, setEnabled };
}
