import { describe, it, expect } from 'vitest';
import {
  COMMUNITY_WINS_MIN_SAMPLE_SIZE,
  applyPickyWinKAnonGuard,
  assertNetworkTargetIsAnonymized,
} from './pickyWinGuard';
import type { ChainNetworkTarget } from './chainNetwork';

function target(overrides: Partial<ChainNetworkTarget> & { totalCount: number }): ChainNetworkTarget {
  return {
    targetFoodKey: overrides.targetFoodKey ?? 'broccoli',
    pickinessBucket: overrides.pickinessBucket ?? 'medium',
    successCount: overrides.successCount ?? overrides.totalCount,
    partialCount: overrides.partialCount ?? 0,
    refusedCount: overrides.refusedCount ?? 0,
    totalCount: overrides.totalCount,
    successRate: overrides.successRate ?? 80,
    lastObservedAt: overrides.lastObservedAt ?? '2026-05-19T00:00:00Z',
  };
}

describe('applyPickyWinKAnonGuard', () => {
  it('uses sampleSize=20 as the default k-anon floor (per AC)', () => {
    expect(COMMUNITY_WINS_MIN_SAMPLE_SIZE).toBe(20);
  });

  it('excludes a row with sample_size=19', () => {
    const out = applyPickyWinKAnonGuard([target({ totalCount: 19 })]);
    expect(out).toHaveLength(0);
  });

  it('includes a row with sample_size=20', () => {
    const out = applyPickyWinKAnonGuard([target({ totalCount: 20 })]);
    expect(out).toHaveLength(1);
  });

  it('includes a row with sample_size=21', () => {
    const out = applyPickyWinKAnonGuard([target({ totalCount: 21 })]);
    expect(out).toHaveLength(1);
  });

  it('partitions a mixed list across the threshold', () => {
    const out = applyPickyWinKAnonGuard([
      target({ targetFoodKey: 'a', totalCount: 5 }),
      target({ targetFoodKey: 'b', totalCount: 19 }),
      target({ targetFoodKey: 'c', totalCount: 20 }),
      target({ targetFoodKey: 'd', totalCount: 100 }),
    ]);
    expect(out.map((r) => r.targetFoodKey)).toEqual(['c', 'd']);
  });

  it('honours a lower threshold when explicitly opted-in', () => {
    const out = applyPickyWinKAnonGuard(
      [target({ totalCount: 5 })],
      { minSampleSize: 5 }
    );
    expect(out).toHaveLength(1);
  });

  it('does not mutate the input array', () => {
    const rows = [target({ totalCount: 10 }), target({ totalCount: 30 })];
    const snapshot = JSON.stringify(rows);
    applyPickyWinKAnonGuard(rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

describe('assertNetworkTargetIsAnonymized — privacy invariant', () => {
  it('accepts the canonical ChainNetworkTarget shape', () => {
    expect(() =>
      assertNetworkTargetIsAnonymized([
        target({ totalCount: 20 }) as unknown as Record<string, unknown>,
      ])
    ).not.toThrow();
  });

  it('throws when a row exposes kid_id', () => {
    expect(() =>
      assertNetworkTargetIsAnonymized([
        { targetFoodKey: 'x', totalCount: 20, kid_id: 'leaked' },
      ])
    ).toThrow(/kid_id/i);
  });

  it('throws when a row exposes user_id', () => {
    expect(() =>
      assertNetworkTargetIsAnonymized([
        { targetFoodKey: 'x', totalCount: 20, user_id: 'leaked' },
      ])
    ).toThrow(/user_id/i);
  });

  it('throws when a row exposes household_id (case-insensitive)', () => {
    expect(() =>
      assertNetworkTargetIsAnonymized([
        { targetFoodKey: 'x', totalCount: 20, HouseholdId: 'leaked' },
      ])
    ).toThrow(/household/i);
  });

  it('throws when a row exposes a re-identification proxy (email)', () => {
    expect(() =>
      assertNetworkTargetIsAnonymized([
        { targetFoodKey: 'x', totalCount: 20, contributor_email: 'leaked@x.com' },
      ])
    ).toThrow(/email/i);
  });

  it('also catches camel-cased variants like householdUuid', () => {
    expect(() =>
      assertNetworkTargetIsAnonymized([
        { targetFoodKey: 'x', totalCount: 20, householdUuid: 'leaked' },
      ])
    ).toThrow();
  });
});

// Lock the privacy invariant for the *typed* ChainNetworkTarget shape.
// If a future refactor adds a kid/user/household identifier to the type,
// these tests still pass (since they only inspect runtime shape), but the
// `it.skip` below documents the manual-review checkpoint reviewers should
// run before extending the type. Treat it as an inline tripwire.
describe('ChainNetworkTarget type — manual privacy-review checkpoint', () => {
  it.skip('REVIEW: ChainNetworkTarget should expose no identifier fields', () => {
    // No code — see ./chainNetwork.ts. If you add a new field to the
    // ChainNetworkTarget interface that contains "kid", "user", "household",
    // "email", or "phone", DO NOT remove this test. Get a second reviewer.
  });
});
