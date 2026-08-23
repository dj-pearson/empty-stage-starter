import { describe, it, expect } from 'vitest';
import { validateSnapshot } from '../../scripts/prerender.mjs';

/**
 * US-570: what makes a prerendered snapshot fit to ship.
 *
 * These checks used to be four inline `if`s inside the browser-driving route
 * function, which meant the only way to exercise them was to run a build and
 * hope the bad case turned up. It does turn up: sampling one dist repeatedly,
 * the homepage shipped with no app-rendered structured data in 1 run of 6, exit
 * 0, because the ld+json count was reported in the build log and never
 * asserted on.
 *
 * The count that matters is the Helmet-managed one. index.html carries a static
 * Organization/WebSite graph of its own, so a total of 1 reads as "has
 * structured data" while meaning the app contributed none -- which is exactly
 * the degraded snapshot, and exactly what a total-only check would wave
 * through.
 */

const OK = {
  title: 'EatPal Pricing',
  description: 'Plans for families and feeding therapists.',
  canonical: 'https://tryeatpal.com/pricing',
  textLength: 3824,
  ldJsonCount: 3,
  helmetLdJsonCount: 2,
};

describe('validateSnapshot', () => {
  it('accepts a healthy snapshot', () => {
    expect(() => validateSnapshot(OK, '/pricing')).not.toThrow();
  });

  it('accepts a trailing slash on the route as the same path', () => {
    expect(() => validateSnapshot(OK, '/pricing/')).not.toThrow();
  });

  it('rejects a snapshot with no title', () => {
    expect(() => validateSnapshot({ ...OK, title: '' }, '/pricing')).toThrow(/no <title>/);
  });

  it('rejects a snapshot with no meta description', () => {
    expect(() => validateSnapshot({ ...OK, description: '' }, '/pricing')).toThrow(
      /no meta description/
    );
  });

  it('rejects a snapshot with no canonical', () => {
    expect(() => validateSnapshot({ ...OK, canonical: '' }, '/pricing')).toThrow(/no canonical/);
  });

  it('rejects a body too short to be a rendered page', () => {
    expect(() => validateSnapshot({ ...OK, textLength: 42 }, '/pricing')).toThrow(/only 42 chars/);
  });

  it('rejects a snapshot whose only structured data is the static shell graph', () => {
    // The real failure: 1 total, 0 Helmet-managed. A total-count check passes.
    expect(() =>
      validateSnapshot({ ...OK, ldJsonCount: 1, helmetLdJsonCount: 0 }, '/pricing')
    ).toThrow(/no app-rendered structured data/);
  });

  it('names the total in that message, so the log says what was there', () => {
    expect(() =>
      validateSnapshot({ ...OK, ldJsonCount: 1, helmetLdJsonCount: 0 }, '/pricing')
    ).toThrow(/1 ld\+json block/);
  });

  it('accepts a single Helmet-managed block', () => {
    // Ten of the sixteen routes have exactly one; the floor is one, not two.
    expect(() =>
      validateSnapshot({ ...OK, ldJsonCount: 2, helmetLdJsonCount: 1 }, '/pricing')
    ).not.toThrow();
  });

  it('rejects a canonical pointing at a different route', () => {
    // An error state inherits index.html's homepage canonical, and the other
    // checks are all satisfied by it -- a not-found page frozen and served as a
    // 200 is the failure this catches.
    expect(() =>
      validateSnapshot({ ...OK, canonical: 'https://tryeatpal.com/' }, '/pricing')
    ).toThrow(/canonical points at \/ but this is \/pricing/);
  });

  it('rejects an unparseable canonical rather than letting URL throw', () => {
    // Harder to reach than it looks, and the first fixture here was wrong:
    // new URL(x, base) resolves almost any junk as a relative path, so
    // 'ht tp://%%%' becomes /ht%20tp://%%% and trips the route-mismatch check
    // instead. It takes a malformed AUTHORITY to make the parser give up.
    expect(() => validateSnapshot({ ...OK, canonical: 'https://[:::]/x' }, '/pricing')).toThrow(
      /unparseable canonical/
    );
  });
});
