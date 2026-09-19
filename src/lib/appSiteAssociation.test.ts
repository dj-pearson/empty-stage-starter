import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The apple-app-site-association file and the iOS router are one contract split
 * across two languages. Apple reads the JSON to decide which tryeatpal.com URLs
 * to hand to the app instead of Safari; `DeepLinkHandler.handleUniversalLink`
 * decides what the app does with them. When the two disagree the failure is
 * silent and one-directional: a path Apple sends that the handler does not know
 * falls through `default:` and the tap does nothing at all -- worse than the
 * link never having opened the app, because Safari no longer gets it either.
 *
 * These tests read the Swift source directly so the drift fails a `npm run
 * test:run` here rather than in someone's hands.
 */

const SWIFT = readFileSync(
  path.resolve(__dirname, '../../ios/EatPal/EatPal/Utilities/DeepLinkHandler.swift'),
  'utf8',
);

// Read the generator's source rather than importing it: the module writes to
// dist/ when run, and the contract under test is what the file declares, not
// what a particular APPLE_TEAM_ID produces.
const GENERATOR = readFileSync(path.resolve(__dirname, '../../scripts/generate-aasa.mjs'), 'utf8');

/** The path patterns in `export const COMPONENTS`. */
function claimedPatterns(): string[] {
  const start = GENERATOR.indexOf('export const COMPONENTS = [');
  expect(start, 'export const COMPONENTS not found in generate-aasa.mjs').toBeGreaterThan(-1);
  const block = GENERATOR.slice(start, GENERATOR.indexOf('\n];', start));
  return [...block.matchAll(/'\/':\s*'([^']+)'/g)].map((m) => m[1]);
}

/** Case labels inside one Swift function body. */
function caseLabels(functionSignature: string): string[] {
  const start = SWIFT.indexOf(functionSignature);
  expect(start, `${functionSignature} not found in DeepLinkHandler.swift`).toBeGreaterThan(-1);
  const body = SWIFT.slice(start, SWIFT.indexOf('\n    }', start));
  return [...body.matchAll(/case "([^"]+)"/g)].map((m) => m[1]);
}

const dashboardScreens = caseLabels('private func dashboardScreenDestination');
const appScreens = caseLabels('private func appScreenDestination');
const patterns = claimedPatterns();

describe('apple-app-site-association', () => {
  it('claims a non-empty set of paths', () => {
    // Floor: "every claimed path is routable" must not be vacuously true.
    expect(patterns.length).toBeGreaterThanOrEqual(5);
  });

  it('routes every path it claims', () => {
    const unroutable = patterns.filter((pattern) => {
      if (pattern === '/app/*') return !SWIFT.includes('case "app":');
      if (pattern === '/dashboard') return !SWIFT.includes('case "dashboard":');
      if (pattern === '/join') return !SWIFT.includes('case "join":');
      const screen = pattern.replace('/dashboard/', '');
      return !dashboardScreens.includes(screen);
    });
    expect(unroutable).toEqual([]);
  });

  it('claims every /dashboard screen the app can route', () => {
    const unclaimed = dashboardScreens.filter(
      (screen) => !patterns.includes(`/dashboard/${screen}`),
    );
    expect(unclaimed).toEqual([]);
  });

  it('leaves billing in the browser', () => {
    // Stripe checkout lives at /dashboard/billing. The app has no equivalent,
    // so opening it in-app strands someone mid-payment. A `/dashboard/*`
    // wildcard would swallow it, which is why the children are listed one
    // by one.
    expect(patterns).not.toContain('/dashboard/*');
    expect(patterns).not.toContain('/dashboard/billing');
  });

  it('claims /join only while the app routes it', () => {
    // US-851. The rule has not changed, only which side of it /join is on:
    // claiming a path the Swift does not handle turns a working web invite
    // into a tap that does nothing at all, because Safari no longer gets it
    // either.
    if (patterns.includes('/join')) {
      expect(SWIFT, '/join is claimed but DeepLinkHandler does not route it').toContain(
        'case "join":',
      );
      // The code is what makes the link worth opening in-app.
      expect(SWIFT).toContain('HouseholdInviteLink.parseCode(from: url)');
    }
  });

  it('leaves /share to the browser', () => {
    // US-851 AC3 turned out to rest on a wrong premise, and this pins the
    // correction. /share is not a shareable link: it is the PWA share_target
    // action (public/manifest.json), handled by a POST in public/sw.js that
    // stashes the payload in a `share-target-cache` entry and redirects to
    // /share?source=sw INSIDE that browser. Every /share URL that exists
    // carries no payload, and the data it refers to is in a cache the app
    // cannot read. Claiming it would break the web share target on any device
    // with the app installed. iOS has the share extension (US-143) instead.
    expect(patterns.filter((pattern) => pattern.startsWith('/share'))).toEqual([]);
    expect(SWIFT, 'the app started routing /share').not.toContain('case "share":');

    // The premise, verified rather than asserted: the manifest points at it
    // and the service worker answers a POST there.
    const manifest = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../public/manifest.json'), 'utf8'),
    );
    expect(manifest.share_target?.action).toBe('/share');
    expect(manifest.share_target?.method?.toUpperCase?.()).toBe('POST');
  });

  it('keeps the app-only vocabulary in sync with the eatpal:// scheme', () => {
    // /app/<screen> mirrors the custom-scheme hosts. A screen in one and not
    // the other means a widget or push payload built against the wrong name.
    const customSchemeStart = SWIFT.indexOf('private func handleCustomScheme');
    const customScheme = SWIFT.slice(customSchemeStart, SWIFT.indexOf('\n    }', customSchemeStart));
    const hosts = [...customScheme.matchAll(/case "([^"]+)"/g)].map((m) => m[1]);
    // "kid" takes its id from a path component in the universal-link form, so
    // it lives outside appScreenDestination. "recipe" (singular) is the
    // eatpal://recipe/import host, which parses and enqueues rather than
    // navigating -- there is no universal-link equivalent by design.
    const schemeOnly = new Set(['kid', 'recipe']);
    const missing = hosts.filter((h) => !schemeOnly.has(h) && !appScreens.includes(h));
    expect(missing).toEqual([]);
  });
});
