import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The share extension spends the user's own token, and only the short-lived
 * one (US-807).
 *
 * `parse-recipe` started requiring a real user in July 2026, and the share
 * extension had no Supabase client to be one with -- supabase-swift is too
 * heavy for its memory budget, and the session lives in the main app's
 * keychain. So it sent the anon key as its bearer and every share import
 * answered 401. The fix publishes the access token into the App Group for the
 * extension to read.
 *
 * That makes an App Group container hold a live bearer token, which is a
 * reasonable trade only while the specific shape of it holds. Each of the
 * regressions below is silent -- the feature keeps working while the property
 * that made it acceptable is gone:
 *
 *   * the refresh token joining it (long-lived, and refreshing from two
 *     processes rotates it out from under the app)
 *   * the store falling back to standard UserDefaults when the App Group is
 *     missing, putting the token in a second place on disk for nothing
 *   * sign-out no longer clearing it
 *   * the expiry check going away, so a dead token is sent and rejected
 *
 * None of those fail a Swift test, because the happy path is unchanged. This
 * reads the Swift the way `offlineReplayCoverage.test.ts` reads
 * `OfflineStore.swift` -- the web suite is the only place that sees the whole
 * of both trees.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, 'ios', 'EatPal', ...parts), 'utf8');

const STORE = read('Shared', 'SharedAuthToken.swift');
const API = read('Shared', 'RecipeParseAPI.swift');
const AUTH = read('EatPal', 'ViewModels', 'AuthViewModel.swift');

describe('shared auth token contract (US-807)', () => {
  it('shares the access token and nothing else', () => {
    // AC2, and the one that matters most. A refresh token is a long-lived
    // credential; an access token expires in about an hour, which is what
    // makes a copy outside the keychain tolerable.
    const start = STORE.indexOf('public struct SharedAuthToken');
    expect(start, 'SharedAuthToken not found').toBeGreaterThan(-1);
    const fields = STORE.slice(start, STORE.indexOf('\n}', start));

    expect(fields).toContain('public let accessToken: String');
    expect(fields).toContain('public let expiresAt: Date');
    expect(fields, 'the refresh token must never leave the keychain').not.toMatch(
      /refreshToken|refresh_token/i,
    );
    expect(STORE).not.toMatch(/refreshToken|refresh_token/i);
  });

  it('refuses to write anywhere but the App Group', () => {
    // The file says "No group, no write" in its own comment. Nothing enforced
    // it. A `?? .standard` added here would put a live bearer in the app's own
    // defaults, where the extension still could not read it -- all of the cost
    // and none of the benefit.
    expect(STORE).toContain('UserDefaults(suiteName: appGroup)');
    expect(STORE, 'the store fell back to standard UserDefaults').not.toMatch(
      /UserDefaults\(suiteName: appGroup\)\s*\?\?\s*\.?standard|\?\?\s*UserDefaults\.standard/,
    );
  });

  it('treats an expired token as absent rather than sending it', () => {
    // AC3. Sending a dead token gets a 401 the user cannot act on; treating it
    // as absent falls back to the anon branch, which still works while
    // US-806's allowance exists.
    expect(STORE).toContain('func isUsable(at now: Date = Date()) -> Bool');
    expect(STORE).toContain('expiresAt.timeIntervalSince(now) > Self.expiryLeeway');

    const load = STORE.slice(STORE.indexOf('public static func load('));
    expect(load.slice(0, load.indexOf('\n    }'))).toContain('token.isUsable(at: now)');
  });

  it('leaves leeway for a request that takes most of a minute', () => {
    // The parse runs a page fetch and a Claude call and can take 30-45
    // seconds, so a token with seconds left will not survive the request it is
    // about to be attached to.
    expect(STORE).toMatch(/expiryLeeway: TimeInterval = (\d+)/);
    const leeway = Number(STORE.match(/expiryLeeway: TimeInterval = (\d+)/)![1]);
    expect(leeway).toBeGreaterThanOrEqual(30);
  });

  it('publishes on every session change and clears on sign-out', () => {
    // AC1. applySession is the single funnel -- restore on launch, restore
    // failure, signedIn/userUpdated/tokenRefreshed, signedOut, and the
    // bind-email refresh. A sixth path that set state directly would leave the
    // shared copy lagging the one the app is using.
    const start = AUTH.indexOf('private func applySession(');
    expect(start, 'applySession not found').toBeGreaterThan(-1);
    const body = AUTH.slice(start, AUTH.indexOf('\n    }', start));
    expect(body, 'applySession no longer publishes the token').toContain(
      'publishSharedToken(session)',
    );

    // Every session transition goes through it rather than around it.
    expect(AUTH).toContain('case .signedIn, .userUpdated, .tokenRefreshed:');
    const listener = AUTH.slice(
      AUTH.indexOf('private func startListeningForAuthChanges()'),
      AUTH.indexOf('func refreshBindStatus()'),
    );
    const applyCalls = [...listener.matchAll(/self\.applySession\(/g)];
    expect(applyCalls.length, 'a session path stopped going through applySession').toBe(4);

    // Sign-out clears rather than leaving a live bearer readable.
    const publish = AUTH.slice(AUTH.indexOf('private func publishSharedToken('));
    expect(publish.slice(0, publish.indexOf('\n    }'))).toContain(
      'SharedAuthTokenStore.clear()',
    );
  });

  it('spends the user token when there is one and the anon key otherwise', () => {
    // AC3. apikey stays the anon key either way: that header identifies the
    // project, not the caller.
    expect(API).toContain('SharedAuthTokenStore.load()?.accessToken ?? anonKey');
    expect(API).toContain('request.setValue("Bearer \\(bearer)", forHTTPHeaderField: "Authorization")');
    expect(API).toContain('request.setValue(anonKey, forHTTPHeaderField: "apikey")');
  });

  it('tells the user what to do instead of showing a status code', () => {
    // AC4. "error (401)" told them nothing. 403 maps to the same message
    // because it means the same thing to the person holding the phone.
    expect(API).toContain('case 401, 403: return .notSignedIn');
    expect(API).toContain('"Open EatPal and sign in, then share this recipe again."');
    // A rate limit is not an auth problem and must not be reported as one.
    expect(API).toContain('case 429: return .busy');
  });

  it('gives the deep link and the Shortcuts intent the same behaviour', () => {
    // AC5, which holds by construction: all three callers go through
    // RecipeParseAPI rather than building their own request. A fourth caller
    // hand-rolling a URLRequest to parse-recipe is the regression.
    const callers = [
      read('EatPal', 'Utilities', 'DeepLinkHandler.swift'),
      read('EatPal', 'Intents', 'RecipeAppIntents.swift'),
      read('EatPalShare', 'ShareImportView.swift'),
    ];
    for (const source of callers) {
      expect(source).toContain('RecipeParseAPI.parseRecipe(url:');
      expect(source, 'a caller builds its own parse-recipe request').not.toContain(
        'appendingPathComponent("parse-recipe")',
      );
    }
  });
});
