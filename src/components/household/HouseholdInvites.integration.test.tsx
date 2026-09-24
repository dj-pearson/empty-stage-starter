import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { toast } from 'sonner';
import '@/i18n/appLocale';
import { useHousehold } from '@/hooks/useHousehold';
import { HouseholdInvites } from './HouseholdInvites';

/**
 * The real useHousehold wired into the real invite card, the way
 * pages/dashboard/Household.tsx wires them. Only Supabase is stubbed.
 *
 * The unit tests on each side pass on a shared assumption: the card calls
 * createInviteCode('guardian'), and the hook sends { p_role: 'guardian' }.
 * This checks the two agree end to end, and that a revoke through the card
 * reaches household_invite_codes by id and takes the row off the list.
 */

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';
const HOUR = 60 * 60 * 1000;

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'user-1', householdId: HOUSEHOLD_ID }),
}));

type Res = { data: unknown; error: unknown };

let codeRows: Array<Record<string, unknown>> = [];
const deletedIds: string[] = [];
const rpc = vi.fn();

function builder(table: string) {
  let res: Res = { data: [], error: null };
  if (table === 'households') res = { data: { name: 'The Bakers' }, error: null };
  if (table === 'household_members') {
    res = {
      data: [{ id: 'm-1', user_id: 'user-1', role: 'parent', joined_at: '2026-01-05T00:00:00.000Z' }],
      error: null,
    };
  }
  if (table === 'household_invite_codes') res = { data: codeRows, error: null };
  let deleting = false;
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(res).then(resolve, reject),
    maybeSingle: async () => res,
    delete: () => {
      deleting = true;
      return chain;
    },
    eq: (column: string, value: string) => {
      if (deleting && column === 'id') {
        deletedIds.push(value);
        codeRows = codeRows.filter((row) => row.id !== value);
        res = { data: [{ id: value }], error: null };
      }
      return chain;
    },
  };
  for (const m of ['select', 'is', 'gt', 'in', 'order', 'limit']) chain[m] = () => chain;
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: (table: string) => builder(table),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

function Harness() {
  const h = useHousehold();
  return (
    <HouseholdInvites
      householdName={h.householdName}
      inviteCodes={h.inviteCodes}
      loading={h.loading}
      disabled={h.isOffline}
      createInviteCode={h.createInviteCode}
      revokeInviteCode={h.revokeInviteCode}
    />
  );
}

function stubNavigator(key: 'share' | 'canShare' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
}

describe('useHousehold + HouseholdInvites (real integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codeRows = [];
    deletedIds.length = 0;
    stubNavigator('share', undefined);
    stubNavigator('canShare', undefined);
    stubNavigator('clipboard', { writeText: vi.fn().mockResolvedValue(undefined) });
  });

  it('a caregiver invite reaches create_household_invite as p_role guardian', async () => {
    rpc.mockResolvedValue({ data: 'K7M2QP', error: null });
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('radio', { name: /grandparent, nanny or therapist/i }));
    fireEvent.click(screen.getByRole('button', { name: /create and share link/i }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_household_invite', { p_role: 'guardian' }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('a seat-limit refusal from the RPC shows the upgrade path, not a toast', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'This household is on a plan with 2 seat(s) and is full. Upgrade to Family Plus to add more caregivers.',
      },
    });
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /create and share link/i }));

    expect(await screen.findByRole('link', { name: /see plans with more seats/i })).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('revoking through the card deletes that code by id and drops it from the list', async () => {
    codeRows = [
      {
        id: 'inv-1',
        code: 'K7M2QP',
        role: 'parent',
        created_at: new Date(Date.now() - HOUR).toISOString(),
        created_by: 'user-1',
        expires_at: new Date(Date.now() + 5 * HOUR).toISOString(),
        household_id: HOUSEHOLD_ID,
        used_at: null,
        used_by: null,
      },
    ];
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /revoke invite K7M2QP/i }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /revoke link/i }));

    await waitFor(() => expect(deletedIds).toEqual(['inv-1']));
    await waitFor(() => expect(screen.queryByText('K7M2QP')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('Invite revoked.');
  });
});
