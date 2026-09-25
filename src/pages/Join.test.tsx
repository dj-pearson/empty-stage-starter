import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const joinButton = () => screen.getByRole('button', { name: /join household/i });

/**
 * US-337, reworked: accepting an invite can move a parent's kids, recipes and
 * lists into another household and close their old one. It used to happen on
 * page load. These cases pin that nothing is sent until the parent says so.
 */
describe('Join page (US-337)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks before joining, then accepts exactly once on confirm', async () => {
    mockRpc.mockResolvedValue({ data: 'hh-uuid', error: null });
    renderAt('?code=ABC123');

    expect(screen.getByRole('heading', { level: 1, name: /join a household/i })).toBeInTheDocument();
    expect(screen.getByText(/join this household\?/i)).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /not now/i })).toHaveAttribute('href', '/dashboard');
    expect(mockRpc).not.toHaveBeenCalled();

    const button = joinButton();
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/you're in/i)).toBeInTheDocument());
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('accept_household_invite', { p_code: 'ABC123' });
    expect(screen.getByRole('button', { name: /see your household/i })).toBeInTheDocument();
  });

  it('shows a friendly error for an invalid/expired code after confirm', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Invite code is invalid or expired' } });
    renderAt('?code=NOPE12');

    fireEvent.click(joinButton());
    await waitFor(() =>
      expect(screen.getByText(/invalid, expired, or already used/i)).toBeInTheDocument(),
    );
  });

  it('asks for a code when the link has none, and routes it into the confirm step', async () => {
    renderAt('');
    const input = screen.getByLabelText(/invite code/i);
    const submit = screen.getByRole('button', { name: /continue/i });
    expect(submit).toBeDisabled();

    fireEvent.change(input, { target: { value: 'abc12' } });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: ' abc123 ' } });
    expect(input).toHaveValue('ABC123');
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(screen.getByText(/join this household\?/i)).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();

    mockRpc.mockResolvedValue({ data: 'hh-uuid', error: null });
    fireEvent.click(joinButton());
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('accept_household_invite', { p_code: 'ABC123' }),
    );
  });

  it('tells the joiner to ask for an upgrade when the household is full', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'This household is full. Upgrade to Family Plus to add more caregivers.' },
    });
    renderAt('?code=FULL01');

    fireEvent.click(joinButton());
    await waitFor(() =>
      expect(
        screen.getByText(/ask the person who invited you to upgrade, then use the same link again/i),
      ).toBeInTheDocument(),
    );
  });

  it('uses theme tokens, not raw palette colours', async () => {
    mockRpc.mockResolvedValue({ data: 'hh-uuid', error: null });
    const { container } = renderAt('?code=ABC123');
    fireEvent.click(joinButton());
    await waitFor(() => expect(screen.getByText(/you're in/i)).toBeInTheDocument());

    expect(container.querySelector('.text-green-600, .text-yellow-500')).toBeNull();
    for (const icon of container.querySelectorAll('svg')) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }

    const empty = renderAt('');
    expect(empty.container.querySelector('.text-green-600, .text-yellow-500')).toBeNull();
  });
});
