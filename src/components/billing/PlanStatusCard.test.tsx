import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Subscription } from '@/hooks/useSubscription';
import { APPLE_SUBSCRIPTIONS_URL } from '@/lib/billingBannerState';
import { PlanStatusCard, type PlanStatus } from './PlanStatusCard';

const SUB: Subscription = {
  id: 'sub_row',
  user_id: 'u1',
  plan_id: 'p_pro',
  plan_name: 'Pro',
  status: 'active',
  billing_cycle: 'monthly',
  current_period_start: '2026-09-01T00:00:00Z',
  current_period_end: '2026-10-01T00:00:00Z',
  cancel_at_period_end: false,
  trial_end: null,
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'sub_1',
  is_complementary: false,
  complementary_subscription_id: null,
};

const stripe = (sub: Partial<Subscription> = {}, extra: Partial<Extract<PlanStatus, { kind: 'stripe' }>> = {}): PlanStatus => ({
  kind: 'stripe',
  planName: 'Pro',
  sub: { ...SUB, ...sub },
  ...extra,
});

function renderCard(status: PlanStatus, refreshing = false) {
  return render(<PlanStatusCard status={status} refreshing={refreshing} onRefresh={vi.fn()} onOpenPortal={vi.fn()} />);
}

describe('PlanStatusCard', () => {
  it('shows a skeleton only while there is nothing to show', () => {
    const { container } = renderCard({ kind: 'loading' });
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it('keeps the content on a refresh and marks the card busy', () => {
    const { container } = renderCard(stripe(), true);
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(container.querySelectorAll('[class*="animate-pulse"]')).toHaveLength(0);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    // The spinner respects reduced motion.
    const icon = screen.getByRole('button', { name: /refresh plan details/i }).querySelector('svg');
    expect(icon?.getAttribute('class')).toContain('motion-safe:animate-spin');
  });

  it('renders no progress bar when the period cannot be measured', () => {
    renderCard(stripe({ current_period_start: null }));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('names the period bar and gives the days left as its value text', () => {
    renderCard(stripe({ current_period_start: '2020-01-01T00:00:00Z', current_period_end: '2099-01-01T00:00:00Z' }));
    const bar = screen.getByRole('progressbar', { name: /this billing period/i });
    expect(bar.getAttribute('aria-valuetext')).toMatch(/^\d[\d,]* days left$/);
  });

  it('translates the Stripe status; never shows the raw string', () => {
    renderCard(stripe({ status: 'past_due' }, { planName: 'Free' }));
    expect(screen.queryByText('past_due')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/premium features are paused until your card is updated/i);
  });

  it('is an alert with Retry on error, and offers no upgrade', () => {
    renderCard({ kind: 'error', offline: false });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your plan. Nothing about your billing has changed.");
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/upgrade|view plans/i)).toBeNull();
  });

  it('says offline when it is', () => {
    renderCard({ kind: 'error', offline: true });
    expect(screen.getByRole('alert')).toHaveTextContent(/you're offline/i);
  });

  it('names an ended plan on Free', () => {
    renderCard({ kind: 'free', endedPlan: { name: 'Pro', endedAt: '2026-08-15T12:00:00Z' } });
    expect(screen.getByText('Free plan')).toBeInTheDocument();
    expect(screen.getByText(/your pro plan ended on august 15, 2026/i)).toBeInTheDocument();
  });

  it('sends App Store plans to iPhone Settings in a new tab', () => {
    renderCard({ kind: 'appStore', planName: 'Family Plus', expiresAt: '2026-10-20T00:00:00Z' });
    expect(screen.getByText('Billed through the App Store')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /manage in iphone settings/i });
    expect(link).toHaveAttribute('href', APPLE_SUBSCRIPTIONS_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows a comp with no end date, no bar and no billing rows', () => {
    renderCard({ kind: 'comp', planName: 'Pro', endDate: null });
    expect(screen.getByText('Complimentary from EatPal')).toBeInTheDocument();
    expect(screen.getByText('No end date')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/billing cycle|renews on/i)).toBeNull();
  });

  it('shows the trial end on a trialing plan', () => {
    renderCard(stripe({ status: 'trialing', trial_end: '2026-10-05T12:00:00Z' }));
    expect(screen.getByText('Trial ends October 5, 2026')).toBeInTheDocument();
  });
});
