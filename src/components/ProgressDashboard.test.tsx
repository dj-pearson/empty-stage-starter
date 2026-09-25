import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { KidAttemptRow, KidLadderRow } from '@/lib/kidProgress';
import type { Food, Kid } from '@/types';

const TODAY = '2026-09-24';

const foods: Food[] = [
  { id: 'peas', name: 'Peas', category: 'vegetable', is_safe: true, is_try_bite: false },
  { id: 'corn', name: 'Corn', category: 'vegetable', is_safe: true, is_try_bite: false },
  { id: 'apple', name: 'Apple', category: 'fruit', is_safe: true, is_try_bite: false },
];

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods }),
}));

import { ProgressDashboard, ProgressTrajectory } from './ProgressDashboard';

const kids: Kid[] = [
  { id: 'k1', name: 'Maya' },
  { id: 'k2', name: 'Leo' },
];

function attempt(day: string, food_id: string, kid_id: string): KidAttemptRow {
  const [y, m, d] = day.split('-').map(Number);
  return { kid_id, food_id, attempted_at: new Date(y, m - 1, d, 12).toISOString(), outcome: 'success' };
}

function mastered(food_id: string, day: string, kid_id: string): KidLadderRow {
  return { kid_id, food_id, status: 'mastered', current_rung: 'eating', last_attempt_at: day };
}

const attempts: KidAttemptRow[] = [
  // Maya: three foods first tried across July to September.
  attempt('2026-07-02', 'peas', 'k1'),
  attempt('2026-08-03', 'corn', 'k1'),
  attempt('2026-09-04', 'apple', 'k1'),
  attempt('2026-09-05', 'apple', 'k1'),
  // Leo: one food, tried often, since June.
  attempt('2026-06-10', 'peas', 'k2'),
  attempt('2026-07-10', 'peas', 'k2'),
  attempt('2026-08-10', 'peas', 'k2'),
];

const ladderRows: KidLadderRow[] = [mastered('peas', '2026-08-20', 'k1'), mastered('corn', '2026-09-10', 'k1')];

function renderTrajectory(props: Partial<Parameters<typeof ProgressTrajectory>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ProgressTrajectory
        kids={kids}
        ladderRows={ladderRows}
        attempts={attempts}
        loading={false}
        error={false}
        todayIso={TODAY}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('ProgressTrajectory', () => {
  it('is the same component under the old name', () => {
    expect(ProgressDashboard).toBe(ProgressTrajectory);
  });

  it('renders one card per kid with that kid\'s own numbers', () => {
    renderTrajectory();
    const cards = screen.getAllByTestId('trajectory-card');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByTestId('trajectory-headline')).toHaveTextContent(
      'Since July: 2 foods reached safe, 3 first tries.',
    );
    expect(within(cards[1]).getByTestId('trajectory-headline')).toHaveTextContent('Since June: 1 first try.');
    // Reached safe belongs to Maya only.
    expect(within(cards[0]).getByText('Peas')).toBeInTheDocument();
    expect(within(cards[1]).queryByText('Peas')).not.toBeInTheDocument();
  });

  it('prints no percentage and no invented average', () => {
    const { container } = renderTrajectory();
    expect(container.textContent).not.toContain('%');
    expect(container.textContent).not.toMatch(/better than average/i);
  });

  it('gives each month bar an accessible name', () => {
    renderTrajectory({ kids: [kids[0]] });
    expect(screen.getByRole('img', { name: /^August: 1 first try, 1 food reached safe, 1 try logged$/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('trajectory-month')).toHaveLength(3);
  });

  it('renders a skeleton while loading', () => {
    renderTrajectory({ loading: true });
    expect(screen.getByTestId('trajectory-loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('trajectory-card')).not.toBeInTheDocument();
  });

  it('says trends need a month when logging is new, and links to Insights', () => {
    renderTrajectory({ kids: [kids[0]], ladderRows: [], attempts: [attempt('2026-09-20', 'peas', 'k1')] });
    expect(screen.getByText('Trends appear after your first month of logging.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See this week on Insights' })).toHaveAttribute('href', '/dashboard/insights');
    expect(screen.queryByTestId('trajectory-month')).not.toBeInTheDocument();
  });

  it('renders what loaded plus a quiet note on error or truncation', () => {
    renderTrajectory({ error: true });
    expect(screen.getByTestId('trajectory-partial')).toBeInTheDocument();
    expect(screen.getAllByTestId('trajectory-card')).toHaveLength(2);
  });

  it('offers to scope to one kid in the family view', () => {
    const onSelectKid = vi.fn();
    renderTrajectory({ onSelectKid });
    screen.getByRole('button', { name: 'Show only Leo' }).click();
    expect(onSelectKid).toHaveBeenCalledWith('k2');
  });
});
