/**
 * Cookie / tracking consent store (compliance audit 2026-07).
 *
 * Single source of truth for whether the visitor has consented to non-essential
 * (analytics) tracking. Read by:
 *  - `public/ga-loader.js` (plain JS, via `window.__eatpalConsent` + localStorage)
 *  - `src/lib/sentry.tsx` (to gate Session Replay)
 *  - `src/components/CookieConsentBanner.tsx` (the UI)
 *
 * Essential/functional storage (auth session, saved app data) is not covered by
 * this gate — it is strictly necessary for the service and needs no consent.
 */

export const CONSENT_STORAGE_KEY = 'eatpal_cookie_consent';
export const CONSENT_VERSION = 1;

export interface ConsentState {
  /** Analytics + session-replay tracking (Google Analytics, Sentry Replay). */
  analytics: boolean;
  /** ISO timestamp of the decision — recorded to demonstrate consent. */
  timestamp: string;
  /** Policy version the decision was made against. */
  version: number;
}

declare global {
  interface Window {
    __eatpalConsent?: { analytics: boolean };
    __eatpalLoadGA?: () => void;
  }
}

const listeners = new Set<(state: ConsentState | null) => void>();

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** Returns the stored consent decision, or null if the user hasn't decided yet. */
export function getConsent(): ConsentState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (typeof parsed.analytics !== 'boolean') return null;
    return {
      analytics: parsed.analytics,
      timestamp: parsed.timestamp ?? new Date().toISOString(),
      version: parsed.version ?? CONSENT_VERSION,
    };
  } catch {
    return null;
  }
}

/** True only when the user has explicitly granted analytics consent. */
export function hasAnalyticsConsent(): boolean {
  return getConsent()?.analytics === true;
}

/** Mirror the decision onto `window` so the plain-JS GA loader can read it. */
function syncWindow(state: ConsentState | null) {
  if (!isBrowser()) return;
  window.__eatpalConsent = state ? { analytics: state.analytics } : undefined;
}

/**
 * Persist a consent decision, notify subscribers, and — when analytics is
 * granted — kick off the GA loader immediately so tracking can start this visit.
 */
export function setConsent(analytics: boolean): ConsentState {
  const state: ConsentState = {
    analytics,
    timestamp: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  if (isBrowser()) {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable (private mode) — decision still applies in-memory */
    }
    syncWindow(state);
    if (analytics && typeof window.__eatpalLoadGA === 'function') {
      window.__eatpalLoadGA();
    }
  }
  listeners.forEach((fn) => fn(state));
  return state;
}

/**
 * Clear the stored decision so the consent banner is shown again, letting the
 * user change their choice ("Manage cookie preferences"). Does not retroactively
 * unload analytics already loaded this session — a reload applies the new state.
 */
export function resetConsent(): void {
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    syncWindow(null);
  }
  listeners.forEach((fn) => fn(null));
}

/** Subscribe to consent changes. Returns an unsubscribe function. */
export function onConsentChange(fn: (state: ConsentState | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// On module load, mirror any prior decision to `window` for the GA loader.
if (isBrowser()) {
  syncWindow(getConsent());
}
