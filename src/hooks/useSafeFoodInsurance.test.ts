/**
 * The Safe Food Insurance hook's read path: the attempts query is bounded to
 * the scoring windows, every scored row comes back (not only the capped
 * alerts), and a read-only caller can skip the backup-suggestion RPC loop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { addIsoDays } from '@/lib/date-utils';

const sb = vi.hoisted(() => ({
  calls: [] as Array<{ method: string; args: unknown[] }>,
  attempts: [] as Array<{ food_id: string; outcome: string; attempted_at: string }>,
  rpc: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = () => {
    const q = {
      select: (...args: unknown[]) => {
        sb.calls.push({ method: 'select', args });
        return q;
      },
      eq: (...args: unknown[]) => {
        sb.calls.push({ method: 'eq', args });
        return q;
      },
      gte: (...args: unknown[]) => {
        sb.calls.push({ method: 'gte', args });
        return q;
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: sb.attempts, error: null }).then(resolve),
    };
    return q;
  };
  return {
    supabase: {
      from: (table: string) => {
        sb.calls.push({ method: 'from', args: [table] });
        return builder();
      },
      rpc: sb.rpc,
    },
  };
});

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { attemptsSinceInstant, useSafeFoodInsurance } from './useSafeFoodInsurance';

const TODAY = '2026-09-24';

/** A staple eaten every time in the baseline and refused lately. */
function slippingPlan(foodId: string) {
  const entries: { recipeId: null; foodId: string; date: string; result: string }[] = [];
  for (let i = 0; i < 5; i++) {
    entries.push({ recipeId: null, foodId, date: addIsoDays(TODAY, -20 - i * 3), result: 'ate' });
    entries.push({ recipeId: null, foodId, date: addIsoDays(TODAY, -1 - i * 2), result: 'refused' });
  }
  return entries;
}

const foods = [
  { id: 'a', name: 'Apples', isSafe: true },
  { id: 'b', name: 'Bagels', isSafe: true },
  { id: 'c', name: 'Cheese', isSafe: true },
];
const planEntries = [...slippingPlan('a'), ...slippingPlan('b'), ...slippingPlan('c')];

beforeEach(() => {
  sb.calls = [];
  sb.attempts = [];
  sb.rpc.mockClear();
  window.localStorage.clear();
});

describe('useSafeFoodInsurance', () => {
  it('bounds the attempts query to the scoring windows', async () => {
    const { result } = renderHook(() =>
      useSafeFoodInsurance({ kidId: 'k1', foods, planEntries: [], today: TODAY, skipBackups: true })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const gte = sb.calls.find((c) => c.method === 'gte');
    expect(gte?.args).toEqual(['attempted_at', attemptsSinceInstant(TODAY)]);
    // Local midnight 42 days back.
    const since = new Date(attemptsSinceInstant(TODAY));
    expect([since.getFullYear(), since.getMonth() + 1, since.getDate()]).toEqual([2026, 8, 13]);
    expect(since.getHours()).toBe(0);
  });

  it('returns every scored row, past the alert cap, and never calls the RPC with skipBackups', async () => {
    const { result } = renderHook(() =>
      useSafeFoodInsurance({ kidId: 'k1', foods, planEntries, today: TODAY, skipBackups: true })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toHaveLength(3);
    expect(result.current.rows.every((r) => r.level !== 'none')).toBe(true);
    expect(result.current.alerts).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 20));
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('still looks up backups for Home when the option is omitted', async () => {
    const { result } = renderHook(() => useSafeFoodInsurance({ kidId: 'k1', foods, planEntries, today: TODAY }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(sb.rpc).toHaveBeenCalledTimes(2));
  });
});
