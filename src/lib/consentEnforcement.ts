import { loadedSentry } from '@/lib/sentryClient';
import { logger } from '@/lib/logger';
import { onConsentChange, type ConsentState } from '@/lib/consent';

/**
 * US-841: withdrawing consent has to actually stop the tracking.
 *
 * Granting was already instant. `setConsent(true)` calls `window.__eatpalLoadGA()`
 * and Google Analytics starts on that click. Withdrawing did nothing at all:
 * `resetConsent()` cleared localStorage, mirrored the new state onto `window`,
 * notified subscribers -- and `onConsentChange` had no subscribers, anywhere in
 * the tree. Its own docblock said so out loud: "Does not retroactively unload
 * analytics already loaded this session -- a reload applies the new state."
 *
 * So GA went on sending hits and Sentry Session Replay went on recording the
 * DOM, for as long as the person stayed on the page, after they had told the
 * app to stop. GDPR Article 7(3) is explicit that withdrawal must be as easy as
 * granting, and "as easy" cannot mean "and then reload the page", because
 * nothing tells them to.
 *
 * TWO KILL SWITCHES FOR GA, on purpose:
 *
 *   consent update -> denied   Consent Mode v2, the documented path. It is what
 *                              ga-loader.js already speaks, and it is the one
 *                              that is correct.
 *   window['ga-disable-<ID>']  gtag.js checks this flag before every hit. It is
 *                              the fallback for a tag that has already loaded
 *                              and is not honouring the update, which is the
 *                              exact case here -- the tag was loaded under a
 *                              consent that no longer holds.
 *
 * Granting is deliberately NOT handled here. ga-loader.js and setConsent
 * already start GA on opt-in, and Session Replay is decided once at
 * Sentry.init: a visitor who opts in mid-session gets replay from their next
 * visit, which errs toward not recording. Withdrawal is the direction that has
 * to work immediately.
 */

/**
 * The measurement id that actually ships, matching the literal in
 * public/ga-loader.js. consentEnforcement.test.ts asserts the two agree, so
 * this cannot quietly become a second, wrong copy.
 */
export const GA_MEASUREMENT_ID = 'G-H6792J1CQT';

function activeGaId(): string {
  const fromEnv = import.meta.env.VITE_GA_MEASUREMENT_ID;
  return typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : GA_MEASUREMENT_ID;
}

/** True when this state means "do not track me". Absent consent counts. */
export function isWithdrawn(state: ConsentState | null): boolean {
  return state?.analytics !== true;
}

/** Deny every Consent Mode signal and set the gtag.js kill switch. */
export function stopGoogleAnalytics(): void {
  if (typeof window === 'undefined') return;
  try {
    window.gtag?.('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  } catch (error) {
    logger.warn('Could not send a Consent Mode update', error);
  }
  try {
    (window as unknown as Record<string, unknown>)[`ga-disable-${activeGaId()}`] = true;
  } catch {
    /* a frozen window is not a reason to skip the Sentry half below */
  }
}

/** Stop Session Replay if it is running. No-op when replay was never added. */
export function stopSessionReplay(): void {
  try {
    // loadedSentry(), not loadSentry(): withdrawing consent must not DOWNLOAD
    // 126 kB of error-monitoring SDK in order to switch off a recording that,
    // if the SDK never loaded, was never running.
    loadedSentry()?.getReplay()?.stop();
  } catch (error) {
    // Replay's stop() rejects if it was never started; that is the common case
    // for a visitor who never consented, and is not worth a log line each time.
    logger.debug('Session Replay was not running', error);
  }
}

/** Apply a consent decision to the trackers already running in this page. */
export function applyConsentState(state: ConsentState | null): void {
  if (!isWithdrawn(state)) return;
  stopGoogleAnalytics();
  stopSessionReplay();
}

/**
 * Subscribe once, at app start. Returns the unsubscribe so a test can clean up;
 * the app never calls it.
 */
export function startConsentEnforcement(): () => void {
  return onConsentChange(applyConsentState);
}
