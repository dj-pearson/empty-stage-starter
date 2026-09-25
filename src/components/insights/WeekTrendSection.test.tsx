import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { addIsoDays } from '@/lib/date-utils';
import type { KidsProgressData } from '@/hooks/useKidsProgressSummary';
import type { Kid, PlanEntry } from '@/types';

const TODAY = '2026-09-24';

const plan = vi.hoisted(() => ({ entries: [] as PlanEntry[] }));

vi.mock('@/contexts/AppContext', () => ({
  usePlan: () => ({ planEntries: plan.entries }),
  useFoods: () => ({ foods: [{ id: 'f-peas', name: 'Peas' }] }),
}));

import { WeekTrendSection } from './WeekTrendSection';

const kids: Kid[] = [
  { id: 'k1', name: 'Maya' },
  { id: 'k2', name: 'Leo' },
];

const ready: KidsProgressData = { ladderRows: [], attempts: [], loading: false, error: false };

let seq = 0;
function row(kid_id: string, date: string, result: PlanEntry['result']): PlanEntry {
  seq += 1;
  return { id: `p${seq}`, kid_id, date, meal_slot: 'dinner', food_id: `f${seq}`, result };
}

function renderSection(props: Partial<Parameters<typeof WeekTrendSection>[0]> = {}) {
  return render(
    <MemoryRouter>
      <WeekTrendSection kids={kids} progress={ready} todayIso={TODAY} {...props} />
    </MemoryRouter>,
  );
}

describe('WeekTrendSection', () => {
  it('renders a headline for each of two kids in compact mode', () => {
    plan.entries = [
      row('k1', TODAY, 'ate'),
      row('k1', addIsoDays(TODAY, -1), 'tasted'),
      row('k1', addIsoDays(TODAY, -2), 'ate'),
      row('k2', TODAY, 'ate'),
      row('k2', addIsoDays(TODAY, -3), 'ate'),
      row('k2', addIsoDays(TODAY, -10), 'refused'),
    ];
    renderSection({ compact: true });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('How the weeks are going');
    expect(screen.getByText(/Maya was offered 3 dishes this week/)).toBeInTheDocument();
    expect(screen.getByText(/Leo was offered 2 dishes this week/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a loading skeleton while progress loads', () => {
    plan.entries = [];
    renderSection({ progress: { ...ready, loading: true } });
    expect(screen.getAllByTestId('trend-loading')).toHaveLength(2);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('offers the planner when nothing was logged in 28 days', () => {
    plan.entries = [row('k1', addIsoDays(TODAY, 2), 'ate'), row('k1', TODAY, null)];
    renderSection({ kids: [kids[0]] });
    expect(screen.getByText(/No meals logged for Maya/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open planner' })).toHaveAttribute('href', '/dashboard/planner');
  });

  it("marks an empty week as 'not logged' in the sparkline", () => {
    plan.entries = [
      row('k1', TODAY, 'ate'),
      row('k1', addIsoDays(TODAY, -8), 'ate'),
      row('k1', addIsoDays(TODAY, -22), 'tasted'),
    ];
    renderSection({ kids: [kids[0]] });
    const figure = screen.getByRole('img');
    expect(figure).toHaveAttribute('aria-label', expect.stringContaining('not logged'));
    expect(screen.getByText('not logged')).toHaveClass('sr-only');
    expect(screen.getAllByText('This week').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('trend-bar')).toHaveLength(4);
  });

  it('hides the sparkline until two weeks have logs', () => {
    plan.entries = [row('k1', TODAY, 'ate'), row('k1', TODAY, 'tasted'), row('k1', addIsoDays(TODAY, -1), 'ate')];
    renderSection({ kids: [kids[0]] });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Trend shows after two weeks of logging')).toBeInTheDocument();
  });

  it('never says "refused", even when most results were refusals', () => {
    plan.entries = [
      row('k1', TODAY, 'refused'),
      row('k1', addIsoDays(TODAY, -1), 'refused'),
      row('k1', addIsoDays(TODAY, -9), 'refused'),
      row('k1', addIsoDays(TODAY, -16), 'refused'),
      row('k2', addIsoDays(TODAY, -9), 'refused'),
    ];
    const { container } = renderSection();
    expect(container.textContent?.toLowerCase()).not.toContain('refus');
    const labels = [...container.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') ?? '');
    expect(labels.join(' ').toLowerCase()).not.toContain('refus');
  });
});
