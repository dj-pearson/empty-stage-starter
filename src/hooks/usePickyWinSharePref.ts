import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { analytics } from '@/lib/analytics';
import {
  adoptShareChainUser,
  getShareChainState,
  loadShareChainPref,
  setShareChainPref,
  subscribeShareChain,
} from '@/lib/shareChainPref';
import '@/i18n/appLocale';

/**
 * US-296: "Share my food-chain outcomes anonymously", bound to React.
 *
 * The value lives in picky_win_preferences (see src/lib/shareChainPref.ts);
 * this hook adopts the signed-in user, loads their row once, and saves on
 * toggle. `enabled` paints from the device cache until `loaded`; nothing is
 * contributed before then (chainNetwork checks the store, not this value).
 *
 * Public shape kept for LadderOverview and FoodLadderBoard: { enabled,
 * setEnabled }, plus { pending, loaded } for the Settings switch.
 */
export function usePickyWinSharePref(): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  pending: boolean;
  loaded: boolean;
} {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const state = useSyncExternalStore(subscribeShareChain, getShareChainState, getShareChainState);

  useEffect(() => {
    adoptShareChainUser(userId);
    if (userId) void loadShareChainPref(userId);
  }, [userId]);

  const setEnabled = useCallback(
    (next: boolean) => {
      if (!userId) return;
      void setShareChainPref(userId, next).then(({ error }) => {
        if (error) {
          toast.error(
            t('settings.prefs.privacy.winNetwork.saveFailed', {
              defaultValue: "Couldn't save your sharing choice. Nothing changed.",
            })
          );
          return;
        }
        analytics.trackEvent('picky_win_share_toggled', { enabled: next });
      });
    },
    [userId, t]
  );

  const mine = state.userId !== null && state.userId === userId;
  return {
    enabled: state.value,
    setEnabled,
    pending: state.pending,
    loaded: mine && state.loaded,
  };
}
