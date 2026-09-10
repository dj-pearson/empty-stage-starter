import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Everything the iOS app puts in the shared App Group container has to be
 * dropped when the account signs out.
 *
 * The App Group is how the main app talks to its extensions, and none of the
 * readers check a session -- they cannot, they have no Supabase client. The
 * home-screen and Lock Screen widget renders whatever is under `widget_*`, and
 * the watch complication renders whatever is under the watch snapshot key. So
 * a sign-out that only cleared AppState and the SwiftData cache left the
 * previous household's dinner, meal slots, grocery count and try-bite streak
 * on the home screen indefinitely, visible on the Lock Screen without
 * unlocking.
 *
 * `SharedAuthTokenStore` was already handled (AuthViewModel clears it from the
 * auth listener) and is asserted here so it stays that way -- of the three,
 * a live bearer token outliving its session is the worst.
 *
 * Source-contract assertions: there is no Swift runtime in this repo's test
 * environment.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

const APP_STATE = read('ios/EatPal/EatPal/App/AppState.swift');
const WIDGET_SNAPSHOT = read('ios/EatPal/EatPal/Services/WidgetSnapshot.swift');
const WATCH_SNAPSHOT = read('ios/EatPal/Shared/WatchSnapshot.swift');
const WATCH_SERVICE = read('ios/EatPal/EatPal/Services/WatchConnectivityService.swift');
const AUTH_VIEW_MODEL = read('ios/EatPal/EatPal/ViewModels/AuthViewModel.swift');
const SETTINGS = read('ios/EatPal/EatPal/Views/Settings/SettingsView.swift');
const WIDGET = read('ios/EatPal/EatPalWidget/EatPalWidget.swift');

/** The body of `AppState.clearData()`. */
const clearData = (() => {
  const start = APP_STATE.indexOf('func clearData() {');
  expect(start, 'AppState.clearData() not found').toBeGreaterThan(-1);
  return APP_STATE.slice(start, APP_STATE.indexOf('\n    }', start));
})();

describe('App Group teardown on sign-out', () => {
  it('is worth checking: the widget reads the App Group with no session check', () => {
    // Floor. If the widget ever grows its own auth, these assertions stop
    // being the thing that protects the user.
    expect(WIDGET).toContain('UserDefaults(suiteName: "group.com.eatpal.app")');
    expect(WIDGET).toContain('widget_meals');
  });

  it('clears the widget snapshot', () => {
    expect(clearData).toContain('WidgetSnapshot.clear()');
    expect(WIDGET_SNAPSHOT).toContain('static func clear() {');
  });

  it('clears the watch snapshot and tells the watch', () => {
    expect(clearData).toContain('WatchConnectivityService.shared.clearForSignOut()');
    expect(WATCH_SNAPSHOT).toContain('static func clear() {');
    expect(WATCH_SERVICE).toContain('WatchSnapshotStore.clear()');
    // A watch that is out of range still has to get the clear, so it goes
    // through the queued transfer rather than a live send.
    const clearForSignOut = WATCH_SERVICE.slice(
      WATCH_SERVICE.indexOf('func clearForSignOut() {'),
    ).slice(0, 900);
    expect(clearForSignOut).toContain('transferUserInfo');
    expect(clearForSignOut).toContain('WatchSnapshot.empty');
  });

  it('cancels the debounced writes before clearing', () => {
    // Sign-out deletes rows, which schedules a debounced snapshot write. Clear
    // without cancelling and that timer fires afterwards and restores exactly
    // what was just wiped.
    for (const [name, source, fn] of [
      ['WidgetSnapshot', WIDGET_SNAPSHOT, 'static func clear() {'],
      ['WatchConnectivityService', WATCH_SERVICE, 'func clearForSignOut() {'],
    ] as const) {
      const body = source.slice(source.indexOf(fn)).slice(0, 400);
      expect(body, `${name} does not cancel its pending write`).toContain(
        'pendingWorkItem?.cancel()',
      );
    }
  });

  it('still clears the shared auth token', () => {
    expect(AUTH_VIEW_MODEL).toContain('SharedAuthTokenStore.clear()');
  });

  it('covers account deletion, not just sign-out', () => {
    // Both paths funnel through clearData(), so the App Group teardown is one
    // change rather than two -- but only while that stays true.
    expect(SETTINGS).toContain('appState.clearData()');
  });
});
