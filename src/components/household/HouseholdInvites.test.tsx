import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { toast } from 'sonner';
import '@/i18n/appLocale';
import type { CreateInviteResult, HouseholdInviteCode, MutationResult } from '@/hooks/useHousehold';
import { HouseholdInvites } from './HouseholdInvites';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const HOUR = 60 * 60 * 1000;

function invite(overrides: Partial<HouseholdInviteCode> = {}): HouseholdInviteCode {
  return {
    id: 'inv-1',
    code: 'K7M2QP',
    role: 'parent',
    created_at: new Date(Date.now() - HOUR).toISOString(),
    created_by: 'user-1',
    expires_at: new Date(Date.now() + 5 * HOUR).toISOString(),
    household_id: 'hh-1',
    used_at: null,
    used_by: null,
    ...overrides,
  };
}

function setup(overrides: {
  inviteCodes?: HouseholdInviteCode[];
  create?: CreateInviteResult;
  revoke?: MutationResult;
} = {}) {
  const createInviteCode = vi.fn(async () => overrides.create ?? ({ ok: true, code: 'K7M2QP' } as const));
  const revokeInviteCode = vi.fn(async () => overrides.revoke ?? ({ ok: true } as const));
  const utils = render(
    <MemoryRouter>
      <HouseholdInvites
        householdName="The Bakers"
        inviteCodes={overrides.inviteCodes ?? []}
        loading={false}
        disabled={false}
        createInviteCode={createInviteCode}
        revokeInviteCode={revokeInviteCode}
      />
    </MemoryRouter>,
  );
  return { ...utils, createInviteCode, revokeInviteCode };
}

const createButton = () => screen.getByRole('button', { name: /create and share link/i });

function stubNavigator(key: 'share' | 'canShare' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
}

describe('HouseholdInvites (US-840, package C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubNavigator('share', undefined);
    stubNavigator('canShare', undefined);
    stubNavigator('clipboard', { writeText: vi.fn().mockResolvedValue(undefined) });
  });
  afterEach(() => {
    stubNavigator('share', undefined);
    stubNavigator('canShare', undefined);
  });

  it('says plainly that every member gets the same access', () => {
    setup();
    expect(screen.getByRole('heading', { level: 2, name: /invite someone/i })).toBeInTheDocument();
    expect(
      screen.getByText('Everyone in a household gets the same access to kids, plan, grocery and pantry.'),
    ).toBeInTheDocument();
  });

  it('defaults to a co-parent invite, and a caregiver choice creates a guardian invite', async () => {
    const { createInviteCode } = setup();
    expect(screen.getByRole('radio', { name: /co-parent or partner/i })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: /grandparent, nanny or therapist/i }));
    fireEvent.click(createButton());

    await waitFor(() => expect(createInviteCode).toHaveBeenCalledWith('guardian'));
    expect(createInviteCode).toHaveBeenCalledTimes(1);
  });

  it('opens the share sheet with the join link when the device has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator('share', share);
    setup();

    fireEvent.click(createButton());
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0][0] as { url: string; text: string };
    expect(payload.url).toContain('/join?code=K7M2QP');
    expect(payload.text).toContain('The Bakers');
    expect(payload.text).toContain('K7M2QP');
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('treats a dismissed share sheet as an answer, not an error', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    stubNavigator('share', vi.fn().mockRejectedValue(abort));
    setup();

    fireEvent.click(createButton());
    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('copies the link when there is no share sheet', async () => {
    setup();
    fireEvent.click(createButton());

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/join?code=K7M2QP')),
    );
    expect(toast.success).toHaveBeenCalledWith('Link copied. Paste it in a text to your co-parent.');
  });

  it('ignores a second tap while the first create is in flight', async () => {
    let resolve: (r: CreateInviteResult) => void = () => {};
    const createInviteCode = vi.fn(
      () => new Promise<CreateInviteResult>((r) => { resolve = r; }),
    );
    render(
      <MemoryRouter>
        <HouseholdInvites
          householdName="The Bakers"
          inviteCodes={[]}
          loading={false}
          disabled={false}
          createInviteCode={createInviteCode}
          revokeInviteCode={vi.fn()}
        />
      </MemoryRouter>,
    );
    const button = createButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(createInviteCode).toHaveBeenCalledTimes(1);
    resolve({ ok: true, code: 'K7M2QP' });
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
  });

  it('shows the seat refusal inline with a way to upgrade', async () => {
    const message = 'This household is full. Upgrade to Family Plus to add more caregivers.';
    setup({ create: { ok: false, message } });
    fireEvent.click(createButton());

    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /see plans with more seats/i })).toHaveAttribute(
      'href',
      '/dashboard/billing',
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts every other create failure', async () => {
    setup({ create: { ok: false, message: "You're offline. Check your connection and try again." } });
    fireEvent.click(createButton());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("You're offline. Check your connection and try again."),
    );
    expect(screen.queryByRole('link', { name: /see plans/i })).toBeNull();
  });

  it('shows the code large, for whom, and when it expires', () => {
    setup({ inviteCodes: [invite({ role: 'guardian' })] });
    const code = screen.getByLabelText('Invite code K 7 M 2 Q P');
    expect(code).toHaveTextContent('K7M2QP');
    expect(code.className).toContain('text-2xl');
    expect(screen.getByText(/for a caregiver/i)).toBeInTheDocument();
    expect(screen.getByText(/expires/i)).toBeInTheDocument();
  });

  it('copies the bare code from a row', async () => {
    setup({ inviteCodes: [invite()] });
    fireEvent.click(screen.getByRole('button', { name: /copy invite code k7m2qp/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('K7M2QP'));
  });

  it('asks before revoking, revokes once, and reports a refusal', async () => {
    const { revokeInviteCode } = setup({
      inviteCodes: [invite()],
      revoke: { ok: false, message: 'That link was already used or has expired.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /revoke invite k7m2qp/i }));
    expect(revokeInviteCode).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/won't be able to join/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /revoke link/i }));

    await waitFor(() => expect(revokeInviteCode).toHaveBeenCalledTimes(1));
    expect(revokeInviteCode).toHaveBeenCalledWith('inv-1');
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('That link was already used or has expired.'),
    );
  });

  it('does not render an expired invite', () => {
    setup({
      inviteCodes: [
        invite({ id: 'old', code: 'DEAD01', expires_at: new Date(Date.now() - 1000).toISOString() }),
        invite({ id: 'live', code: 'LIVE01' }),
      ],
    });
    expect(screen.queryByText('DEAD01')).toBeNull();
    expect(screen.getByText('LIVE01')).toBeInTheDocument();
  });
});
