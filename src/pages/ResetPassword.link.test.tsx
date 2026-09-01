import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

/**
 * The recovery email carries a 6-digit code AND a link. The link exists for
 * clients with nowhere to type a code, notably the shipped iOS app, which shows
 * "Password reset email sent. Check your inbox." and stops.
 *
 * The link lands here as ?token_hash=..., which this page exchanges for a
 * recovery session so the user goes straight to setting a new password.
 *
 * It cannot use GoTrue's own {{ .ConfirmationURL }}: that redirects to SITE_URL,
 * which Coolify pins to ${SERVICE_URL_SUPABASEKONG}, so it answers 401 JSON.
 */
const verifyOtp = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

let searchParams = new URLSearchParams();

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [searchParams, vi.fn()],
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/**
 * input-otp schedules a selection-mirror timeout that outlives the test
 * environment and surfaces as "window is not defined" after teardown. None of
 * these tests type a code, so stub it out rather than leave an unhandled error
 * that vitest warns can cause false positives.
 */
vi.mock('@/components/ui/input-otp', () => ({
  InputOTP: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  InputOTPGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  InputOTPSlot: () => <div />,
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

import ResetPassword from './ResetPassword';

describe('ResetPassword: emailed link fallback', () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    toastError.mockReset();
    searchParams = new URLSearchParams();
  });

  it('exchanges a token_hash from the link for a recovery session', async () => {
    searchParams = new URLSearchParams('token_hash=abc123');
    verifyOtp.mockResolvedValue({ error: null });

    render(<ResetPassword />);

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith({
        token_hash: 'abc123',
        type: 'recovery',
      });
    });
  });

  it('exchanges the token only once, so StrictMode cannot burn a single-use link', async () => {
    searchParams = new URLSearchParams('token_hash=abc123');
    verifyOtp.mockResolvedValue({ error: null });

    const { rerender } = render(<ResetPassword />);
    rerender(<ResetPassword />);

    await waitFor(() => expect(verifyOtp).toHaveBeenCalledTimes(1));
  });

  it('falls back to the code form when the link is expired, rather than dead-ending', async () => {
    searchParams = new URLSearchParams('token_hash=stale');
    verifyOtp.mockResolvedValue({ error: new Error('Token has expired') });

    render(<ResetPassword />);

    // The same email still carries a good code, so the form must come back.
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
      expect(screen.getByLabelText('resetPassword.emailLabel')).toBeTruthy();
    });
  });

  it('shows the code form immediately when there is no link token', async () => {
    render(<ResetPassword />);

    expect(screen.getByLabelText('resetPassword.emailLabel')).toBeTruthy();
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
