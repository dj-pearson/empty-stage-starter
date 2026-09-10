import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Coming back to the app after a while has to refetch and reconnect.
 *
 * iOS suspends a backgrounded app, and the WebSocket to Supabase Realtime goes
 * with it. RootView's scenePhase handler refreshed StoreKit entitlements and
 * drained the offline write queue on `.active`, but nothing re-established the
 * realtime channels and nothing refetched. So reopening EatPal after any real
 * absence showed whatever was on screen an hour ago -- and kept showing it,
 * because the live channel meant to correct it was dead too. Force quitting
 * was the only recovery.
 *
 * On a household app the everyday version of that is a partner adding three
 * things to the grocery list and none of them appearing.
 *
 * `loadAllData` ends by calling `RealtimeService.subscribe`, which tears the
 * old channels down first, so one call covers both halves. This suite pins
 * that chain -- if the subscribe call ever moves out of `loadAllData`, the
 * foreground refresh silently stops reconnecting and only the refetch remains.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

const ROOT_VIEW = read('ios/EatPal/EatPal/App/RootView.swift');
const APP_STATE = read('ios/EatPal/EatPal/App/AppState.swift');
const REALTIME = read('ios/EatPal/EatPal/Services/RealtimeService.swift');

const scenePhaseHandler = (() => {
  const start = ROOT_VIEW.indexOf('.onChange(of: scenePhase)');
  expect(start, 'scenePhase handler not found').toBeGreaterThan(-1);
  return ROOT_VIEW.slice(start, ROOT_VIEW.indexOf('\n    /// Refetches', start));
})();

describe('foreground refresh', () => {
  it('records when the app went away', () => {
    expect(scenePhaseHandler).toContain('case .background:');
    expect(scenePhaseHandler).toContain('backgroundedAt = Date()');
  });

  it('refreshes on return', () => {
    expect(scenePhaseHandler).toContain('refreshIfStale()');
    expect(ROOT_VIEW).toContain('appState.loadAllData(showLoadingIndicator: false)');
  });

  it('does not refresh after a glance', () => {
    // A few seconds in Messages does not kill the socket, and refetching
    // eight tables every time the user checks a notification is waste.
    expect(ROOT_VIEW).toContain('staleAfter');
    expect(ROOT_VIEW).toContain('Date().timeIntervalSince(since) >= Self.staleAfter');
  });

  it('does not refresh when signed out', () => {
    const fn = ROOT_VIEW.slice(ROOT_VIEW.indexOf('private func refreshIfStale()'));
    expect(fn.slice(0, 400)).toContain('guard case .authenticated = authViewModel.authState');
  });

  it('reconnects realtime, not just the data', () => {
    // The reconnect rides on loadAllData. If that ever stops being true this
    // fix quietly becomes half a fix.
    const load = APP_STATE.slice(APP_STATE.indexOf('func loadAllData('));
    const body = load.slice(0, load.indexOf('\n    /// US-382: true when the error looks like'));
    expect(body).toContain('realtimeService.subscribe(appState: self)');
    // And subscribe tears the old channels down rather than stacking new ones.
    const subscribe = REALTIME.slice(REALTIME.indexOf('func subscribe(appState: AppState) async {'));
    expect(subscribe.slice(0, 200)).toContain('await unsubscribeAll()');
  });

  it('does not replace the screen with a spinner', () => {
    expect(APP_STATE).toContain('if showLoadingIndicator { isLoading = true }');
  });
});
