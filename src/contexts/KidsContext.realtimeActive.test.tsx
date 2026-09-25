/**
 * A realtime DELETE of the selected child (removed on another device) moves
 * the selection the same way deleteKid does: to the first remaining child,
 * or to null when none is left. A dangling id used to crash Insights.
 */
import { act, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

type Handler = (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: unknown; old: unknown }) => void;
const rt = vi.hoisted(() => ({ handler: null as Handler | null }));

vi.mock('@/integrations/supabase/client', () => {
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, cb: Handler) => {
      rt.handler = cb;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  return {
    supabase: {
      from: vi.fn(),
      channel: vi.fn(() => channel),
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

function setup(initial: Kid[], activeId: string | null) {
  const ref: { current: Api | null } = { current: null };
  function Probe() {
    const api = useKids();
    ref.current = api;
    const seeded = React.useRef(false);
    React.useEffect(() => {
      if (seeded.current) return;
      seeded.current = true;
      api.setKids(initial);
      api.setActiveKid(activeId);
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

const sam: Kid = { id: 'k1', name: 'Sam' };
const ada: Kid = { id: 'k2', name: 'Ada' };

const remove = (id: string) =>
  act(() => {
    rt.handler?.({ eventType: 'DELETE', new: {}, old: { id } });
  });

describe('KidsContext realtime keeps the selection valid', () => {
  beforeEach(() => {
    rt.handler = null;
  });

  it('moves the selection to the next child when the active one is deleted elsewhere', async () => {
    const api = setup([sam, ada], 'k1');
    await waitFor(() => expect(api.current?.activeKidId).toBe('k1'));
    expect(rt.handler).not.toBeNull();

    remove('k1');

    await waitFor(() => expect(api.current?.kids.map((k) => k.id)).toEqual(['k2']));
    expect(api.current?.activeKidId).toBe('k2');
  });

  it('falls to null when the last child is deleted elsewhere', async () => {
    const api = setup([sam], 'k1');
    await waitFor(() => expect(api.current?.activeKidId).toBe('k1'));

    remove('k1');

    await waitFor(() => expect(api.current?.kids).toEqual([]));
    expect(api.current?.activeKidId).toBeNull();
  });

  it('leaves the selection alone when another child is deleted', async () => {
    const api = setup([sam, ada], 'k1');
    await waitFor(() => expect(api.current?.activeKidId).toBe('k1'));

    remove('k2');

    await waitFor(() => expect(api.current?.kids.map((k) => k.id)).toEqual(['k1']));
    expect(api.current?.activeKidId).toBe('k1');
  });

  it('leaves family scope (null) alone', async () => {
    const api = setup([sam, ada], null);
    await waitFor(() => expect(api.current?.kids).toHaveLength(2));

    remove('k1');

    await waitFor(() => expect(api.current?.kids.map((k) => k.id)).toEqual(['k2']));
    expect(api.current?.activeKidId).toBeNull();
  });
});
