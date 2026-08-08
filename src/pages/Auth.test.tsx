import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// Mock all external dependencies
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: null, error: null }),
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
      on: vi.fn().mockReturnValue({
        subscribe: vi.fn().mockReturnValue({}),
      }),
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
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'helmet' }, children),
  HelmetProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@/lib/rateLimiter', () => ({
  // `remaining`, not `remainingAttempts` — matches the real return shape.
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 5, retryAfterMs: 0 }),
  recordAttempt: vi.fn(),
  clearRateLimit: vi.fn(),
  formatRetryAfter: vi.fn().mockReturnValue('15 minutes'),
}));

// NB: the real module exports trackSignup / trackPageView (lowercase 'u', and
// no trackLogin). The previous mock invented trackConversion/trackSignUp/
// trackLogin, which meant Auth.tsx's real imports resolved to undefined the
// moment any test exercised a submit path (US-621).
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

// NB: the real logger exposes logLogin / logFailedLogin. The previous mock's
// recordLogin* names matched nothing, so a submit path would have thrown.
vi.mock('@/lib/login-history', () => ({
  loginHistory: {
    logLogin: vi.fn(),
    logFailedLogin: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn().mockReturnValue({
    toast: vi.fn(),
    dismiss: vi.fn(),
    toasts: [],
  }),
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

// Import after mocks
import Auth from './Auth';
import { AppProvider } from '@/contexts/AppContext';

function renderAuth() {
  return render(
    <AppProvider>
      <Auth />
    </AppProvider>
  );
}

/**
 * US-621: these assertions are deliberately specific.
 *
 * The previous versions asserted `elements.length).toBeGreaterThan(0)`. When
 * jsdom's missing ResizeObserver made the whole page throw during layout
 * effects, the tree rendered EMPTY and every one of those checks compared 0 to
 * 0 — the suite reported the page as broken only by accident, and would have
 * reported a blank page as passing had the counts been asserted the other way.
 * Naming the actual controls means a blank render cannot masquerade as a pass.
 */
describe('Auth Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the auth page without crashing', () => {
    renderAuth();
    expect(document.body).toBeTruthy();
  });

  it('renders the sign-up form with its real controls', async () => {
    renderAuth();

    // Each of these is a specific control, so an empty tree fails.
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(await screen.findByLabelText('Confirm Password')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /^sign up$/i }),
    ).toBeInTheDocument();
  });

  it('renders both tab triggers, named', async () => {
    renderAuth();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs.map((t) => t.textContent)).toEqual(
      expect.arrayContaining([expect.stringMatching(/sign ?up/i), expect.stringMatching(/sign ?in/i)]),
    );
  });

  it('requires the 18+/guardian consent checkbox before sign-up is enabled', async () => {
    renderAuth();
    // The consent gate is a compliance requirement (GDPR Art. 7(1) trail), so
    // assert the control exists and starts unchecked rather than just counting
    // inputs.
    const consent = await screen.findByRole('checkbox');
    expect(consent).toBeInTheDocument();
    expect(consent).not.toBeChecked();

    expect(await screen.findByRole('button', { name: /^sign up$/i })).toBeDisabled();
  });

  it('offers both OAuth providers', async () => {
    renderAuth();
    expect(await screen.findByRole('button', { name: /google/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /apple/i })).toBeInTheDocument();
  });

  it('exposes the email input with a real accessible name', async () => {
    renderAuth();
    const email = await screen.findByLabelText('Email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toBeRequired();
  });
});

describe('Auth Page — sign-in behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Switch to the Sign In tab and fill in credentials. */
  async function fillSignIn(email = 'parent@example.com', password = 'Correct-Horse-1!') {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /sign ?in/i }));

    const emailInput = await screen.findByLabelText('Email');
    const passwordInput = await screen.findByLabelText('Password');
    await user.type(emailInput, email);
    await user.type(passwordInput, password);
    return user;
  }

  it('blocks the request when the client-side limiter says no', async () => {
    const { checkRateLimit } = await import('@/lib/rateLimiter');
    vi.mocked(checkRateLimit).mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterMs: 900_000,
    });

    renderAuth();
    const user = await fillSignIn();
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const { supabase } = await import('@/integrations/supabase/client');
    const { toast } = await import('sonner');

    // The point of the limiter: no credential call is made at all.
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('records a failed attempt and surfaces the error', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    } as never);

    renderAuth();
    const user = await fillSignIn();
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const { recordAttempt } = await import('@/lib/rateLimiter');
    const { loginHistory } = await import('@/lib/login-history');
    const { toast } = await import('sonner');

    await waitFor(() => expect(recordAttempt).toHaveBeenCalledWith('parent@example.com'));
    expect(loginHistory.logFailedLogin).toHaveBeenCalledWith(
      'parent@example.com',
      'password',
      'Invalid login credentials',
    );
    expect(toast.error).toHaveBeenCalled();
  });

  it('clears the limiter and logs the login on success', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: { id: 'user-123' }, session: {} },
      error: null,
    } as never);

    renderAuth();
    const user = await fillSignIn();
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const { clearRateLimit } = await import('@/lib/rateLimiter');
    const { loginHistory } = await import('@/lib/login-history');

    await waitFor(() => expect(clearRateLimit).toHaveBeenCalledWith('parent@example.com'));
    expect(loginHistory.logLogin).toHaveBeenCalledWith(
      'user-123',
      'parent@example.com',
      'password',
    );
    // US-617: the server-side window must be cleared too, not just localStorage.
    expect(supabase.rpc).toHaveBeenCalledWith('clear_login_rate_limit', {
      p_identifier: 'parent@example.com',
      p_action: 'login',
    });
  });
});
