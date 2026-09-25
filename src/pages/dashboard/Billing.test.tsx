import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import type { Subscription } from '@/hooks/useSubscription';
import type { UsageStats } from '@/hooks/useUsageStats';
import type { PlanStatus } from '@/lib/planSource';
import { APPLE_SUBSCRIPTIONS_URL } from '@/lib/billingBannerState';

/**
 * /dashboard/billing renders from usePlanStatus: the plan the server enforces
 * (get_usage_stats, via effective_plan_id) and who bills it. These tests pin
 * what each source is offered, because offering the wrong control is the
 * defect: a Stripe portal for an App Store plan, or /pricing checkout for a
 * load failure.
 *
 * Invoices, receipts and the card stay in Stripe's customer portal (US-769);
 * the portal button asks manage-payment-methods for a URL and goes there in
 * the same tab.
 */

const invokeEdgeFunction = vi.fn();
const cancel = vi.fn();
const reactivate = vi.fn();
const refetch = vi.fn();

interface PlanState {
  status: PlanStatus;
  stats: UsageStats | null;
  subscription: Subscription | null;
  usageError: 'network' | 'forbidden' | 'unknown' | null;
  refreshing: boolean;
  refetch: () => Promise<void>;
}

let planState: PlanState;

vi.mock('@/hooks/usePlanStatus', () => ({
  usePlanStatus: () => planState,
}));

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ actionLoading: false, cancel, reactivate }),
}));

vi.mock('@/lib/edge-functions', () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunction(...args),
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

const SUB: Subscription = {
  id: 'row_1',
  user_id: 'u1',
  plan_id: 'plan_pro',
  plan_name: 'Family Pro',
  status: 'active',
  billing_cycle: 'monthly',
  current_period_start: '2026-09-01T12:00:00Z',
  current_period_end: '2026-10-01T12:00:00Z',
  cancel_at_period_end: false,
  trial_end: null,
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'sub_1',
  is_complementary: false,
  complementary_subscription_id: null,
};

const STATS: UsageStats = {
  plan: {
    name: 'Family Pro',
    max_children: 6,
    max_pantry_foods: null,
    ai_coach_daily_limit: 20,
    food_tracker_monthly_limit: null,
    has_food_chaining: true,
    has_meal_builder: true,
    has_nutrition_tracking: true,
    is_complementary: false,
  },
  usage: {
    children: { current: 2, limit: 6, percentage: 33 },
    pantry_foods: { current: 80, limit: null, percentage: 0 },
    ai_coach: { current: 1, limit: 20, percentage: 5, resets_at: '2026-09-25 00:00:00' },
    food_tracker: { current: 4, limit: null, percentage: 0, resets_at: '2026-10-01 00:00:00' },
  },
};

function state(status: PlanStatus, overrides: Partial<PlanState> = {}): PlanState {
  return {
    status,
    stats: STATS,
    subscription: status.kind === 'stripe' ? status.sub : null,
    usageError: null,
    refreshing: false,
    refetch,
    ...overrides,
  };
}

const stripe = (sub: Partial<Subscription> = {}, extra: Partial<Extract<PlanStatus, { kind: 'stripe' }>> = {}): PlanStatus => ({
  kind: 'stripe',
  planName: 'Family Pro',
  sub: { ...SUB, ...sub },
  ...extra,
});

function renderBilling() {
  return render(
    <MemoryRouter>
      <Billing />
    </MemoryRouter>,
  );
}

const STRIPE_BUTTONS = [/billing portal/i, /change plan/i, /cancel plan/i];

describe('the billing page', () => {
  const assign = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    planState = state(stripe());
    cancel.mockResolvedValue({ success: true });
    reactivate.mockResolvedValue({ success: true });
    refetch.mockResolvedValue(undefined);
    invokeEdgeFunction.mockResolvedValue({ data: { url: 'https://billing.stripe.com/p/session_1' }, error: null });
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, assign } });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('renders the plan a subscriber is paying for', async () => {
    renderBilling();
    expect(await screen.findByRole('heading', { level: 1, name: /plan and billing/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Family Pro' })).toBeInTheDocument();
  });

  it('opens the Stripe portal in the same tab, which is where invoices and the card live', async () => {
    const user = userEvent.setup();
    renderBilling();
    await user.click(screen.getByRole('button', { name: /open billing portal/i }));

    await waitFor(() =>
      expect(invokeEdgeFunction).toHaveBeenCalledWith('manage-payment-methods', {
        body: { action: 'get-portal-url' },
      }),
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/session_1'));
  });

  it('(1) App Store: links to Apple, offers no Stripe control and never calls an edge function', () => {
    planState = state({ kind: 'appStore', planName: 'Family Plus', expiresAt: '2026-10-20T00:00:00Z' });
    renderBilling();
    const apple = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === APPLE_SUBSCRIPTIONS_URL);
    expect(apple.length).toBeGreaterThan(0);
    for (const name of STRIPE_BUTTONS) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(invokeEdgeFunction).not.toHaveBeenCalled();
  });

  it('(2) complimentary: no end date and contact support, no Stripe buttons, no bar', () => {
    planState = state({ kind: 'comp', planName: 'Family Pro', endDate: null });
    renderBilling();
    expect(screen.getByText('No end date')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contact support/i })).toHaveAttribute('href', 'mailto:support@tryeatpal.com');
    for (const name of STRIPE_BUTTONS) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('progressbar', { name: /billing period/i })).toBeNull();
  });

  it('(3) a trialing Stripe plan can be canceled', () => {
    planState = state(stripe({ status: 'trialing', trial_end: '2026-10-01T12:00:00Z' }));
    renderBilling();
    expect(screen.getByRole('button', { name: /cancel plan/i })).toBeInTheDocument();
  });

  it('(4) Free with an ended plan offers View plans and no Cancel', () => {
    planState = state({ kind: 'free', endedPlan: { name: 'Family Pro', endedAt: '2026-08-15T12:00:00Z' } }, {
      stats: { ...STATS, plan: { ...STATS.plan, name: 'Free' } },
    });
    renderBilling();
    expect(screen.getByRole('link', { name: /view plans/i })).toHaveAttribute('href', '/pricing');
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
    expect(screen.getByText(/your family pro plan ended on/i)).toBeInTheDocument();
  });

  it('(5) a plan set to cancel offers Reactivate, which calls reactivate', async () => {
    planState = state(stripe({ cancel_at_period_end: true }));
    const user = userEvent.setup();
    renderBilling();
    expect(screen.queryByRole('button', { name: /cancel plan/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /reactivate/i }));
    expect(reactivate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it('(6) the cancel dialog names the plan and the date, and confirming cancels once', async () => {
    const user = userEvent.setup();
    renderBilling();
    await user.click(screen.getByRole('button', { name: /cancel plan/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Family Pro stays active until October 1, 2026, then you move to Free.');
    expect(dialog).toHaveTextContent('AI coach questions stop.');
    expect(dialog).toHaveTextContent('Your kids, foods and history are kept.');

    await user.click(within(dialog).getByRole('button', { name: /cancel plan/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('(6b) a failed cancel stays in the dialog and says so', async () => {
    cancel.mockResolvedValue({ success: false, error: 'Stripe is unreachable' });
    const user = userEvent.setup();
    renderBilling();
    await user.click(screen.getByRole('button', { name: /cancel plan/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel plan/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Stripe is unreachable');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('(7) a load failure is an alert with Try again, never View plans', () => {
    planState = state({ kind: 'error', offline: false }, { stats: null, usageError: 'unknown' });
    renderBilling();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load your plan/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/view plans/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /pricing|plans/i })).toBeNull();
  });

  it('(8) past due is an alert and names the plan actually enforced', () => {
    planState = state(stripe({ status: 'past_due' }, { planName: 'Free' }), {
      stats: { ...STATS, plan: { ...STATS.plan, name: 'Free' } },
    });
    renderBilling();
    expect(screen.getByRole('alert')).toHaveTextContent(/premium features are paused until your card is updated/i);
    expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument();
  });

  it('(9) an App Store plan with a live Stripe subscription warns about double billing', () => {
    planState = state({
      kind: 'appStore',
      planName: 'Family Plus',
      expiresAt: '2026-10-20T00:00:00Z',
      strayStripe: { ...SUB, plan_name: 'Pro' },
    });
    renderBilling();
    const warning = screen.getByText(/you may be billed twice/i).closest('[role="status"]') as HTMLElement;
    expect(warning).toHaveTextContent('Family Plus');
    expect(warning).toHaveTextContent('Pro');
    expect(within(warning).getByRole('button', { name: /open billing portal/i })).toBeInTheDocument();
  });

  it('refetches when the tab becomes visible again', () => {
    renderBilling();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('US-769: billing is reachable', () => {
  it('is in the nav registry every renderer reads, for every signed-in user', async () => {
    const { navItemsFor } = await import('@/lib/navigation');
    // The registry is the fact: the sidebar, the mobile bar and the More sheet
    // all render from it, so an entry here is a link in all three.
    const billing = navItemsFor().find((item) => item.to === '/dashboard/billing');
    expect(billing, 'billing is missing from NAV_ITEMS').toBeDefined();
    expect(billing?.group).toBe('account');
    // No `requires`: paying customers are not admins, and this is where they
    // go to stop paying.
    expect(billing?.requires).toBeUndefined();
  });

  it('is linked from the Plan section of the Settings hub', async () => {
    const fs = await import('fs');
    const settings = fs.readFileSync('src/components/settings/sections/PlanSection.tsx', 'utf8');
    expect(settings).toContain('/dashboard/billing');
  });

  it('keeps the retired subscription components deleted', async () => {
    const fs = await import('fs');
    // src/components/billing/ is back, but as the pieces this page is built
    // from; the old hand-rolled invoice and card UI stays gone.
    for (const gone of [
      'src/components/subscription/EnhancedSubscriptionDialog.tsx',
      'src/components/subscription/NotificationBell.tsx',
      'src/components/subscription/SubscriptionOnboarding.tsx',
      'src/components/subscription/UsageDashboard.tsx',
    ]) {
      expect(fs.existsSync(gone), `${gone} should be deleted`).toBe(false);
    }
  });

  it('uses no raw palette colors', async () => {
    const fs = await import('fs');
    for (const file of [
      'src/pages/dashboard/Billing.tsx',
      'src/components/billing/PlanStatusCard.tsx',
      'src/components/billing/PlanUsageSection.tsx',
      'src/components/billing/ManagePlanCard.tsx',
      'src/components/billing/CancelSubscriptionDialog.tsx',
      'src/components/subscription/UsageMeter.tsx',
    ]) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/\b(?:bg|text|border)-(?:green|yellow|red|blue|orange)-\d{2,3}\b/);
    }
  });
});
