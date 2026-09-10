/**
 * US-835: what sign-out leaves behind in localStorage.
 *
 * US-537 scrubbed `kid-meal-planner` -- the AppContext snapshot -- when the
 * auth listener sees SIGNED_OUT, and nothing else. Fifteen other keys are
 * written under src/, and the ones holding a household's data survived. On a
 * shared family tablet, which is an ordinary setup for this product, the next
 * person to sign in got them:
 *
 *   eatpal_recent_searches          the previous parent's typed searches --
 *                                   food, recipe and child names -- rendered
 *                                   back as "Recent" in the command palette
 *   eatpal.auto_restock_blocklist   pantry items the previous household muted,
 *                                   suppressing suggestions for the new one
 *   eatpal.kid_birthday_dismissed.* keyed by child id
 *   eatpal-budget-calc-draft        household size, child ages, weekly budget
 *
 * This module is the list, so that adding a storage key forces a decision
 * about sign-out rather than defaulting to "it stays". signOutScrub.test.ts
 * scans src/ for key literals and fails on any key that is neither classified
 * here nor scoped to a user id.
 *
 * WHAT DELIBERATELY SURVIVES is in KEPT_KEYS with the reason beside it. Cookie
 * consent, accessibility preferences and the install-prompt dismissal belong
 * to the browser rather than to the account; the rate limiter must survive a
 * sign-out or signing out becomes the way to reset it; and the offline write
 * queue already carries the user id in its key, so it cannot drain into
 * somebody else's household and should still be there when its owner returns.
 */

/** Exact localStorage keys removed when a user signs out. */
export const SCRUBBED_KEYS: readonly string[] = [
  'kid-meal-planner',
  'eatpal_recent_searches',
  'eatpal.auto_restock_added_today',
  'eatpal.auto_restock_blocklist',
  'eatpal_onboarding_completed',
  'eatpal_onboarding_dismissed',
  'onboarding-dismissed',
  'eatpal-budget-calc-draft',
  'eatpal-meal-plan-draft',
  'quiz_email_captured',
  'eatpal_feature_flags',
  'eatpal_admin_feature_flags',
  'blog_webhook_url',
  'eatpal.share_chain_outcomes',
];

/**
 * sessionStorage keys removed when a user signs out.
 *
 * sessionStorage dying with the tab is not the same as dying with the session.
 * Signing out and signing in again in the SAME tab is the common case on a
 * shared device, and these all outlive it: the four *_session_id keys would go
 * on attributing the new person's activity, logins and conversions to the
 * previous person's session, and the Search Console handshake keys carry the
 * previous admin's user id and OAuth state.
 */
export const SCRUBBED_SESSION_KEYS: readonly string[] = [
  'activity_session_id',
  'audit_session_id',
  'eatpal_session_id',
  'login_session_id',
  'eatpal_csrf_token',
  'gsc_connecting',
  'gsc_oauth_code',
  'gsc_oauth_error',
  'gsc_oauth_pending',
  'gsc_oauth_state',
  'gsc_oauth_success',
  'gsc_user_id',
  'oauth_redirect',
  'returnTo',
  'share-target-pending',
  'bind-email-banner-dismissed',
];

/**
 * Key prefixes removed on sign-out. These are written one key per child or per
 * recipe, so the exact names are only knowable at runtime.
 */
export const SCRUBBED_PREFIXES: readonly string[] = [
  'eatpal.kid_birthday_dismissed',
  'eatpal.seasonal_recall_dismissed',
  'autosave-',
  'frequency-',
  'recent-',
  'prefs-',
];

/** Keys that survive sign-out on purpose, each with the reason it does. */
export const KEPT_KEYS: Readonly<Record<string, string>> = {
  eatpal_cookie_consent: 'consent belongs to the browser; clearing it re-asks every visitor',
  'accessibility-preferences':
    'a person who needs reduced motion or a larger font needs it before they sign in',
  app_install_dismissed: 'dismissing the install prompt is a decision about this device',
  'pwa-install-dismissed': 'legacy install-prompt dismissal, same reasoning',
  eatpal_rate_limits: 'abuse control; clearing it would make sign-out the way to reset a limit',
  'tonightMode.voiceEnabled': 'speech on or off is a property of the device and its speakers',
  eatpal_exit_popup_shown: 'once-per-browser marketing suppression, holds no account data',
  eatpal_sw_disabled:
    'device-level service-worker kill switch that support sets by hand; a sign-out must not undo it',
  'route-error-chunk-reload-at':
    'cooldown that stops a broken deploy reload-looping the browser, and is about the build rather than the account',
};

/** Key prefixes that survive sign-out on purpose. */
export const KEPT_PREFIXES: Readonly<Record<string, string>> = {
  'eatpal.web.syncQueue.':
    'already scoped to a user id (webQueueKey), so it cannot replay into another account; its owner still wants it on their next sign-in',
  __storage_test__: 'availability probe, written and removed in the same statement',
  __test__: 'availability probe in env-utils and browser-utils, removed in the same statement',
};

export interface ScrubStorage {
  keys(): string[];
  removeItem(key: string): void;
}

/**
 * localStorage behind the interface above, guarded the same way webSyncQueue
 * guards its accessors: a private window or a browser set to block storage
 * throws on access, and a sign-out must not fail because of it.
 */
export function browserScrubStorage(which: 'local' | 'session' = 'local'): ScrubStorage {
  const target = () => (which === 'local' ? localStorage : sessionStorage);
  return {
    keys() {
      try {
        const store = target();
        const out: string[] = [];
        // length + key(i), not Object.keys(storage). Object.keys happens to
        // work in browsers and is not the interface Storage documents; the
        // enumeration below is what every implementation guarantees.
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i);
          if (key !== null) out.push(key);
        }
        return out;
      } catch {
        return [];
      }
    },
    removeItem(key: string) {
      try {
        target().removeItem(key);
      } catch {
        /* nothing to do */
      }
    },
  };
}

/** Pure: which of `existing` this module says to remove from localStorage. */
export function keysToScrub(existing: readonly string[]): string[] {
  return existing.filter(
    (key) =>
      SCRUBBED_KEYS.includes(key) || SCRUBBED_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

/** Pure: which of `existing` this module says to remove from sessionStorage. */
export function sessionKeysToScrub(existing: readonly string[]): string[] {
  return existing.filter((key) => SCRUBBED_SESSION_KEYS.includes(key));
}

/**
 * Remove every scrubbed key present in `storage`. Called from the SIGNED_OUT
 * branch of the auth listener in AppContext. Never throws.
 */
export function scrubOnSignOut(
  storage: ScrubStorage = browserScrubStorage('local'),
  sessionStorageAdapter: ScrubStorage = browserScrubStorage('session')
): string[] {
  const local = keysToScrub(storage.keys());
  const session = sessionKeysToScrub(sessionStorageAdapter.keys());
  for (const key of local) storage.removeItem(key);
  for (const key of session) sessionStorageAdapter.removeItem(key);
  return [...local, ...session];
}
