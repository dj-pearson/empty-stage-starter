import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import React from 'react';

const mockRpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a) },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import Join from './Join';

function renderAt(search: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/join${search}`]}>
        <Join />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('Join page (US-337)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a valid code and shows success', async () => {
    mockRpc.mockResolvedValue({ data: 'hh-uuid', error: null });
    renderAt('?code=ABC123');

    await waitFor(() => expect(screen.getByText(/you're in/i)).toBeInTheDocument());
    expect(mockRpc).toHaveBeenCalledWith('accept_household_invite', { p_code: 'ABC123' });
  });

  it('shows a friendly error for an invalid/expired code', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Invite code is invalid or expired' } });
    renderAt('?code=NOPE');

    await waitFor(() =>
      expect(screen.getByText(/invalid, expired, or already used/i)).toBeInTheDocument(),
    );
  });

  it('handles a missing code without calling the RPC', async () => {
    renderAt('');
    await waitFor(() => expect(screen.getByText(/no invite code/i)).toBeInTheDocument());
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
