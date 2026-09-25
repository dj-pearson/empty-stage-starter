/**
 * Item 40: the exposure ladder is on by default, and a flag row can still
 * switch it off.
 *
 * evaluate_feature_flag answers false for a missing key, so "on by default"
 * really lives in the seeded row (migration 20260926000002); the client
 * default only covers the case where nothing can be evaluated. What these pin
 * is that every path that CAN read the row obeys it, including the direct
 * table read, which under RLS sees no row at all for a disabled flag.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  rpc: { data: null as unknown, error: null as unknown },
  rpcThrows: false,
  row: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    rpc: async () => {
      if (h.rpcThrows) throw new Error('rpc missing');
      return h.rpc;
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => h.row }),
      }),
    }),
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { useExposureLadderFlag, EXPOSURE_LADDER_DEFAULT } from './useExposureLadderFlag';

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // no storage in this environment
  }
  h.user = { id: 'user-1' };
  h.rpc = { data: null, error: null };
  h.rpcThrows = false;
  h.row = { data: null, error: null };
});

describe('useExposureLadderFlag', () => {
  it('defaults on', () => {
    expect(EXPOSURE_LADDER_DEFAULT).toBe(true);
  });

  it('is on when the seeded row evaluates true', async () => {
    h.rpc = { data: true, error: null };
    const { result } = renderHook(() => useExposureLadderFlag());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is off when the flag row is switched off (RPC path)', async () => {
    h.rpc = { data: false, error: null };
    const { result } = renderHook(() => useExposureLadderFlag());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('is off when the RPC fails and RLS hides the disabled row', async () => {
    h.rpcThrows = true;
    h.row = { data: null, error: null };
    const { result } = renderHook(() => useExposureLadderFlag());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('follows a visible enabled row when the RPC fails', async () => {
    h.rpcThrows = true;
    h.row = { data: { enabled: true, rollout_percentage: 100 }, error: null };
    const { result } = renderHook(() => useExposureLadderFlag());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays on when nothing can be evaluated', async () => {
    h.rpcThrows = true;
    h.row = { data: null, error: { message: 'relation does not exist' } };
    const { result } = renderHook(() => useExposureLadderFlag());
    // Give the effect a turn; the value must not flip off.
    await new Promise((r) => setTimeout(r, 0));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays on when signed out', async () => {
    h.user = null;
    const { result } = renderHook(() => useExposureLadderFlag());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBe(true);
  });
});
