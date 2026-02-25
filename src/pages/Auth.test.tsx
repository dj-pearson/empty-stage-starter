import { render, screen } from '@testing-library/react';
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
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remainingAttempts: 5 }),
  recordAttempt: vi.fn(),
  clearRateLimit: vi.fn(),
  formatRetryAfter: vi.fn().mockReturnValue(''),
}));

vi.mock('@/lib/conversion-tracking', () => ({
  trackConversion: vi.fn(),
  trackSignUp: vi.fn(),
  trackLogin: vi.fn(),
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
  loginHistory: {
    recordLoginAttempt: vi.fn(),
    recordLoginSuccess: vi.fn(),
    recordLoginFailure: vi.fn(),
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

describe('Auth Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the auth page without crashing', () => {
    renderAuth();
    expect(document.body).toBeTruthy();
  });

  it('renders authentication form', () => {
    const { container } = renderAuth();
    // Auth page should contain form elements
    const forms = container.querySelectorAll('form');
    expect(forms.length).toBeGreaterThan(0);
  });

  it('renders tab triggers for sign in and sign up', () => {
    renderAuth();
    // Look for tab triggers by role
    const tabs = screen.queryAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(0);
  });

  it('renders form inputs', () => {
    renderAuth();
    // Auth page should have text input fields for email and password
    const inputs = document.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('renders the page with accessible labels', () => {
    renderAuth();
    // Look for Email label text or input
    const emailLabel = screen.queryByText(/email/i) || document.querySelector('input[type="email"]');
    expect(emailLabel).toBeTruthy();
  });

  it('has interactive buttons', () => {
    renderAuth();
    const buttons = screen.queryAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
