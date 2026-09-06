import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

/**
 * US-702: the code screen after signup.
 *
 * This file initialises the real i18n singleton (the import below) rather than
 * stubbing useTranslation. The story's whole subject is COPY -- what the screen
 * says when no code arrives and when the wrong one is typed -- and a stub that
 * returns the key would let every assertion pass against copy that renders as
 * "auth.otpExpired" in front of a user. Assertions here read the English.
 */
import '@/i18n';

/**
 * input-otp's password-manager badge probe calls document.elementFromPoint on a
 * timer. jsdom does not implement it, so it lands as an unhandled exception
 * AFTER the test that started the timer has finished -- which vitest reports as
 * "might cause false positive tests" rather than failing anything.
 */
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}

const verifyOtp = vi.fn();
const resend = vi.fn();
const signUp = vi.fn();
const signInWithPassword = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      signUp: (...args: unknown[]) => signUp(...args),
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
      resend: (...args: unknown[]) => resend(...args),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: null, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnValue({ subscribe: vi.fn().mockReturnValue({}) }),
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null }),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn().mockReturnValue(vi.fn()),
  useLocation: vi.fn().mockReturnValue({ state: null, search: '' }),
  useSearchParams: vi.fn().mockReturnValue([new URLSearchParams(), vi.fn()]),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: to }, children),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'helmet' }, children),
  HelmetProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@/lib/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 5, retryAfterMs: 0 }),
  recordAttempt: vi.fn(),
  clearRateLimit: vi.fn(),
  formatRetryAfter: vi.fn().mockReturnValue('15 minutes'),
}));

vi.mock('@/lib/conversion-tracking', () => ({
  trackSignup: vi.fn(),
  trackPageView: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    withContext: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    }),
  },
}));

vi.mock('@/lib/login-history', () => ({
  loginHistory: { logLogin: vi.fn(), logFailedLogin: vi.fn() },
}));

// handleSignUp calls this before signUp; unmocked it queries a table the
// supabase stub above does not model, and every signup test would hang.
vi.mock('@/lib/disposable-email', () => ({
  isDisposableEmail: vi.fn().mockResolvedValue(false),
  DISPOSABLE_EMAIL_ERROR_MESSAGE: 'no disposable addresses',
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn().mockReturnValue({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

vi.mock('@/lib/platform', () => ({
  getStorage: vi.fn().mockResolvedValue({
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  }),
  isWeb: vi.fn().mockReturnValue(true),
  isMobile: vi.fn().mockReturnValue(false),
}));

import Auth from './Auth';
import { AppProvider } from '@/contexts/AppContext';

const EMAIL = 'parent@example.com';
const PASSWORD = 'Correct-Horse-99!';

function renderAuth() {
  return render(
    <AppProvider>
      <Auth />
    </AppProvider>,
  );
}

/** Fill the signup form and submit it, landing on the code screen. */
async function signUpToCodeScreen() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), EMAIL);
  await user.type(await screen.findByLabelText('Password'), PASSWORD);
  await user.type(await screen.findByLabelText('Confirm Password'), PASSWORD);
  await user.click(await screen.findByRole('checkbox'));
  await user.click(await screen.findByRole('button', { name: /^sign up$/i }));
  await screen.findByRole('button', { name: /verify email/i });
  return user;
}

/** Type six digits into the OTP group. */
async function typeCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  // input-otp renders one real input behind the six slots.
  const field = document.querySelector('input[autocomplete="one-time-code"], input[data-input-otp]');
  expect(field, 'the OTP input is present').toBeTruthy();
  await user.click(field as HTMLElement);
  await user.keyboard(code);
}

describe('US-702: the signup code screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    resend.mockResolvedValue({ data: {}, error: null });
    verifyOtp.mockResolvedValue({
      data: { user: { id: 'user-123' }, session: {} },
      error: null,
    });
    signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: null });
  });

  it('verifies a correct code and reports success', async () => {
    renderAuth();
    const user = await signUpToCodeScreen();
    await typeCode(user, '123456');

    await user.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({
        email: EMAIL,
        token: '123456',
        type: 'signup',
      }),
    );

    const { loginHistory } = await import('@/lib/login-history');
    const { trackSignup } = await import('@/lib/conversion-tracking');
    await waitFor(() =>
      expect(loginHistory.logLogin).toHaveBeenCalledWith('user-123', EMAIL, 'otp', {
        isSignup: true,
      }),
    );
    expect(trackSignup).toHaveBeenCalledWith('email');
    // No failure banner on the happy path.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names the code screen without promising a link, and says what to check', async () => {
    renderAuth();
    await signUpToCodeScreen();

    // AC 1: a failure state, not an empty field. AC 3: a code, never a link.
    expect(screen.getByText(/no code in your inbox/i)).toBeInTheDocument();
    expect(screen.getByText(/junk and spam/i)).toBeInTheDocument();
    expect(screen.getByText(/6-digit code, not a link/i)).toBeInTheDocument();
    // The address is shown so a typo is recoverable.
    expect(screen.getAllByText(new RegExp(EMAIL)).length).toBeGreaterThan(0);
  });

  it('says a code expired, and re-opens the resend so a new one can be sent', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 },
    });

    renderAuth();
    const user = await signUpToCodeScreen();

    // The cooldown starts at 60s straight after signup, so the resend is a
    // countdown, not a control.
    expect(screen.getByText(/resend in \d+s/i)).toBeInTheDocument();

    await typeCode(user, '000000');
    await user.click(screen.getByRole('button', { name: /verify email/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/expired/i);
    // AC 2: it must not read as a wrong code, which has the opposite remedy.
    expect(alert).not.toHaveTextContent(/not right/i);
    // The raw GoTrue string never reaches the user.
    expect(alert).not.toHaveTextContent(/Token has expired or is invalid/);
    // AC 1: the remedy is available, not gated behind a countdown for a code
    // that is already dead.
    expect(await screen.findByRole('button', { name: /resend code/i })).toBeEnabled();
  });

  it('distinguishes a wrong code from an expired one', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid token', status: 403 },
    });

    renderAuth();
    const user = await signUpToCodeScreen();
    await typeCode(user, '111111');
    await user.click(screen.getByRole('button', { name: /verify email/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/not right/i);
    expect(alert).not.toHaveTextContent(/expired/i);
  });
});

describe('US-702 AC 4: a returning unconfirmed account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resend.mockResolvedValue({ data: {}, error: null });
    verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  });

  async function signIn() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /sign ?in/i }));
    await user.type(await screen.findByLabelText('Email'), EMAIL);
    await user.type(await screen.findByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    return user;
  }

  it('lands on code entry and sends a fresh code instead of stopping', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed', status: 400 },
    });

    renderAuth();
    await signIn();

    expect(await screen.findByRole('button', { name: /verify email/i })).toBeInTheDocument();
    expect(screen.getByText(/verify your email to sign in/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(resend).toHaveBeenCalledWith({ type: 'signup', email: EMAIL }),
    );
  });

  it('does not spend rate-limit budget on an unverified address', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed', status: 400 },
    });

    renderAuth();
    await signIn();
    await screen.findByRole('button', { name: /verify email/i });

    // This is not a credential failure. Counting it locks a user out of their
    // own account for fifteen minutes for having done nothing wrong.
    const { recordAttempt } = await import('@/lib/rateLimiter');
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it('still treats a wrong password as a wrong password', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400 },
    });

    renderAuth();
    await signIn();

    const { recordAttempt } = await import('@/lib/rateLimiter');
    await waitFor(() => expect(recordAttempt).toHaveBeenCalledWith(EMAIL));
    expect(screen.queryByRole('button', { name: /verify email/i })).not.toBeInTheDocument();
    expect(resend).not.toHaveBeenCalled();
  });
});
