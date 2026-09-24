import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const shareChainRows = vi.hoisted(() => new Map<string, boolean>());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    // picky_win_preferences (shareChainPref), plus the two lookups a
    // contribution makes: which foods bridge to the target, and their names.
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, value: string) => {
          if (table === 'food_chain_suggestions') {
            return Promise.resolve({ data: [{ source_food_id: 'src1' }], error: null });
          }
          return {
            maybeSingle: async () => ({
              data: shareChainRows.has(value) ? { share_chain_outcomes: shareChainRows.get(value) } : null,
              error: null,
            }),
          };
        },
        in: async () => ({ data: [{ id: 'src1', name: 'Crackers' }], error: null }),
      }),
    }),
  },
}));

import {
  bucketPickiness,
  normalizeChainFoodName,
  deterministicUuid,
  clearChainNetworkTargetsCache,
  contributeChainNetworkSuccess,
  fetchTopChainNetworkTargets,
  filterNetworkTargetsForKid,
  mergeNetworkTargetsByFood,
  wilsonLowerBound,
  recordContributionsFromAttempt,
  type ChainNetworkTarget,
} from './chainNetwork';
import { adoptShareChainUser, loadShareChainPref, resetShareChainPrefForTests } from './shareChainPref';
import type { Food } from '@/types';

function target(over: Partial<ChainNetworkTarget> & { targetFoodKey: string }): ChainNetworkTarget {
  return {
    pickinessBucket: 'high',
    successCount: 8,
    partialCount: 0,
    refusedCount: 2,
    totalCount: 10,
    successRate: 80,
    lastObservedAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

function food(id: string, name: string, allergens: string[] = []): Food {
  return { id, name, allergens } as unknown as Food;
}

describe('bucketPickiness', () => {
  it('returns unknown for null/empty', () => {
    expect(bucketPickiness(null)).toBe('unknown');
    expect(bucketPickiness('')).toBe('unknown');
    expect(bucketPickiness(undefined)).toBe('unknown');
  });

  it('matches direct labels case-insensitively', () => {
    expect(bucketPickiness('LOW')).toBe('low');
    expect(bucketPickiness('Medium')).toBe('medium');
    expect(bucketPickiness('high')).toBe('high');
  });

  it('recognizes friendly synonyms', () => {
    expect(bucketPickiness('not picky')).toBe('low');
    expect(bucketPickiness('Adventurous eater')).toBe('low');
    expect(bucketPickiness('very picky')).toBe('high');
    expect(bucketPickiness('severe ARFID')).toBe('high');
    expect(bucketPickiness('somewhat selective')).toBe('medium');
  });

  it('buckets numeric levels', () => {
    expect(bucketPickiness('2/10')).toBe('low');
    expect(bucketPickiness('5')).toBe('medium');
    expect(bucketPickiness('9 of 10')).toBe('high');
  });

  it('falls back to unknown when nothing matches', () => {
    expect(bucketPickiness('undefined garbage')).toBe('unknown');
  });
});

describe('normalizeChainFoodName', () => {
  it('returns empty for null/undefined', () => {
    expect(normalizeChainFoodName(null)).toBe('');
    expect(normalizeChainFoodName(undefined)).toBe('');
  });

  it('lowercases and trims', () => {
    expect(normalizeChainFoodName('  Mac & Cheese  ')).toBe('mac & cheese');
  });

  it("strips a leading 'the '", () => {
    expect(normalizeChainFoodName('The Best Mac')).toBe('best mac');
  });

  it('removes trivial punctuation', () => {
    expect(normalizeChainFoodName("Annie's Macaroni & Cheese!")).toBe('annies macaroni & cheese');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeChainFoodName('apple    sauce')).toBe('apple sauce');
  });

  it("matches the server's normalization for common variants", () => {
    // These are the cases the server-side normalize_chain_food_name handles;
    // the client mirror exists to predict aggregation grouping for UI.
    expect(normalizeChainFoodName('Cheez-Its')).toBe('cheez-its');
    expect(normalizeChainFoodName("'Cheese cubes'")).toBe('cheese cubes');
  });
});

describe('deterministicUuid', () => {
  it('returns the same UUID for the same input', () => {
    const a = deterministicUuid('attempt-123:source-a');
    const b = deterministicUuid('attempt-123:source-a');
    expect(a).toBe(b);
  });

  it('returns different UUIDs for different inputs', () => {
    const a = deterministicUuid('attempt-123:source-a');
    const b = deterministicUuid('attempt-123:source-b');
    expect(a).not.toBe(b);
  });

  it('matches the canonical UUID shape (8-4-4-4-12)', () => {
    const u = deterministicUuid('test');
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('filterNetworkTargetsForKid', () => {
  const foods = [
    food('f1', 'Peanut butter toast', []),
    food('f2', 'Almond milk', []),
    food('f3', 'Buttered pasta', []),
  ];
  const targets = [
    target({ targetFoodKey: 'peanut butter toast' }),
    target({ targetFoodKey: 'almond milk' }),
    target({ targetFoodKey: 'buttered pasta' }),
  ];

  it("hides 'peanut butter toast' for a peanuts kid, even with no tags", () => {
    const r = filterNetworkTargetsForKid(targets, { allergens: ['peanuts'] }, foods);
    expect(r.visible.map((t) => t.targetFoodKey)).toEqual(['almond milk', 'buttered pasta']);
    expect(r.hiddenCount).toBe(1);
    expect(r.allergiesUnknown).toBe(false);
  });

  it("hides 'almond milk' for a tree nuts kid", () => {
    const r = filterNetworkTargetsForKid(targets, { allergens: ['tree nuts'] }, foods);
    expect(r.visible.map((t) => t.targetFoodKey)).not.toContain('almond milk');
    expect(r.hiddenCount).toBe(1);
  });

  it('hides an unresolved name for a kid with allergens: unknown is not safe', () => {
    const r = filterNetworkTargetsForKid(
      [target({ targetFoodKey: 'mystery bites' })],
      { allergens: ['sesame'] },
      foods
    );
    expect(r.visible).toEqual([]);
    expect(r.hiddenCount).toBe(1);
  });

  it('keeps an unresolved name for a kid with no allergens', () => {
    const r = filterNetworkTargetsForKid(
      [target({ targetFoodKey: 'mystery bites' })],
      { allergens: [] },
      foods
    );
    expect(r.visible.map((t) => t.targetFoodKey)).toEqual(['mystery bites']);
    expect(r.hiddenCount).toBe(0);
  });

  it('shows nothing and flags it when the allergy list was never set', () => {
    const r = filterNetworkTargetsForKid(targets, { allergens: undefined }, foods);
    expect(r.visible).toEqual([]);
    expect(r.allergiesUnknown).toBe(true);
  });
});

describe('mergeNetworkTargetsByFood', () => {
  it("folds the 'unknown' bucket row into the kid's bucket row", () => {
    const merged = mergeNetworkTargetsByFood(
      [
        target({
          targetFoodKey: 'fish sticks',
          pickinessBucket: 'high',
          successCount: 6,
          refusedCount: 4,
          totalCount: 10,
        }),
        target({
          targetFoodKey: 'fish sticks',
          pickinessBucket: 'unknown',
          successCount: 4,
          refusedCount: 0,
          totalCount: 5,
        }),
      ],
      'high'
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      targetFoodKey: 'fish sticks',
      pickinessBucket: 'high',
      successCount: 10,
      refusedCount: 4,
      totalCount: 15,
    });
    expect(merged[0].successRate).toBeCloseTo(66.7, 1);
  });

  it('ranks 18/20 above 4/5 by Wilson lower bound', () => {
    const merged = mergeNetworkTargetsByFood(
      [
        target({ targetFoodKey: 'small', successCount: 4, totalCount: 5, successRate: 80 }),
        target({ targetFoodKey: 'big', successCount: 18, totalCount: 20, successRate: 90 }),
      ],
      'high'
    );
    expect(merged.map((t) => t.targetFoodKey)).toEqual(['big', 'small']);
    expect(wilsonLowerBound(18, 20)).toBeGreaterThan(wilsonLowerBound(4, 5));
  });
});

describe('contributeChainNetworkSuccess', () => {
  beforeEach(() => rpc.mockReset());

  it('converts a non-UUID key to a deterministic UUID before the rpc', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await contributeChainNetworkSuccess({
      contributionKey: 'ladder:row-1',
      sourceFoodName: 'Pasta',
      targetFoodName: 'Buttered pasta',
      pickinessBucket: 'high',
      outcome: 'success',
    });
    expect(rpc).toHaveBeenCalledWith(
      'contribute_chain_network',
      expect.objectContaining({ p_contribution_key: deterministicUuid('ladder:row-1') })
    );
  });

  it('passes a real UUID through unchanged', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const key = '123e4567-e89b-12d3-a456-426614174000';
    await contributeChainNetworkSuccess({
      contributionKey: key,
      sourceFoodName: 'Pasta',
      targetFoodName: 'Buttered pasta',
      pickinessBucket: 'high',
      outcome: 'success',
    });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_contribution_key: key });
  });
});

describe('fetchTopChainNetworkTargets', () => {
  beforeEach(() => {
    rpc.mockReset();
    clearChainNetworkTargetsCache();
  });

  const raw = {
    target_food_key: 'buttered pasta',
    pickiness_bucket: 'high',
    success_count: 9,
    partial_count: 0,
    refused_count: 1,
    total_count: 10,
    success_rate: '90.0',
    last_observed_at: '2026-09-01T00:00:00Z',
  };

  it('dedupes concurrent calls and caches the result', async () => {
    let resolve: (v: unknown) => void = () => {};
    rpc.mockReturnValue(new Promise((r) => (resolve = r)));
    const a = fetchTopChainNetworkTargets('Plain Pasta', 'high', 25);
    const b = fetchTopChainNetworkTargets('plain pasta', 'high', 25);
    resolve({ data: [raw], error: null });
    const [ra, rb] = await Promise.all([a, b]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(ra).toEqual(rb);
    expect(ra.ok && ra.rows[0].successRate).toBe(90);

    await fetchTopChainNetworkTargets('plain pasta', 'high', 25);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('reports a failed read as ok:false and does not cache it', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await fetchTopChainNetworkTargets('pasta', 'high', 25)).toEqual({ ok: false });
    rpc.mockResolvedValueOnce({ data: [raw], error: null });
    const again = await fetchTopChainNetworkTargets('pasta', 'high', 25);
    expect(again.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe('recordContributionsFromAttempt opt-in', () => {
  beforeEach(() => {
    rpc.mockReset();
    resetShareChainPrefForTests();
    localStorage.clear();
  });

  const attempt = { id: 'a1', food_id: 'f1', outcome: 'success', kid_id: null };

  it('contributes nothing while the preference has not loaded', async () => {
    localStorage.setItem('eatpal.share_chain_outcomes', JSON.stringify({ u: 'u1', v: true }));
    adoptShareChainUser('u1');
    expect(await recordContributionsFromAttempt(attempt, { pickinessLevel: null, foodName: 'Toast' })).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('contributes nothing when the loaded value is false', async () => {
    shareChainRows.set('u1', false);
    await loadShareChainPref('u1');
    expect(await recordContributionsFromAttempt(attempt, { pickinessLevel: null, foodName: 'Toast' })).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('contributes once the server says yes (instrument check)', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    shareChainRows.set('u1', true);
    await loadShareChainPref('u1');
    await recordContributionsFromAttempt(attempt, { pickinessLevel: null, foodName: 'Toast' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
