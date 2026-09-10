/**
 * US-840: the seat refusal has to reach the person who hit it.
 *
 * The server gate is the authority (supabase/tests/us840_household_seats.test.sql,
 * verified against Postgres 16). This is the other half: the hook used to
 * return a bare null on any failure and the page turned every one of them into
 * "Couldn't create an invite link", so a Free household hitting the seat wall
 * saw what looked like a bug instead of a paywall.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args),
    from: (table: string) => from(table),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { useHousehold } from './useHousehold';

/** A PostgREST-shaped rejection carrying the RPC's RAISE message. */
const seatRefusal = {
  data: null,
  error: {
    message:
      'This household is on a plan with 1 seat(s) and is full. Upgrade to Family Plus to add more caregivers.',
    code: '23514',
  },
};

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'delete', 'update', 'insert', 'is']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  from.mockReturnValue(builder);
});

describe('US-840: createInviteCode reports why it refused', () => {
  it('passes the seat message through instead of a generic failure', async () => {
    rpc.mockImplementation((fn: string) =>
      fn === 'create_household_invite'
        ? Promise.resolve(seatRefusal)
        : Promise.resolve({ data: null, error: null })
    );

    const { result } = renderHook(() => useHousehold());
    await waitFor(() => expect(result.current.createInviteCode).toBeTypeOf('function'));

    const outcome = await result.current.createInviteCode();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toContain('Family Plus');
    expect(outcome.message).toContain('full');
  });

  it('returns the code when the RPC allows it', async () => {
    rpc.mockImplementation((fn: string) =>
      fn === 'create_household_invite'
        ? Promise.resolve({ data: 'ABCD1234', error: null })
        : Promise.resolve({ data: null, error: null })
    );

    const { result } = renderHook(() => useHousehold());
    await waitFor(() => expect(result.current.createInviteCode).toBeTypeOf('function'));

    const outcome = await result.current.createInviteCode();
    expect(outcome).toEqual({ ok: true, code: 'ABCD1234' });
  });

  it('never shows a raw constraint string, whatever the database says', async () => {
    // US-831's rule still applies: the seat message is written for a person,
    // but an RLS or constraint string arriving on the same path is not.
    rpc.mockImplementation((fn: string) =>
      fn === 'create_household_invite'
        ? Promise.resolve({
            data: null,
            error: { message: 'new row violates row-level security policy for table "household_invite_codes"' },
          })
        : Promise.resolve({ data: null, error: null })
    );

    const { result } = renderHook(() => useHousehold());
    await waitFor(() => expect(result.current.createInviteCode).toBeTypeOf('function'));

    const outcome = await result.current.createInviteCode();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toBe("Couldn't create an invite link.");
    expect(outcome.message).not.toContain('row-level security');
  });
});
