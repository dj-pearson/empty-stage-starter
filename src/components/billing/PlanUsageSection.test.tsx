import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import type { UsageStats } from '@/hooks/useUsageStats';
import { APPLE_SUBSCRIPTIONS_URL } from '@/lib/billingBannerState';
import { PlanUsageSection, type PlanUsageSectionProps } from './PlanUsageSection';

function freeStats(overrides: Partial<UsageStats['usage']> = {}, plan: Partial<UsageStats['plan']> = {}): UsageStats {
  return {
    plan: {
      name: 'Free',
      max_children: 1,
      max_pantry_foods: 50,
      ai_coach_daily_limit: 0,
      food_tracker_monthly_limit: 10,
      has_food_chaining: false,
      has_meal_builder: false,
      has_nutrition_tracking: false,
      is_complementary: false,
      ...plan,
    },
    usage: {
      children: { current: 1, limit: 1, percentage: 100 },
      pantry_foods: { current: 12, limit: 50, percentage: 24 },
      ai_coach: { current: 0, limit: 0, percentage: 100, resets_at: '2026-09-25 00:00:00' },
      food_tracker: { current: 2, limit: 10, percentage: 20, resets_at: '2026-10-01 00:00:00' },
      ...overrides,
    },
  };
}

function renderSection(props: Partial<PlanUsageSectionProps> = {}) {
  return render(
    <MemoryRouter>
      <PlanUsageSection stats={freeStats()} sourceKind="free" onRetry={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

describe('PlanUsageSection', () => {
  it('reads an AI coach limit of 0 on Free as not included, never as a spent limit', () => {
    const { container } = renderSection();
    expect(screen.getByText('Not in Free. Included in Pro')).toBeInTheDocument();
    expect(screen.queryByText(/limit reached/i)).toBeNull();
    expect(container.innerHTML).not.toMatch(/destructive/);
    // No bar for a feature the plan does not have.
    expect(screen.queryByRole('progressbar', { name: /ai coach/i })).toBeNull();
  });

  it('says what happens when a household is over a count limit', () => {
    renderSection({ stats: freeStats({ children: { current: 3, limit: 1, percentage: 300 } }) });
    expect(screen.getByText("3 children, your plan allows 1. Everything you've added stays.")).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Children in your household' });
    expect(bar).toHaveAttribute('aria-valuetext', '3 of 1');
  });

  it('shows Retry and no plan contents when stats failed to load', async () => {
    const onRetry = vi.fn();
    renderSection({ stats: null, error: 'network', onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load your usage");
    expect(screen.queryByText('What your plan includes')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('points an App Store subscriber at Apple, not at /pricing', () => {
    renderSection({
      sourceKind: 'appStore',
      stats: freeStats({ food_tracker: { current: 10, limit: 10, percentage: 100, resets_at: '2026-10-01 00:00:00' } }),
    });
    const links = screen.getAllByRole('link');
    expect(links.some((a) => a.getAttribute('href') === APPLE_SUBSCRIPTIONS_URL)).toBe(true);
    expect(links.some((a) => a.getAttribute('href') === '/pricing')).toBe(false);
  });

  it('shows one upgrade prompt, for the most constrained row', () => {
    renderSection({
      stats: freeStats({
        children: { current: 3, limit: 1, percentage: 300 },
        food_tracker: { current: 9, limit: 10, percentage: 90, resets_at: '2026-10-01 00:00:00' },
      }),
    });
    const prompts = screen.getAllByRole('link', { name: /see plans with more room/i });
    expect(prompts).toHaveLength(1);
    expect(screen.getByText('Children in your household is at your limit.')).toBeInTheDocument();
  });

  it('shows no upgrade prompt when nothing is close', () => {
    renderSection({ stats: freeStats({ children: { current: 1, limit: 5, percentage: 20 } }) });
    expect(screen.queryByRole('link', { name: /see plans with more room/i })).toBeNull();
  });

  it('gives the monthly reset as a short local date', () => {
    renderSection();
    // resets_at is UTC midnight with no zone; the label is the viewer's local
    // date for that instant (Sep 30 under the suite's America/Los_Angeles).
    const expected = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date('2026-10-01T00:00:00Z'));
    expect(screen.getByText(`Resets ${expected}`)).toBeInTheDocument();
  });

  it('lists what the plan includes from its columns, with Unlimited as a word', () => {
    renderSection({
      sourceKind: 'stripe',
      stats: freeStats(
        {},
        { name: 'Pro', max_children: null, ai_coach_daily_limit: 20, has_meal_builder: true, max_pantry_foods: null },
      ),
    });
    const list = screen.getByText('What your plan includes').parentElement as HTMLElement;
    expect(within(list).getByRole('link', { name: 'Meal builder' })).toHaveAttribute('href', '/dashboard/meal-builder');
    expect(within(list).queryByRole('link', { name: 'Food chaining' })).toBeNull();
    expect(within(list).getAllByText('Unlimited').length).toBeGreaterThan(0);
    expect(within(list).queryByText(/∞/)).toBeNull();
  });
});
