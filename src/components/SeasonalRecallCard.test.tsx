import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => {
  const selectCalls: string[] = [];
  const eqCalls: Array<[string, unknown]> = [];
  const rangeCalls: Array<[string, string, string]> = [];
  let rows: unknown[] = [];
  const builder = {
    select: (cols: string) => {
      selectCalls.push(cols);
      return builder;
    },
    eq: (col: string, value: unknown) => {
      eqCalls.push([col, value]);
      return builder;
    },
    gte: (col: string, value: string) => {
      rangeCalls.push(['gte', col, value]);
      return builder;
    },
    lte: (col: string, value: string) => {
      rangeCalls.push(['lte', col, value]);
      return builder;
    },
    order: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    selectCalls,
    eqCalls,
    rangeCalls,
    setRows: (next: unknown[]) => {
      rows = next;
    },
    builder,
    addPlanEntries: vi.fn(),
    kids: [{ id: 'kid-a', name: 'Ava' }] as Array<{ id: string; name: string }>,
    toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => h.builder },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'user-1', householdId: 'hh-1' }),
}));
vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({ kids: h.kids }),
  useRecipes: () => ({ recipes: [{ id: 'r1', name: 'Chili' }] }),
  usePlan: () => ({ planEntries: [], addPlanEntries: h.addPlanEntries }),
}));
vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/analytics', () => ({ analytics: { trackEvent: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { SeasonalRecallCard, clearSeasonalRecallCache } from './SeasonalRecallCard';

const lastYearRows = [
  { kid_id: 'kid-a', recipe_id: 'r1', food_id: 'f1', meal_slot: 'dinner', date: '2025-09-24' },
  // A kid who has since been removed from the account.
  { kid_id: 'kid-gone', recipe_id: 'r1', food_id: 'f1', meal_slot: 'dinner', date: '2025-09-25' },
];

describe('SeasonalRecallCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0));
    clearSeasonalRecallCache();
    h.selectCalls.length = 0;
    h.eqCalls.length = 0;
    h.rangeCalls.length = 0;
    h.setRows(lastYearRows);
    h.kids = [{ id: 'kid-a', name: 'Ava' }];
    h.addPlanEntries.mockReset();
    h.toast.mockReset();
    h.toast.success.mockReset();
    h.toast.error.mockReset();
    try {
      localStorage.clear();
    } catch {
      // jsdom always has it
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queries only this household, only the columns it needs, on local-date bounds', async () => {
    render(<SeasonalRecallCard />);
    await screen.findByText('Chili');
    expect(h.selectCalls).toEqual(['kid_id,recipe_id,food_id,meal_slot,date']);
    expect(h.eqCalls).toContainEqual(['household_id', 'hh-1']);
    expect(h.rangeCalls).toEqual([
      ['gte', 'date', '2025-09-03'],
      ['lte', 'date', '2025-10-15'],
    ]);
  });

  it('keeps the card and shows no success toast when the insert fails', async () => {
    h.addPlanEntries.mockResolvedValue({ error: new Error('rls'), insertedIds: [] });
    render(<SeasonalRecallCard />);
    fireEvent.click(await screen.findByRole('button', { name: /copy this week/i }));

    await waitFor(() => expect(h.addPlanEntries).toHaveBeenCalledTimes(1));
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(screen.getByTestId('seasonal-recall-card')).toBeInTheDocument();
  });

  it('drops entries for a kid no longer on the account before inserting', async () => {
    h.addPlanEntries.mockResolvedValue({ error: null, insertedIds: ['p1'] });
    render(<SeasonalRecallCard />);
    fireEvent.click(await screen.findByRole('button', { name: /copy this week/i }));

    await waitFor(() => expect(h.addPlanEntries).toHaveBeenCalledTimes(1));
    const inserted = h.addPlanEntries.mock.calls[0][0] as Array<{ kid_id: string; date: string }>;
    expect(inserted.map((e) => e.kid_id)).toEqual(['kid-a']);
    expect(inserted[0].date).toBe('2026-09-24');
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('seasonal-recall-card')).not.toBeInTheDocument();
  });

  it('inserts nothing and says so when none of last year\'s kids remain', async () => {
    h.kids = [{ id: 'kid-new', name: 'Noa' }];
    render(<SeasonalRecallCard />);
    fireEvent.click(await screen.findByRole('button', { name: /copy this week/i }));

    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1));
    expect(String(h.toast.mock.calls[0][0])).toMatch(/nothing to copy/i);
    expect(h.addPlanEntries).not.toHaveBeenCalled();
  });

  it('renders nothing, not an "unlocks in N months" placeholder, without history', async () => {
    h.setRows([]);
    const { container } = render(<SeasonalRecallCard />);
    await waitFor(() => expect(h.selectCalls).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/unlocks/i)).not.toBeInTheDocument();
  });
});
