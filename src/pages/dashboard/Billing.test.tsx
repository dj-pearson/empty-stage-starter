import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

/**
 * US-769 AC 4, adjusted for the branch AC 2 took.
 *
 * The AC was written as "asserts invoices and the payment method render",
 * which assumed Billing.tsx would be rebuilt from src/components/billing/*.
 * It was not: those four components were deleted, and this page hands
 * invoices, receipts and the card to Stripe's customer portal instead. So the
 * equivalent assertion is that the route TO them works -- the portal button
 * asks manage-payment-methods for a URL and opens it -- rather than that a
 * hand-rolled invoice table renders.
 */

const invokeEdgeFunction = vi.fn();
const cancel = vi.fn();
const reactivate = vi.fn();
const refetch = vi.fn();
const navigate = vi.fn();

let subscriptionState: Record<string, unknown> = {};

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => subscriptionState,
}));

vi.mock('@/lib/edge-functions', () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunction(...args),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'helmet' }, children),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

import Billing from './Billing';

const PAID = {
  id: 'sub_1',
  plan_name: 'Family Pro',
  status: 'active',
  current_period_start: '2026-08-01T00:00:00Z',
  current_period_end: '2026-09-01T00:00:00Z',
  is_complementary: false,
};

/** Defaults for a signed-in subscriber; each test overrides what it cares about. */
function subscribed(overrides: Record<string, unknown> = {}) {
  return {
    subscription: PAID,
    loading: false,
    actionLoading: false,
    isActive: true,
    isTrialing: false,
    isPastDue: false,
    willCancelAtPeriodEnd: false,
    cancel,
    reactivate,
    refetch,
    ...overrides,
  };
}

describe('US-769: the billing page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionState = subscribed();
    invokeEdgeFunction.mockResolvedValue({ data: { url: 'https://billing.stripe.com/p/session_1' }, error: null });
    vi.stubGlobal('open', vi.fn());
  });

  it('renders the plan a subscriber is paying for', async () => {
    render(<Billing />);
    expect(await screen.findByRole('heading', { name: /billing & payments/i })).toBeInTheDocument();
    expect(screen.getByText('Family Pro')).toBeInTheDocument();
  });

  it('opens the Stripe portal, which is where invoices and the card live', async () => {
    const user = userEvent.setup();
    render(<Billing />);

    const buttons = await screen.findAllByRole('button', { name: /billing portal|manage/i });
    await user.click(buttons[0]);

    await waitFor(() =>
      expect(invokeEdgeFunction).toHaveBeenCalledWith('manage-payment-methods', {
        body: { action: 'get-portal-url' },
      }),
    );
    // A returned URL that is never opened is the same as no portal at all.
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith('https://billing.stripe.com/p/session_1', '_blank'),
    );
  });

  it('sends someone with no subscription to the plans, not to an empty portal', async () => {
    subscriptionState = subscribed({ subscription: null, isActive: false });
    const user = userEvent.setup();
    render(<Billing />);

    await user.click(await screen.findByRole('button', { name: /view plans/i }));
    expect(navigate).toHaveBeenCalledWith('/pricing');
    expect(invokeEdgeFunction).not.toHaveBeenCalled();
  });

  it('shows the loading state rather than an empty page', () => {
    subscriptionState = subscribed({ loading: true });
    const { container } = render(<Billing />);
    // Skeletons, not a blank shell: this page is reached from a paid flow.
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });
});

describe('US-769: billing is reachable', () => {
  it('is linked from the sidebar and from the Subscription tab', async () => {
    const fs = await import('fs');
    const sidebar = fs.readFileSync('src/components/AppSidebar.tsx', 'utf8');
    const settings = fs.readFileSync('src/pages/dashboard/AccountSettings.tsx', 'utf8');
    // The whole defect was a page nothing pointed at. Assert the pointers.
    expect(sidebar).toContain('/dashboard/billing');
    expect(settings).toContain('/dashboard/billing');
  });

  it('has no second billing implementation left in the tree', async () => {
    const fs = await import('fs');
    // AC 2: Stripe's portal is the implementation. A parallel in-app card and
    // invoice UI that nothing imports is how the page ended up with two halves.
    expect(fs.existsSync('src/components/billing')).toBe(false);
    expect(fs.existsSync('src/components/subscription/UsageMeter.tsx')).toBe(true);
    for (const gone of [
      'src/components/subscription/EnhancedSubscriptionDialog.tsx',
      'src/components/subscription/NotificationBell.tsx',
      'src/components/subscription/SubscriptionOnboarding.tsx',
      'src/components/subscription/UsageDashboard.tsx',
    ]) {
      expect(fs.existsSync(gone), `${gone} should be deleted`).toBe(false);
    }
  });
});
