import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import '@/i18n/appLocale';
import type { Food, Kid } from '@/types';
import type { KidLadderRow } from '@/lib/kidProgress';
import { addIsoDays, toISODate } from '@/lib/date-utils';

type ReadResult = { data: { badge_id: string; earned_at: string }[] | null; error: { message: string } | null };
let readResult: ReadResult = { data: [], error: null };
let planEntries: { id: string; kid_id: string; date: string; result: string | null; meal_slot: string; food_id: string }[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve(readResult),
  };
  return { supabase: { from: () => builder } };
});

vi.mock('@/contexts/AppContext', () => ({
  usePlan: () => ({ planEntries }),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

import { AchievementsView } from './AchievementsView';
import { AchievementBadge } from './AchievementBadge';
import { badgeById } from '@/lib/badgeCatalog';

const kid: Kid = { id: 'k1', name: 'Maya' };
const foods = new Map<string, Food>([
  ['peas', { id: 'peas', name: 'Peas', category: 'vegetable', is_safe: false, is_try_bite: false }],
]);
const ladderRows: KidLadderRow[] = [
  { kid_id: 'k1', food_id: 'peas', status: 'mastered', current_rung: 'eating', last_attempt_at: '2026-05-14' },
];

const renderView = () =>
  render(
    <MemoryRouter>
      <AchievementsView kid={kid} ladderRows={ladderRows} foodsById={foods} />
    </MemoryRouter>,
  );

beforeEach(() => {
  readResult = { data: [], error: null };
  planEntries = [];
  toastError.mockReset();
});

describe('AchievementsView', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dates an earned badge from earned_at, not today', async () => {
    readResult = { data: [{ badge_id: 'firstTryBite', earned_at: '2026-03-02T18:00:00Z' }], error: null };
    renderView();

    const expected = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(Date.parse('2026-03-02T18:00:00Z'));
    expect(await screen.findByText(`Earned on ${expected}`)).toBeInTheDocument();

    const today = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date());
    expect(screen.queryByText(`Earned on ${today}`)).toBeNull();
    expect(screen.getByText('1 of 12 badges earned', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Peas reached safe' })).toHaveAttribute('href', '/dashboard/food-tracker');
  });

  it('shows Retry on a failed read, and never twelve locked tiles', async () => {
    readResult = { data: null, error: { message: 'boom' } };
    renderView();

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryAllByText('Not yet earned')).toHaveLength(0);
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it('names every progress bar, and a full streak reads as ready to sync', async () => {
    // Pinned to a Wednesday. Seven days of try-bites ending on a Friday,
    // Saturday or Sunday also fill Perfect Week (5 this Monday-first week),
    // and a second "ready to sync" line made getByText throw on those days.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-23T12:00:00'));
    const today = toISODate(new Date());
    planEntries = Array.from({ length: 7 }, (_, i) => ({
      id: `e${i}`,
      kid_id: 'k1',
      date: addIsoDays(today, -i),
      result: 'ate',
      meal_slot: 'try_bite',
      food_id: 'peas',
    }));
    renderView();

    await screen.findAllByText('Not yet earned');
    const bars = screen.getAllByRole('progressbar');
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar).toHaveAttribute('aria-label');
      expect(bar.getAttribute('aria-label')).not.toBe('');
      expect(bar).toHaveAttribute('aria-valuetext');
    }
    expect(screen.getByText('Done. Shows as earned after the iPhone app syncs.')).toBeInTheDocument();
    expect(screen.queryByText('7 of 5')).toBeNull();
    // Zero earned: the nearest badge and a way to act on it.
    expect(screen.getByRole('link', { name: 'Offer a try-bite' })).toHaveAttribute('href', '/dashboard/food-tracker');
  });

  it('has no format(new Date() left in its source', () => {
    const src = readFileSync(path.resolve(__dirname, 'AchievementsView.tsx'), 'utf8');
    expect(src).not.toMatch(/format\(new Date\(/);
    expect(readFileSync(path.resolve(__dirname, 'AchievementBadge.tsx'), 'utf8')).not.toMatch(/format\(new Date\(/);
  });
});

describe('AchievementBadge', () => {
  const badge = badgeById('perfectWeek')!;

  it('renders 27 of 25 as full and ready to sync, never 27 / 25', () => {
    render(<AchievementBadge badge={badge} earned={false} hint={{ progress: 27, total: 25 }} />);
    const bar = screen.getByRole('progressbar', { name: 'Perfect Week progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '25 of 25');
    expect(screen.getByText('Done. Shows as earned after the iPhone app syncs.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/27\s*\/\s*25|27 of 25/);
  });

  it('does not throw on a total of 0', () => {
    render(<AchievementBadge badge={badge} earned={false} hint={{ progress: 3, total: 0 }} />);
    expect(screen.getByRole('progressbar', { name: 'Perfect Week progress' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('labels the household badge and a locked state for screen readers', () => {
    const { container } = render(<AchievementBadge badge={badgeById('recipeChef')!} earned={false} />);
    expect(within(container).getByText('Household')).toBeInTheDocument();
    expect(within(container).getByText('Not yet earned')).toBeInTheDocument();
  });
});
