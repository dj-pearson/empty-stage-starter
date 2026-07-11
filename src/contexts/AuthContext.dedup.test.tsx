/**
 * US-539: household resolution must happen once per uid on startup.
 *
 * Both getSession() and the onAuthStateChange INITIAL_SESSION event fire for
 * the same user on a fresh load. This test drives both paths and asserts the
 * household RPCs run exactly once (no duplicate ensure_user_household, no racing
 * setHouseholdId).
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';

const SESSION = { user: { id: 'user-1' } };
let getHhCalls = 0;
let ensureCalls = 0;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: SESSION } })),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        // Real Supabase emits INITIAL_SESSION right after subscribe — simulate
        // that double-resolve for the same uid alongside getSession().
        cb('INITIAL_SESSION', SESSION);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    rpc: vi.fn((fn: string) => {
      if (fn === 'get_user_household_id') { getHhCalls++; return Promise.resolve({ data: 'hh-1', error: null }); }
      if (fn === 'ensure_user_household') { ensureCalls++; return Promise.resolve({ data: 'hh-1', error: null }); }
      return Promise.resolve({ data: null, error: null });
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

function Probe({ onValue }: { onValue: (hh: string | null) => void }) {
  const { householdId } = useAuth();
  onValue(householdId);
  return null;
}

describe('AuthContext household resolution dedup (US-539)', () => {
  beforeEach(() => {
    getHhCalls = 0;
    ensureCalls = 0;
    vi.clearAllMocks();
  });

  it('resolves the household exactly once for a fresh sign-in', async () => {
    let latest: string | null = null;
    render(
      <AuthProvider>
        <Probe onValue={(hh) => { latest = hh; }} />
      </AuthProvider>
    );

    await waitFor(() => expect(latest).toBe('hh-1'));
    // Both startup paths ran, but the uid guard collapsed them to one lookup.
    expect(getHhCalls).toBe(1);
    expect(ensureCalls).toBe(0);
  });
});
