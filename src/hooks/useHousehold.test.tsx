/**
 * useHousehold must answer "who is in this household?" honestly: an error is an
 * error, not an empty roster; a 0-row write is a failure, not a success; and the
 * household is the one AuthContext resolved, not whichever membership row an
 * unordered select happened to return.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

type Result = { data: unknown; error: unknown };
interface Call {
  table: string;
  ops: Array<[string, unknown[]]>;
}

const rpc = vi.fn();
const getSession = vi.fn();
const calls: Call[] = [];
let respond: (call: Call) => Result = () => ({ data: [], error: null });

function builderFor(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'delete', 'update', 'insert', 'is', 'gt', 'in', 'maybeSingle']) {
    b[m] = (...args: unknown[]) => {
      call.ops.push([m, args]);
      return b;
    };
  }
  b.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) => {
    try {
      return Promise.resolve(respond(call)).then(resolve, reject);
    } catch (e) {
      return reject(e);
    }
  };
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args),
    from: (table: string) => builderFor(table),
    auth: { getSession: () => getSession() },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let authValue: { userId: string | null; householdId: string | null } = { userId: null, householdId: null };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authValue }));

import { useHousehold } from './useHousehold';

const HH = '11111111-1111-4111-8111-111111111111';
const HH2 = '22222222-2222-4222-8222-222222222222';
const ME = 'user-me';

const has = (call: Call, op: string) => call.ops.some(([m]) => m === op);
const isWrite = (call: Call) => has(call, 'delete') || has(call, 'update');

interface Fixture {
  household?: Result;
  members?: Result;
  codes?: Result;
  profiles?: Result;
  write?: (call: Call) => Result;
}

function setFixture(f: Fixture) {
  respond = (call) => {
    if (isWrite(call)) return f.write ? f.write(call) : { data: [{ id: 'x' }], error: null };
    switch (call.table) {
      case 'households':
        return f.household ?? { data: { name: 'The Parks' }, error: null };
      case 'household_members':
        return f.members ?? { data: [], error: null };
      case 'household_invite_codes':
        return f.codes ?? { data: [], error: null };
      case 'profiles':
        return f.profiles ?? { data: [], error: null };
      default:
        return { data: null, error: null };
    }
  };
}

const roster = [
  // Joined second: not the owner even though its id sorts first.
  { id: 'a-member', user_id: 'user-maria', role: 'parent', joined_at: '2026-02-01T00:00:00Z' },
  { id: 'z-me', user_id: ME, role: 'parent', joined_at: '2026-03-01T00:00:00Z' },
  { id: 'm-owner', user_id: 'user-owner', role: 'parent', joined_at: '2026-01-01T00:00:00Z' },
  { id: 'n-null', user_id: 'user-late', role: 'guardian', joined_at: null },
];

function withAuth(userId: string | null, householdId: string | null) {
  authValue = { userId, householdId };
  return ({ children }: { children: React.ReactNode }) => <>{children}</>;
}

async function renderReady(fixture: Fixture, auth: [string | null, string | null] = [ME, HH]) {
  setFixture(fixture);
  const hook = renderHook(() => useHousehold(), { wrapper: withAuth(auth[0], auth[1]) });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => {
  calls.length = 0;
  rpc.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  respond = () => ({ data: [], error: null });
  authValue = { userId: null, householdId: null };
});

describe('household resolution', () => {
  it('(b) resolves through getSession + get_user_household_id outside an AuthProvider', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: ME } } } });
    rpc.mockResolvedValue({ data: HH, error: null });
    setFixture({ members: { data: [roster[1]], error: null } });

    const { result } = renderHook(() => useHousehold());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(rpc).toHaveBeenCalledWith('get_user_household_id', { _user_id: ME });
    expect(result.current.householdId).toBe(HH);
    expect(result.current.currentUserId).toBe(ME);
    expect(result.current.members).toHaveLength(1);
  });

  it('(b) the AuthContext household wins and no fallback lookup runs', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: ME } } } });
    rpc.mockResolvedValue({ data: HH2, error: null });
    const { result } = await renderReady({ members: { data: [roster[1]], error: null } });

    expect(result.current.householdId).toBe(HH);
    expect(getSession).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    const memberQuery = calls.find((c) => c.table === 'household_members');
    expect(memberQuery?.ops).toContainEqual(['eq', ['household_id', HH]]);
  });

  it('stays loading while AuthContext has a user but no household yet', async () => {
    setFixture({});
    const { result } = renderHook(() => useHousehold(), { wrapper: withAuth(ME, null) });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('loading');
    expect(result.current.loading).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('is signed-out with no session', async () => {
    const { result } = renderHook(() => useHousehold());
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
    expect(result.current.loading).toBe(false);
  });
});

describe('roster', () => {
  it('(a) a roster error is an error, not an empty household', async () => {
    const { result } = await renderReady({
      members: { data: null, error: { message: 'Could not find a relationship between household_members and profiles' } },
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('We could not load your household.');
    expect(result.current.status).not.toBe('ready');
  });

  it('(a) a failed refresh keeps the members already loaded', async () => {
    const fixture: Fixture = { members: { data: roster, error: null } };
    const { result } = await renderReady(fixture);
    expect(result.current.members).toHaveLength(4);

    fixture.members = { data: null, error: { message: 'boom' } };
    setFixture(fixture);
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).not.toBeNull();
    expect(result.current.members).toHaveLength(4);
  });

  it('(c) computes isSelf and isOwner and sorts owner, self, then joined', async () => {
    const { result } = await renderReady({ members: { data: roster, error: null } });
    const ids = result.current.members.map((m) => m.id);
    expect(ids).toEqual(['m-owner', 'z-me', 'a-member', 'n-null']);
    const owner = result.current.members.filter((m) => m.isOwner);
    expect(owner.map((m) => m.id)).toEqual(['m-owner']);
    expect(result.current.members.find((m) => m.isSelf)?.id).toBe('z-me');
    expect(result.current.viewerIsOwner).toBe(false);

    const select = calls.find((c) => c.table === 'household_members')?.ops.find(([m]) => m === 'select');
    expect(select?.[1][0]).toBe('id, user_id, role, joined_at');
  });

  it('(c) breaks a joined_at tie on id', async () => {
    const tied = [
      { id: 'b', user_id: 'u-b', role: 'parent', joined_at: '2026-01-01T00:00:00Z' },
      { id: 'a', user_id: ME, role: 'parent', joined_at: '2026-01-01T00:00:00Z' },
    ];
    const { result } = await renderReady({ members: { data: tied, error: null } });
    expect(result.current.members[0]).toMatchObject({ id: 'a', isOwner: true, isSelf: true });
    expect(result.current.viewerIsOwner).toBe(true);
  });

  it('(d) only the viewer has a readable name; others are null, not an error', async () => {
    const { result } = await renderReady({
      members: { data: roster, error: null },
      profiles: { data: [{ id: ME, full_name: 'Sam' }], error: null },
    });
    expect(result.current.status).toBe('ready');
    const me = result.current.members.find((m) => m.isSelf);
    expect(me?.profiles?.full_name).toBe('Sam');
    for (const m of result.current.members.filter((x) => !x.isSelf)) {
      expect(m.profiles?.full_name ?? null).toBeNull();
    }
  });

  it('(d) a profiles failure still renders the roster', async () => {
    const { result } = await renderReady({
      members: { data: roster, error: null },
      profiles: { data: null, error: { message: 'permission denied for table profiles' } },
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.members).toHaveLength(4);
  });

  it('orders invite codes newest first', async () => {
    await renderReady({ members: { data: [roster[1]], error: null } });
    const codes = calls.find((c) => c.table === 'household_invite_codes');
    expect(codes?.ops).toContainEqual(['order', ['created_at', { ascending: false }]]);
  });
});

describe('mutations', () => {
  it('(e) removeMember with a 0-row delete fails and restores the member', async () => {
    const { result } = await renderReady({
      members: { data: roster, error: null },
      write: () => ({ data: [], error: null }),
    });
    let outcome: Awaited<ReturnType<typeof result.current.removeMember>> | undefined;
    await act(async () => {
      outcome = await result.current.removeMember('a-member');
    });
    expect(outcome?.ok).toBe(false);
    expect(result.current.members.map((m) => m.id)).toContain('a-member');
    const del = calls.find((c) => c.table === 'household_members' && has(c, 'delete'));
    expect(del?.ops).toContainEqual(['select', ['id']]);
  });

  it('removeMember succeeds when a row comes back', async () => {
    const { result } = await renderReady({ members: { data: roster, error: null } });
    let outcome: Awaited<ReturnType<typeof result.current.removeMember>> | undefined;
    await act(async () => {
      outcome = await result.current.removeMember('a-member');
    });
    expect(outcome).toEqual({ ok: true });
    expect(result.current.members.map((m) => m.id)).not.toContain('a-member');
  });

  it('(f) revokeInviteCode with a 0-row delete returns ok:false', async () => {
    const code = { id: 'c1', code: 'ABCD', created_at: '2026-09-01T00:00:00Z' };
    const { result } = await renderReady({
      members: { data: [roster[1]], error: null },
      codes: { data: [code], error: null },
      write: () => ({ data: [], error: null }),
    });
    let outcome: Awaited<ReturnType<typeof result.current.revokeInviteCode>> | undefined;
    await act(async () => {
      outcome = await result.current.revokeInviteCode('c1');
    });
    expect(outcome).toEqual({ ok: false, message: 'That link was already used or has expired.' });
  });

  it('(g) renameHousehold rejects 61 chars without a network call', async () => {
    const { result } = await renderReady({ members: { data: [roster[1]], error: null } });
    const before = calls.length;
    let outcome: Awaited<ReturnType<typeof result.current.renameHousehold>> | undefined;
    await act(async () => {
      outcome = await result.current.renameHousehold('x'.repeat(61));
    });
    expect(outcome?.ok).toBe(false);
    expect(calls.length).toBe(before);
    expect(result.current.householdName).toBe('The Parks');
  });

  it('(g) renameHousehold applies optimistically and rolls back on error', async () => {
    let release: (r: Result) => void = () => {};
    const { result } = await renderReady({
      members: { data: [roster[1]], error: null },
      write: () => new Promise<Result>((r) => (release = r)) as unknown as Result,
    });
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.renameHousehold('  Kitchen Crew  ');
    });
    await waitFor(() => expect(result.current.householdName).toBe('Kitchen Crew'));
    const update = calls.find((c) => c.table === 'households' && has(c, 'update'));
    expect(update?.ops).toContainEqual(['update', [{ name: 'Kitchen Crew' }]]);

    let outcome: unknown;
    await act(async () => {
      release({ data: null, error: { message: 'new row violates row-level security policy' } });
      outcome = await pending;
    });
    expect(outcome).toMatchObject({ ok: false });
    expect(result.current.householdName).toBe('The Parks');
  });

  it('(g) renameHousehold treats a 0-row update as a failure', async () => {
    const { result } = await renderReady({
      members: { data: [roster[1]], error: null },
      write: () => ({ data: [], error: null }),
    });
    let outcome: Awaited<ReturnType<typeof result.current.renameHousehold>> | undefined;
    await act(async () => {
      outcome = await result.current.renameHousehold('New name');
    });
    expect(outcome?.ok).toBe(false);
    expect(result.current.householdName).toBe('The Parks');
  });
});

describe('leaveHousehold', () => {
  it('(h) refuses the sole member', async () => {
    const { result } = await renderReady({ members: { data: [roster[1]], error: null } });
    const outcome = await result.current.leaveHousehold();
    expect(outcome).toEqual({ ok: false, message: 'You are the only member; there is nothing to leave.' });
    expect(calls.some((c) => has(c, 'delete'))).toBe(false);
  });

  it('(h) refuses the owner while others are present', async () => {
    const mine = roster.map((r) => (r.id === 'm-owner' ? { ...r, user_id: ME } : r.id === 'z-me' ? { ...r, user_id: 'u-x' } : r));
    const { result } = await renderReady({ members: { data: mine, error: null } });
    expect(result.current.viewerIsOwner).toBe(true);
    const outcome = await result.current.leaveHousehold();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.message).toContain('Remove the other members');
    expect(calls.some((c) => has(c, 'delete'))).toBe(false);
  });

  it('(h) lets a non-owner leave by deleting only their own row', async () => {
    const { result } = await renderReady({ members: { data: roster, error: null } });
    const outcome = await result.current.leaveHousehold();
    expect(outcome).toEqual({ ok: true });
    const del = calls.find((c) => c.table === 'household_members' && has(c, 'delete'));
    expect(del?.ops).toContainEqual(['eq', ['id', 'z-me']]);
    expect(del?.ops).toContainEqual(['eq', ['user_id', ME]]);
  });

  it('a 0-row leave is a failure', async () => {
    const { result } = await renderReady({
      members: { data: roster, error: null },
      write: () => ({ data: [], error: null }),
    });
    const outcome = await result.current.leaveHousehold();
    expect(outcome.ok).toBe(false);
  });
});

describe('refresh', () => {
  it('(i) a background refresh never sets loading back to true', async () => {
    const { result } = await renderReady({ members: { data: roster, error: null } });
    const seen: boolean[] = [];

    await act(async () => {
      const p = result.current.reload();
      seen.push(result.current.loading);
      await p;
    });
    seen.push(result.current.loading);
    expect(seen.every((v) => v === false)).toBe(true);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.members).toHaveLength(4);
  });

  it('(i) refetches when the tab becomes visible and when back online', async () => {
    const { result } = await renderReady({ members: { data: roster, error: null } });
    const count = () => calls.filter((c) => c.table === 'household_members').length;
    const before = count();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(count()).toBeGreaterThanOrEqual(before + 2));
    expect(result.current.loading).toBe(false);
  });

  it('createInviteCode refreshes in the background, not with loading', async () => {
    rpc.mockResolvedValue({ data: 'ABCD1234', error: null });
    const { result } = await renderReady({ members: { data: roster, error: null } });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.createInviteCode('guardian');
    });
    expect(outcome).toEqual({ ok: true, code: 'ABCD1234' });
    expect(rpc).toHaveBeenCalledWith('create_household_invite', { p_role: 'guardian' });
    expect(result.current.loading).toBe(false);
  });
});
