/**
 * US-707: food_added is an activation event, and activation is once per user.
 *
 * The hazard this pins is arithmetic, not plumbing. funnel_events holds one row
 * per visit for the acquisition half; a household adds dozens of foods, so
 * emitting on every add would put "Pantry Started" above "Account Signups" on
 * the dashboard, and a funnel step that exceeds the step above it is a chart
 * nobody trusts twice.
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useEffect } from 'react';

const trackFunnelEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/conversion-tracking', async () => {
  const actual = await vi.importActual<typeof import('@/lib/conversion-tracking')>(
    '@/lib/conversion-tracking',
  );
  return { ...actual, trackFunnelEvent: (...a: unknown[]) => trackFunnelEvent(...a) };
});

let insertResult: { data: unknown; error: unknown } = { data: null, error: null };

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve(insertResult));
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => makeBuilder()),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ userId: 'user-1', householdId: 'house-1' }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(),
    withContext: vi.fn().mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock('@/hooks/useRealtimeSubscription', () => ({
  registerSubscription: vi.fn(),
  unregisterSubscription: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// No plan limit in the way.
vi.mock('@/lib/featureLimits', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/featureLimits');
  return { ...actual, checkFeatureLimit: vi.fn().mockResolvedValue({ allowed: true }) };
});

import { FoodsProvider, useFoods } from './FoodsContext';

type FoodsCtx = ReturnType<typeof useFoods>;

function Probe({ onReady }: { onReady: (ctx: FoodsCtx) => void }) {
  const ctx = useFoods();
  useEffect(() => {
    onReady(ctx);
  }, [ctx, onReady]);
  return null;
}

async function mountFoods(): Promise<FoodsCtx> {
  let ctx!: FoodsCtx;
  render(
    <FoodsProvider>
      <Probe onReady={(c) => { ctx = c; }} />
    </FoodsProvider>,
  );
  await waitFor(() => expect(ctx).toBeTruthy());
  return ctx;
}

const FOOD = { name: 'Oat milk', category: 'dairy' as const, is_safe: true, is_try_bite: false };

beforeEach(() => {
  localStorage.clear();
  trackFunnelEvent.mockClear();
  insertResult = { data: { id: 'f1', ...FOOD }, error: null };
});

describe('food_added', () => {
  it('fires on the first food and never again for that account', async () => {
    const ctx = await mountFoods();

    await ctx.addFood(FOOD);
    await ctx.addFood({ ...FOOD, name: 'Bananas', category: 'fruit' });
    await ctx.addFood({ ...FOOD, name: 'Pasta', category: 'carb' });

    const activation = trackFunnelEvent.mock.calls.filter((c) => c[0] === 'food_added');
    expect(activation).toHaveLength(1);
    expect(activation[0][1]).toEqual({ category: 'dairy' });
  });

  it('does not fire when the server refused the food', async () => {
    // US-717: the row was not saved, so nothing was activated.
    insertResult = { data: null, error: { message: 'row-level security' } };
    const ctx = await mountFoods();

    await ctx.addFood(FOOD);

    expect(trackFunnelEvent.mock.calls.filter((c) => c[0] === 'food_added')).toHaveLength(0);
  });
});
