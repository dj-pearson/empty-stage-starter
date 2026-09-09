/**
 * US-841: a withdrawal of analytics consent must stop the trackers that are
 * already running, in this page, without a reload.
 *
 * The asymmetry is the bug. `setConsent(true)` calls `window.__eatpalLoadGA()`
 * and GA starts on that click; `resetConsent()` cleared storage, notified
 * subscribers, and `onConsentChange` had none. GA kept sending and Session
 * Replay kept recording the DOM until the person navigated away.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const replayStop = vi.fn();
type ReplayHandle = { stop: () => void } | undefined;
const getReplay = vi.fn((): ReplayHandle => ({ stop: replayStop }));

vi.mock('@sentry/react', () => ({
  getReplay: () => getReplay(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  GA_MEASUREMENT_ID,
  applyConsentState,
  isWithdrawn,
  startConsentEnforcement,
  stopGoogleAnalytics,
  stopSessionReplay,
} from './consentEnforcement';
import { setConsent, resetConsent, CONSENT_VERSION } from './consent';

const gtag = vi.fn();
const disableKey = `ga-disable-${GA_MEASUREMENT_ID}`;

beforeEach(() => {
  gtag.mockReset();
  replayStop.mockReset();
  getReplay.mockReset().mockReturnValue({ stop: replayStop });
  (window as unknown as Record<string, unknown>).gtag = gtag;
  delete (window as unknown as Record<string, unknown>)[disableKey];
  localStorage.clear();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).gtag;
});

const granted = { analytics: true, timestamp: 'now', version: CONSENT_VERSION };

describe('US-841: what counts as withdrawn', () => {
  it('treats an explicit no, and no decision at all, as do-not-track', () => {
    expect(isWithdrawn(null)).toBe(true);
    expect(isWithdrawn({ ...granted, analytics: false })).toBe(true);
    expect(isWithdrawn(granted)).toBe(false);
  });
});

describe('US-841: stopping Google Analytics', () => {
  it('denies every Consent Mode signal, not only analytics_storage', () => {
    stopGoogleAnalytics();
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });

  it('also sets the gtag.js kill switch, for a tag that already loaded', () => {
    // A tag loaded under a consent that no longer holds is exactly the case
    // Consent Mode alone may not cover, so the flag gtag.js checks per hit is
    // set too.
    stopGoogleAnalytics();
    expect((window as unknown as Record<string, unknown>)[disableKey]).toBe(true);
  });

  it('still sets the kill switch when gtag is missing entirely', () => {
    delete (window as unknown as Record<string, unknown>).gtag;
    expect(() => stopGoogleAnalytics()).not.toThrow();
    expect((window as unknown as Record<string, unknown>)[disableKey]).toBe(true);
  });

  it('uses the same measurement id the shipped loader uses', () => {
    // public/ga-loader.js is a plain-JS file outside the bundle and cannot
    // import this constant, so the two are checked against each other instead
    // of being allowed to drift into a wrong kill-switch key.
    const loader = readFileSync(join(process.cwd(), 'public', 'ga-loader.js'), 'utf8');
    const inLoader = loader.match(/var GA_ID = '([^']+)'/)?.[1];
    expect(inLoader, 'ga-loader.js no longer declares GA_ID the same way').toBeTruthy();
    expect(GA_MEASUREMENT_ID).toBe(inLoader);
  });
});

describe('US-841: stopping Session Replay', () => {
  it('stops the recording', () => {
    stopSessionReplay();
    expect(replayStop).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when replay was never added, which is the common case', () => {
    getReplay.mockReturnValue(undefined);
    expect(() => stopSessionReplay()).not.toThrow();
    expect(replayStop).not.toHaveBeenCalled();
  });

  it('survives a stop() that throws', () => {
    replayStop.mockImplementation(() => {
      throw new Error('replay was never started');
    });
    expect(() => stopSessionReplay()).not.toThrow();
  });
});

describe('US-841: applying a decision', () => {
  it('does nothing when consent is granted', () => {
    applyConsentState(granted);
    expect(gtag).not.toHaveBeenCalled();
    expect(replayStop).not.toHaveBeenCalled();
    expect((window as unknown as Record<string, unknown>)[disableKey]).toBeUndefined();
  });

  it('stops both trackers when it is withdrawn', () => {
    applyConsentState(null);
    expect(gtag).toHaveBeenCalled();
    expect(replayStop).toHaveBeenCalledTimes(1);
  });
});

describe('US-841: the subscription is what makes any of this happen', () => {
  it('resetConsent stops the trackers, in this page', () => {
    const unsubscribe = startConsentEnforcement();
    try {
      setConsent(true);
      expect(replayStop).not.toHaveBeenCalled();

      resetConsent();

      expect(replayStop).toHaveBeenCalledTimes(1);
      expect(gtag).toHaveBeenCalledWith(
        'consent',
        'update',
        expect.objectContaining({ analytics_storage: 'denied' })
      );
      expect((window as unknown as Record<string, unknown>)[disableKey]).toBe(true);
    } finally {
      unsubscribe();
    }
  });

  it('setConsent(false) stops them too, not only a full reset', () => {
    const unsubscribe = startConsentEnforcement();
    try {
      setConsent(false);
      expect(replayStop).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('without the subscription nothing happens, which was the bug', () => {
    // No startConsentEnforcement() here. This is the shipped behaviour before
    // US-841 and the reason the module exists.
    resetConsent();
    expect(replayStop).not.toHaveBeenCalled();
    expect(gtag).not.toHaveBeenCalled();
  });

  it('main.tsx subscribes, and does it before Sentry starts', () => {
    const main = readFileSync(join(process.cwd(), 'src', 'main.tsx'), 'utf8');
    expect(main).toContain('startConsentEnforcement()');
    expect(main.indexOf('startConsentEnforcement()')).toBeLessThan(
      main.indexOf('const initSentryDeferred')
    );
  });
});
