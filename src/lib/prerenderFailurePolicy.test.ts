import { describe, it, expect } from 'vitest';
import { classifyPrerenderFailures } from '../../scripts/prerender.mjs';

/**
 * US-570: this policy decides whether a prerender failure blocks a deploy, and
 * it is the only part of scripts/prerender.mjs that can be tested without a
 * browser. Before it existed, ANY single route failure failed the build --
 * which meant one flaky row out of a discovered set capped at 500 blog posts
 * plus 2000 pSEO pages could block a Cloudflare Pages deploy of everything
 * else. The opposite mistake is worse: tolerating failures per-route would let
 * an RLS change that breaks every blog read ship as 500 individually-excusable
 * misses. Hence a rate for discovered routes and zero tolerance for curated
 * ones.
 */
describe('classifyPrerenderFailures (US-570)', () => {
  it('passes a clean run', () => {
    expect(
      classifyPrerenderFailures({ staticFailed: 0, dynamicTotal: 100, dynamicFailed: 0 }),
    ).toEqual({ fatal: false, reason: '' });
  });

  it('fails on a single curated route, however healthy the discovered ones are', () => {
    const verdict = classifyPrerenderFailures({
      staticFailed: 1,
      dynamicTotal: 5000,
      dynamicFailed: 0,
    });
    expect(verdict.fatal).toBe(true);
    expect(verdict.reason).toMatch(/curated/);
  });

  it('tolerates a few bad rows out of many discovered routes', () => {
    const verdict = classifyPrerenderFailures({
      staticFailed: 0,
      dynamicTotal: 500,
      dynamicFailed: 3,
    });
    expect(verdict.fatal).toBe(false);
    // Non-fatal still says something: silence here is how an SEO regression
    // rots for a quarter.
    expect(verdict.reason).toMatch(/3\/500/);
  });

  it('fails when the discovered failure rate says the reads themselves are broken', () => {
    const verdict = classifyPrerenderFailures({
      staticFailed: 0,
      dynamicTotal: 500,
      dynamicFailed: 500,
    });
    expect(verdict.fatal).toBe(true);
    expect(verdict.reason).toMatch(/systemic/);
  });

  it('does not let a small discovered set hide a total break', () => {
    // 1 of 1 is a 100% failure rate, not "one tolerable row".
    expect(
      classifyPrerenderFailures({ staticFailed: 0, dynamicTotal: 1, dynamicFailed: 1 }).fatal,
    ).toBe(true);
  });

  it('puts the boundary where the tolerance says it is', () => {
    // 10% exactly is allowed; anything above it is not.
    expect(
      classifyPrerenderFailures({ staticFailed: 0, dynamicTotal: 100, dynamicFailed: 10 }).fatal,
    ).toBe(false);
    expect(
      classifyPrerenderFailures({ staticFailed: 0, dynamicTotal: 100, dynamicFailed: 11 }).fatal,
    ).toBe(true);
  });
});
