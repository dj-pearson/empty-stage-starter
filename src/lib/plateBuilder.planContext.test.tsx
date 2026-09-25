/**
 * Meal Builder's save path against the real PlanContext, not a mock of it:
 * planWriteEntries (src/lib) builds the rows, PlanProvider.addPlanEntries
 * sends them, and the Undo in KidMealBuilder deletes by the insertedIds it
 * gets back. Only the Supabase client is faked.
 */
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanProvider, usePlan } from '@/contexts/PlanContext';
import { planWriteEntries } from '@/lib/plateBuilder';

const auth = { userId: 'u1', householdId: 'hh1' };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

const mockFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: vi.fn(),
  },
}));
vi.mock('@/lib/supabaseAuthError', () => ({
  isSupabaseAuthError: () => false,
  handleSupabaseAuthError: vi.fn().mockResolvedValue('not-auth-error'),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useRealtimeSubscription', () => ({ registerSubscription: vi.fn(), unregisterSubscription: vi.fn() }));
vi.mock('@/lib/trackActivation', () => ({ trackActivationOnce: vi.fn() }));

let api: ReturnType<typeof usePlan> | null = null;
function Probe() {
  api = usePlan();
  return null;
}

beforeEach(() => {
  api = null;
  mockFrom.mockReset();
});

describe('Meal Builder save through the real PlanContext', () => {
  it('inserts the plate rows, and Undo removes exactly what was inserted', async () => {
    let sent: Record<string, unknown>[] = [];
    const insert = vi.fn((rows: Record<string, unknown>[]) => {
      sent = rows;
      return {
        select: () =>
          Promise.resolve({ data: rows.map((r, i) => ({ ...r, id: `srv-${i}` })), error: null }),
      };
    });
    const inFn = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({ insert, delete: () => ({ in: inFn }) }));

    render(
      <PlanProvider>
        <Probe />
      </PlanProvider>,
    );
    await waitFor(() => expect(api).not.toBeNull());

    const { entries, skipped } = planWriteEntries(
      'k1',
      '2026-09-24',
      'dinner',
      { safe: 'rice', tryBite: 'peas', gap: 'apple' },
      api!.planEntries,
    );
    expect(skipped).toEqual([]);

    let res: Awaited<ReturnType<NonNullable<typeof api>['addPlanEntries']>> | undefined;
    await act(async () => {
      res = await api!.addPlanEntries(entries);
    });

    expect(res!.error).toBeNull();
    expect(res!.insertedIds).toEqual(['srv-0', 'srv-1', 'srv-2']);
    expect(sent).toHaveLength(3);
    for (const row of sent) {
      expect(row).toMatchObject({ kid_id: 'k1', date: '2026-09-24', user_id: 'u1', household_id: 'hh1', result: null });
    }
    expect(sent.map((r) => [r.food_id, r.meal_slot])).toEqual([
      ['rice', 'dinner'],
      ['peas', 'try_bite'],
      ['apple', 'dinner'],
    ]);
    await waitFor(() => expect(api!.planEntries).toHaveLength(3));

    // Saving the same plate again reads the rows PlanContext now holds and skips them all.
    const again = planWriteEntries('k1', '2026-09-24', 'dinner', { safe: 'rice', tryBite: 'peas', gap: 'apple' }, api!.planEntries);
    expect(again.entries).toEqual([]);
    expect(again.skipped).toEqual(['rice', 'peas', 'apple']);

    await act(async () => {
      await api!.deletePlanEntries(res!.insertedIds);
    });
    expect(inFn).toHaveBeenCalledWith('id', ['srv-0', 'srv-1', 'srv-2']);
    expect(api!.planEntries).toHaveLength(0);
  });
});
