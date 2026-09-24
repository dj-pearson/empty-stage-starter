/**
 * KidsContext write contract for the Kids page rework.
 *
 * updateKid builds the optimistic merge and the PATCH body from one object
 * with undefined keys stripped, so what the screen shows is what was sent,
 * and it resolves to whether the server accepted it. addKid passes a null
 * allergen list through: null is "not sure yet", and the column default only
 * applies when the key is absent.
 */
import { act, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const updateBodies: unknown[] = [];
const insertBodies: unknown[] = [];
let updateError: unknown = null;

vi.mock('@/integrations/supabase/client', () => {
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    builder.update = vi.fn((body: unknown) => {
      updateBodies.push(body);
      return {
        eq: vi.fn(() => Promise.resolve({ data: null, error: updateError })),
      };
    });
    builder.insert = vi.fn((rows: Array<Record<string, unknown>>) => {
      insertBodies.push(rows);
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'new-kid', ...rows[0] }, error: null }),
        }),
      };
    });
    return builder;
  });
  return {
    supabase: {
      from,
      channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ userId: 'user-1', householdId: 'hh-1' }),
}));
vi.mock('@/lib/featureLimits', () => ({
  checkFeatureLimit: vi.fn(() => Promise.resolve({ allowed: true })),
  isPlanLimitError: vi.fn(() => false),
}));
vi.mock('@/lib/supabaseAuthError', () => ({
  handleSupabaseAuthError: vi.fn(() => Promise.resolve('not-auth-error')),
}));
vi.mock('@/lib/trackActivation', () => ({ trackActivationOnce: vi.fn() }));
vi.mock('@/lib/storageCleanup', () => ({ deleteStorageObject: vi.fn() }));
vi.mock('@/hooks/useRealtimeSubscription', () => ({
  registerSubscription: vi.fn(),
  unregisterSubscription: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { KidsProvider, useKids } from './KidsContext';
import type { Kid } from '@/types';

type Api = ReturnType<typeof useKids>;

function setup(initial: Kid[]) {
  const ref: { current: Api | null } = { current: null };
  function Probe() {
    const api = useKids();
    ref.current = api;
    const seeded = React.useRef(false);
    React.useEffect(() => {
      if (seeded.current) return;
      seeded.current = true;
      api.setKids(initial);
    }, [api]);
    return null;
  }
  render(
    <KidsProvider>
      <Probe />
    </KidsProvider>,
  );
  return ref;
}

const sam = (): Kid => ({ id: 'k1', name: 'Sam', allergens: ['peanut'], notes: 'likes crunchy' });

describe('KidsContext.updateKid', () => {
  beforeEach(() => {
    updateBodies.length = 0;
    insertBodies.length = 0;
    updateError = null;
  });

  it('sends only the defined keys and applies the same patch locally', async () => {
    const api = setup([sam()]);
    await waitFor(() => expect(api.current?.kids).toHaveLength(1));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await api.current!.updateKid('k1', { allergens: [], notes: undefined });
    });

    expect(ok).toBe(true);
    expect(updateBodies).toEqual([{ allergens: [] }]);
    const kid = api.current!.kids[0];
    expect(kid.allergens).toEqual([]);
    expect(kid.notes).toBe('likes crunchy');
  });

  it('sends the intake columns added in item 25 and applies them locally', async () => {
    const api = setup([sam()]);
    await waitFor(() => expect(api.current?.kids).toHaveLength(1));

    await act(async () => {
      await api.current!.updateKid('k1', {
        name: 'Sammy',
        texture_sensitivity_level: 'strong',
        pickiness_level: 'very_picky',
        preferred_preparations: ['Only cold foods'],
      });
    });

    expect(updateBodies).toEqual([{
      name: 'Sammy',
      texture_sensitivity_level: 'strong',
      pickiness_level: 'very_picky',
      preferred_preparations: ['Only cold foods'],
    }]);
    const kid = api.current!.kids[0];
    expect(kid.pickiness_level).toBe('very_picky');
    expect(kid.texture_sensitivity_level).toBe('strong');
    expect(kid.preferred_preparations).toEqual(['Only cold foods']);
  });

  it('sends null to clear an intake column', async () => {
    const api = setup([sam()]);
    await waitFor(() => expect(api.current?.kids).toHaveLength(1));

    await act(async () => {
      await api.current!.updateKid('k1', { pickiness_level: null });
    });

    expect(updateBodies).toEqual([{ pickiness_level: null }]);
  });

  it('resolves false and rolls back when the server rejects the patch', async () => {
    updateError = { message: 'nope', code: 'XX000' };
    const api = setup([sam()]);
    await waitFor(() => expect(api.current?.kids).toHaveLength(1));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await api.current!.updateKid('k1', { allergens: [] });
    });

    expect(ok).toBe(false);
    await waitFor(() => expect(api.current!.kids[0].allergens).toEqual(['peanut']));
  });
});

describe('KidsContext.addKid', () => {
  beforeEach(() => {
    insertBodies.length = 0;
  });

  it('inserts allergens: null as null and keeps it unknown locally', async () => {
    const api = setup([]);
    await waitFor(() => expect(api.current).not.toBeNull());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await api.current!.addKid({ name: 'Leo', allergens: null });
    });

    expect(ok).toBe(true);
    const row = (insertBodies[0] as Array<Record<string, unknown>>)[0];
    expect('allergens' in row).toBe(true);
    expect(row.allergens).toBeNull();
    const leo = api.current!.kids.find((k) => k.name === 'Leo');
    expect(leo).toBeDefined();
    expect(leo!.allergens).toBeUndefined();
  });
});
