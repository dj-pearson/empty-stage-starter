import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { FoodAttemptHistoryState } from '@/hooks/useFoodAttemptHistory';
import type { FoodAttemptHistoryRow } from '@/lib/foodAttemptHistory';

const h = vi.hoisted(() => ({
  history: { status: 'loading' } as FoodAttemptHistoryState,
  foods: [] as Array<{ id: string; name: string }>,
}));

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: h.foods }),
}));
vi.mock('@/hooks/useFoodAttemptHistory', () => ({
  useFoodAttemptHistory: () => ({ ...h.history, reload: vi.fn() }),
  loadFoodAttempts: vi.fn().mockResolvedValue({ ok: true, rows: [], hasMore: false }),
}));

import { FoodHistoryList } from './FoodHistoryList';

let seq = 0;
function attempt(overrides: Partial<FoodAttemptHistoryRow> = {}): FoodAttemptHistoryRow {
  seq += 1;
  return {
    id: `a-${seq}`,
    food_id: 'broccoli',
    stage: 'looking',
    outcome: 'success',
    attempted_at: '2026-09-01T18:00:00.000Z',
    is_milestone: false,
    reaction_notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.foods = [
    { id: 'broccoli', name: 'Broccoli' },
    { id: 'peas', name: 'Peas' },
  ];
  h.history = { status: 'loading' };
});

describe('FoodHistoryList', () => {
  it('shows a busy skeleton while loading', () => {
    render(<FoodHistoryList kidId="kid-1" />);
    expect(screen.getByTestId('food-history-loading')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an error with Retry, not the empty-history copy', () => {
    const retry = vi.fn();
    h.history = { status: 'error', retry };
    render(<FoodHistoryList kidId="kid-1" />);
    expect(screen.queryByText('No tries logged yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows the empty-history copy when there are no attempts', () => {
    h.history = { status: 'ready', rows: [] };
    render(<FoodHistoryList kidId="kid-1" />);
    expect(screen.getByText('No tries logged yet')).toBeInTheDocument();
  });

  it('shows Clear filter when a filter matches nothing, and keeps the counts', () => {
    h.history = {
      status: 'ready',
      rows: [attempt({ outcome: 'success' }), attempt({ food_id: 'peas', outcome: 'success' })],
    };
    render(<FoodHistoryList kidId="kid-1" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Not today (0)' }));
    expect(screen.getByText('No foods match this filter.')).toBeInTheDocument();
    // The filter narrows rows, never the totals on the chips.
    expect(screen.getByRole('radio', { name: 'All (2)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.getAllByRole('button', { name: /history$/ })).toHaveLength(2);
  });

  it('renders outcome badges as outline with no palette classes', () => {
    h.history = {
      status: 'ready',
      rows: [
        attempt({ outcome: 'success' }),
        attempt({ food_id: 'peas', outcome: 'tantrum', attempted_at: '2026-09-02T18:00:00.000Z' }),
      ],
    };
    const { container } = render(<FoodHistoryList kidId="kid-1" />);
    const badges = [screen.getByText('Took it'), screen.getByText('Hard time')].map(
      (el) => el.closest('div') as HTMLElement
    );
    // The default variant paints bg-primary and repaints on hover; outline does not.
    for (const badge of badges) expect(badge.className).not.toContain('bg-primary');
    expect(badges[0].className).toContain('text-safe-food');
    expect(badges[1].className).toContain('border-destructive');
    const html = container.innerHTML;
    expect(html).not.toMatch(/\b(text|bg|border)-(yellow|gray|orange|green|red|blue)-\d{2,3}\b/);
    expect(html).not.toContain('text-white');
  });

  it('marks a food with a reaction when any attempt carries reaction notes', () => {
    h.history = {
      status: 'ready',
      rows: [
        attempt({ reaction_notes: 'Hives on chin', attempted_at: '2026-08-01T18:00:00.000Z' }),
        attempt({ attempted_at: '2026-09-01T18:00:00.000Z' }),
        attempt({ food_id: 'peas' }),
      ],
    };
    render(<FoodHistoryList kidId="kid-1" />);
    const markers = screen.getAllByTestId('reaction-marker');
    expect(markers).toHaveLength(1);
    expect(markers[0].closest('button')).toHaveAccessibleName('Open Broccoli history');
  });

  it('puts the time in a <time> element with its ISO value', () => {
    h.history = { status: 'ready', rows: [attempt()] };
    const { container } = render(<FoodHistoryList kidId="kid-1" />);
    expect(container.querySelector('time')?.getAttribute('dateTime')).toBe('2026-09-01T18:00:00.000Z');
  });
});
