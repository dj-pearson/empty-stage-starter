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
  // The Pantry kid lens holds a kid id from the previous household.
  'eatpal.pantry.lensKid',
  // Item 3: the week-start cache names the user it belongs to.
  'eatpal.week_starts_on',
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
  // The Grocery page's caches: list names, the chosen list and the household's
  // store layouts, keyed by user or household id, plus per-store dismissals.
  'grocery:lists:',
  'grocery:selectedList:',
  'grocery:storeLayouts:',
  'grocery.aislePrompt.dismissed.',
  // The AI Coach composer's unsent question, per conversation (and 'draft' for
  // a new one). It is what a parent typed about their child, and the 'draft'
  // key is not user-scoped, so the next account on the device would see it.
  'aiCoach.draft.',
  // Meal Builder's offline plate draft, one per child, date and meal slot. It
  // names a child and the foods chosen for them, and is not user-scoped.
  'mealBuilder:draft:',
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
  'recipe-view':
    'grid or list on the Recipes page is a layout choice for this screen size, not account data',
  'eatpal.pantry.viewMode':
    'list or grid on the Pantry page is a layout choice for this screen size, not account data',
  'eatpal.pantry.sortBy':
    'the Pantry sort order is a viewing preference holding one of a fixed set of option names',
  'eatpal.planner.tryBitesOpen':
    'whether the planner try-bite strip starts open; a yes/no layout choice with no account data in it',
  'eatpal.recipes.plan.addMissing':
    'whether "add missing ingredients" starts ticked when planning a recipe; a yes/no with no account data in it',
  'eatpal.activation.fired':
    'US-707: which activation events each user id has already reported. Holds no account data -- event names and ids -- and clearing it would re-fire food_added and meal_planned on the next sign-in, inflating a funnel step above the signups it is measured against',
};

/** Key prefixes that survive sign-out on purpose. */
export const KEPT_PREFIXES: Readonly<Record<string, string>> = {
  'eatpal.web.syncQueue.':
    'already scoped to a user id (webQueueKey), so it cannot replay into another account; its owner still wants it on their next sign-in',
  'varietyFatigue.dismissedFor.':
    'a yes/no dismissal of the variety nudge, already scoped to a user id, so another account on this browser never reads it',
  'eatpal:billing-upsell-dismissed:':
    'a yes/no dismissal of the home upgrade nudge, already scoped to a user id, so another account on this browser never reads it',
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

/**
 * sessionStorage key prefixes removed on sign-out. The Food Tracker's unsent
 * detail-log draft is keyed per (child, food) and carries reaction notes about
 * a child, which the next person signing in to the same tab must not see.
 */
export const SCRUBBED_SESSION_PREFIXES: readonly string[] = ['eatpal.ladderLogDraft.'];

/** Pure: which of `existing` this module says to remove from sessionStorage. */
export function sessionKeysToScrub(existing: readonly string[]): string[] {
  return existing.filter(
    (key) =>
      SCRUBBED_SESSION_KEYS.includes(key) ||
      SCRUBBED_SESSION_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
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
