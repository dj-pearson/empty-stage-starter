import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import '@/i18n';
import type { Food, Kid } from '@/types';
import type { LadderRow } from '@/hooks/useFoodLadder';
import { ladderRow } from './ladderTestFixtures';

const h = vi.hoisted(() => ({
  ladder: {} as Record<string, unknown>,
  foods: [] as Food[],
  trackEvent: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/hooks/useFoodLadder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useFoodLadder')>()),
  useFoodLadder: () => h.ladder,
}));
vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: h.foods }),
  useKids: () => ({ updateKid: vi.fn().mockResolvedValue(true) }),
  usePlan: () => ({ planEntries: [] }),
}));
vi.mock('@/hooks/usePickyWinSharePref', () => ({
  usePickyWinSharePref: () => ({ enabled: false }),
}));
vi.mock('@/lib/analytics', () => ({ analytics: { trackEvent: h.trackEvent } }));
vi.mock('@/components/LadderReportDialog', () => ({ LadderReportDialog: () => null }));

import { LadderOverview } from './LadderOverview';

const kid: Kid = { id: 'kid-1', name: 'Maya', allergens: [] };

function ladderState(overrides: Record<string, unknown> = {}) {
  return {
    rows: [] as LadderRow[],
    loading: false,
    error: null,
    reload: vi.fn().mockResolvedValue(undefined),
    logAttempt: vi.fn(),
    undoLog: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stepDown: vi.fn(),
    removeFromLadder: vi.fn(),
    restoreRow: vi.fn(),
    backfillFromHistory: vi.fn().mockResolvedValue(0),
    startFood: vi.fn(),
    masteryCandidates: [],
    masteredFoodName: null,
    dismissMastery: vi.fn(),
    ...overrides,
  };
}

const section = (group: string) => {
  const el = document.querySelector<HTMLElement>(`section[data-group="${group}"]`);
  if (!el) throw new Error(`no ${group} section`);
  return el;
};

beforeAll(() => {
  // cmdk scrolls the active option into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  h.trackEvent.mockReset();
  h.foods = ['due', 'close', 'working', 'resting', 'safe', 'tomorrow'].map((id) => ({
    id,
    name: `Food ${id}`,
    category: 'protein',
    is_safe: false,
    is_try_bite: false,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LadderOverview', () => {
  it('renders each row once, in its group, in page order', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    h.ladder = ladderState({
      rows: [
        ladderRow({ id: 'r-due', foodId: 'due', nextDueOn: iso, currentRung: 'full_bite' }),
        ladderRow({ id: 'r-close', foodId: 'close', nextDueOn: '2999-01-01', currentRung: 'full_portion' }),
        ladderRow({ id: 'r-working', foodId: 'working', nextDueOn: '2999-01-01', currentRung: 'looking' }),
        ladderRow({ id: 'r-rest', foodId: 'resting', status: 'paused', nextDueOn: null }),
        ladderRow({ id: 'r-safe', foodId: 'safe', status: 'mastered', nextDueOn: null, currentRung: 'full_portion' }),
      ],
    });
    render(<LadderOverview kid={kid} />);

    for (const name of ['due', 'close', 'working', 'resting', 'safe']) {
      expect(screen.getAllByText(`Food ${name}`)).toHaveLength(1);
    }
    expect(within(section('dueToday')).getByText('Food due')).toBeInTheDocument();
    expect(within(section('closeToSafe')).getByText('Food close')).toBeInTheDocument();
    expect(within(section('workingOn')).getByText('Food working')).toBeInTheDocument();
    expect(within(section('resting')).getByText('Food resting')).toBeInTheDocument();
    expect(within(section('safeNow')).getByText('Food safe')).toBeInTheDocument();

    const order = [...document.querySelectorAll('section[data-group]')].map((s) =>
      s.getAttribute('data-group')
    );
    expect(order).toEqual(['dueToday', 'closeToSafe', 'workingOn', 'resting', 'safeNow']);

    // Quick log only where a parent can act today.
    expect(within(section('dueToday')).getByRole('button', { name: 'Log Took it for Food due' })).toBeInTheDocument();
    expect(within(section('closeToSafe')).getByRole('button', { name: 'Log Took it for Food close' })).toBeInTheDocument();
    expect(within(section('workingOn')).queryByRole('button', { name: /^Log / })).toBeNull();

    // Each group is a labelled region with an h2.
    expect(screen.getByRole('heading', { level: 2, name: 'Due today' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Safe now' })).toBeInTheDocument();

    expect(h.trackEvent).toHaveBeenCalledTimes(1);
    expect(h.trackEvent).toHaveBeenCalledWith('exposure_ladder_viewed', { surface: 'food_tracker' });
  });

  it('shows Retry on a load error, with no start-a-food CTA and no backfill', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    h.ladder = ladderState({ loading: true, reload });
    const { rerender } = render(<LadderOverview kid={kid} />);
    h.ladder = ladderState({ loading: false, error: 'load_failed', reload });
    rerender(<LadderOverview kid={kid} />);

    const retry = screen.getByRole('button', { name: 'Retry' });
    retry.click();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Pick one food to start with')).toBeNull();
    expect((h.ladder.backfillFromHistory as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('keeps rows on screen when a reload fails', () => {
    h.ladder = ladderState({
      error: 'load_failed',
      rows: [ladderRow({ id: 'r-working', foodId: 'working', nextDueOn: '2999-01-01', currentRung: 'looking' })],
    });
    render(<LadderOverview kid={kid} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByText('Food working')).toBeInTheDocument();
  });

  it('backfills an empty ladder once after it loads, then offers to start a food', async () => {
    const backfillFromHistory = vi.fn().mockResolvedValue(0);
    h.ladder = ladderState({ loading: true, backfillFromHistory });
    const { rerender } = render(<LadderOverview kid={kid} />);
    expect(backfillFromHistory).not.toHaveBeenCalled();
    expect(screen.getByTestId('ladder-loading')).toHaveAttribute('aria-busy', 'true');

    h.ladder = ladderState({ loading: false, backfillFromHistory });
    rerender(<LadderOverview kid={kid} />);
    rerender(<LadderOverview kid={kid} />);

    await waitFor(() => expect(screen.getByText('Pick one food to start with')).toBeInTheDocument());
    expect(backfillFromHistory).toHaveBeenCalledTimes(1);
    expect(backfillFromHistory).toHaveBeenCalledWith('kid-1');
  });

  it('moves a row into Due today when the day turns over and the tab is looked at again', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24, 23, 58));
    h.ladder = ladderState({
      rows: [ladderRow({ id: 'r-t', foodId: 'tomorrow', nextDueOn: '2026-09-25', currentRung: 'looking' })],
    });
    render(<LadderOverview kid={kid} />);
    expect(within(section('workingOn')).getByText('Food tomorrow')).toBeInTheDocument();

    vi.setSystemTime(new Date(2026, 8, 25, 0, 2));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(within(section('dueToday')).getByText('Food tomorrow')).toBeInTheDocument();
    expect(document.querySelector('section[data-group="workingOn"]')).toBeNull();
  });

  it("brings the planner strip's ?food= row into view once the ladder loads (item 4)", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.history.pushState({}, '', '/dashboard/food-tracker?food=working');
    try {
      const rows = [
        ladderRow({ id: 'r-close', foodId: 'close', nextDueOn: '2999-01-01', currentRung: 'looking' }),
        ladderRow({ id: 'r-working', foodId: 'working', nextDueOn: '2999-01-01', currentRung: 'looking' }),
      ];
      h.ladder = ladderState({ loading: true });
      const { rerender } = render(<LadderOverview kid={kid} />);
      h.ladder = ladderState({ loading: false, rows });
      rerender(<LadderOverview kid={kid} />);
      await waitFor(() => expect(scroll).toHaveBeenCalled());
      const el = scroll.mock.contexts[0] as HTMLElement;
      expect(el.getAttribute('data-ladder-row')).toBe('r-working');
    } finally {
      window.history.pushState({}, '', '/');
      Element.prototype.scrollIntoView = vi.fn();
    }
  });

  it('opens the picker on a log request when nothing is due', async () => {
    h.ladder = ladderState({
      rows: [ladderRow({ id: 'r-working', foodId: 'working', nextDueOn: '2999-01-01', currentRung: 'looking' })],
    });
    const { rerender } = render(<LadderOverview kid={kid} logRequestNonce={0} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<LadderOverview kid={kid} logRequestNonce={1} />);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Start a food for Maya');
  });
});
