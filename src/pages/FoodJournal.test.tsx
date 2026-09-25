import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import '@/i18n';
import { toISODate } from '@/lib/date-utils';
import type { JournalFeedback } from '@/lib/foodJournal';
import type { Food, Kid, PlanEntry } from '@/types';

const mocks = vi.hoisted(() => ({
  kids: [] as Kid[],
  activeKidId: null as string | null,
  foods: [] as Food[],
  planEntries: [] as PlanEntry[],
  feedback: [] as JournalFeedback[],
  status: 'ready' as 'loading' | 'ready' | 'error' | 'offline',
  openQuickLog: vi.fn(),
  updatePlanEntry: vi.fn(async () => ({ error: null })),
  shareOrCopyText: vi.fn(async () => 'copied'),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({ kids: mocks.kids, activeKidId: mocks.activeKidId, kidsHydrated: true }),
  useFoods: () => ({ foods: mocks.foods, foodsHydrated: true }),
  useRecipes: () => ({ recipes: [] }),
  usePlan: () => ({ planEntries: mocks.planEntries, updatePlanEntry: mocks.updatePlanEntry }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'user-me', householdId: 'hh-1' }),
}));

vi.mock('@/contexts/QuickLogContext', () => ({
  useQuickLog: () => ({ openQuickLog: mocks.openQuickLog }),
}));

vi.mock('@/hooks/useHousehold', () => ({
  useHousehold: () => ({
    members: [
      { id: 'm1', user_id: 'user-me', role: 'owner', joined_at: '', profiles: { full_name: 'Sam' } },
      { id: 'm2', user_id: 'user-maria', role: 'member', joined_at: '', profiles: { full_name: 'Maria' } },
    ],
  }),
}));

vi.mock('@/hooks/useJournalFeedback', () => ({
  useJournalFeedback: () => ({ feedback: mocks.feedback, attempts: [], status: mocks.status, reload: vi.fn() }),
}));

vi.mock('@/hooks/useKidsProgressSummary', () => ({
  useKidsProgressSummary: () => ({ ladderRows: [], attempts: [], loading: false }),
}));

vi.mock('@/lib/shareText', () => ({
  shareOrCopyText: mocks.shareOrCopyText,
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: mocks.toastSuccess, error: mocks.toastError }),
}));

import FoodJournal from './FoodJournal';

const today = toISODate(new Date());
const ava: Kid = { id: 'kid-ava', name: 'Ava', allergens: [] };
const ben: Kid = { id: 'kid-ben', name: 'Ben', allergens: [] };
const food = (id: string, name: string): Food =>
  ({ id, name, category: 'vegetable', is_safe: false, is_try_bite: false }) as Food;

let seq = 0;
function entry(partial: Partial<PlanEntry>): PlanEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    kid_id: ava.id,
    date: today,
    meal_slot: 'dinner',
    food_id: 'f-broc',
    result: 'ate',
    ...partial,
  };
}

function renderPage() {
  return render(
    <HelmetProvider>
      <FoodJournal />
    </HelmetProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  mocks.kids = [ava];
  mocks.activeKidId = ava.id;
  mocks.foods = [food('f-broc', 'Broccoli'), food('f-rice', 'Rice'), food('f-apple', 'Apple')];
  mocks.planEntries = [];
  mocks.feedback = [];
  mocks.status = 'ready';
  mocks.shareOrCopyText.mockResolvedValue('copied');
});

describe('FoodJournal summary', () => {
  it('keeps the summary counts when "Only meals with notes" is on', async () => {
    mocks.planEntries = [
      entry({ meal_slot: 'lunch', food_id: 'f-rice', result: 'ate' }),
      entry({ meal_slot: 'dinner', food_id: 'f-broc', result: 'tasted', notes: 'Licked it' }),
    ];
    renderPage();
    expect(screen.getByText('2 logged meals')).toBeInTheDocument();
    const results = screen.getByRole('list', { name: 'Results in this range' });
    expect(within(results).getByText(/Ate 1/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch'));

    expect(screen.getByText('2 logged meals')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Results in this range' })).getByText(/Ate 1/)).toBeInTheDocument();
    // The list itself is filtered.
    expect(screen.getAllByTestId('journal-row')).toHaveLength(1);
  });

  it('says "1 logged meal" in the singular and leaves zero counts out', () => {
    mocks.planEntries = [entry({ result: 'ate' })];
    renderPage();
    expect(screen.getByText('1 logged meal')).toBeInTheDocument();
    const results = screen.getByRole('list', { name: 'Results in this range' });
    expect(within(results).getAllByRole('listitem')).toHaveLength(1);
    expect(within(results).queryByText(/Refused/)).not.toBeInTheDocument();
    expect(within(results).queryByText(/Tasted/)).not.toBeInTheDocument();
  });

  it('shows a summary row per kid and kid names on rows in Family mode', () => {
    mocks.kids = [ava, ben];
    mocks.activeKidId = null;
    mocks.planEntries = [
      entry({ kid_id: ava.id, food_id: 'f-broc', result: 'ate' }),
      entry({ kid_id: ben.id, food_id: 'f-apple', result: 'refused' }),
    ];
    renderPage();
    const kidRows = screen.getAllByTestId('journal-kid-summary');
    expect(kidRows).toHaveLength(2);
    expect(kidRows[0]).toHaveTextContent('Ava');
    expect(kidRows[1]).toHaveTextContent('Ben');
    const rows = screen.getAllByTestId('journal-row');
    expect(rows.some((r) => within(r).queryByText('Ava'))).toBe(true);
    expect(rows.some((r) => within(r).queryByText('Ben'))).toBe(true);
  });

  it('treats a stale activeKidId as Family mode', () => {
    mocks.kids = [ava, ben];
    mocks.activeKidId = 'kid-deleted';
    mocks.planEntries = [
      entry({ kid_id: ava.id, food_id: 'f-broc', result: 'ate' }),
      entry({ kid_id: ben.id, food_id: 'f-apple', result: 'tasted' }),
    ];
    renderPage();
    expect(screen.getByText("What everyone ate, day by day, with everyone's notes")).toBeInTheDocument();
    expect(screen.getByText('2 logged meals')).toBeInTheDocument();
    expect(screen.getAllByTestId('journal-kid-summary')).toHaveLength(2);
  });
});

describe('FoodJournal rows', () => {
  it('labels the slot from mealSlots ("Afternoon snack" for snack2)', () => {
    mocks.planEntries = [entry({ meal_slot: 'snack2', food_id: 'f-apple', result: 'ate' })];
    renderPage();
    expect(within(screen.getByTestId('journal-row')).getByText('Afternoon snack')).toBeInTheDocument();
  });

  it('shows who wrote a household note and when', () => {
    const e = entry({ result: 'tasted' });
    mocks.planEntries = [e];
    const [y, m, d] = today.split('-').map(Number);
    mocks.feedback = [
      {
        id: 'fb1',
        plan_entry_id: e.id,
        user_id: 'user-maria',
        rating: 3,
        note: 'Ate the florets only',
        created_at: new Date(y, m - 1, d, 12, 40).toISOString(),
      },
    ];
    renderPage();
    expect(screen.getByText('Ate the florets only')).toBeInTheDocument();
    expect(screen.getByText(/Maria, 12:40/)).toBeInTheDocument();
  });
});

describe('FoodJournal logging', () => {
  it('lists an unlogged dinner today under Still to log and opens quick log on it', async () => {
    const planned = entry({ meal_slot: 'dinner', food_id: 'f-broc', result: null });
    mocks.planEntries = [planned];
    renderPage();
    expect(screen.getByText('Still to log today')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Log it: .*Dinner/ }));
    expect(mocks.openQuickLog).toHaveBeenCalledWith({ entryId: planned.id });
  });

  it('offers "Log a meal" when nothing has been logged yet', async () => {
    renderPage();
    expect(screen.getByText('Nothing logged yet')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Log a meal' });
    await userEvent.click(buttons[buttons.length - 1]);
    expect(mocks.openQuickLog).toHaveBeenCalledWith();
  });
});

describe('FoodJournal share report', () => {
  it('previews the report, sends it through shareOrCopyText, and shows the text to copy when that fails', async () => {
    mocks.shareOrCopyText.mockResolvedValue('failed');
    mocks.planEntries = [entry({ result: 'ate' })];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Share report' }));

    // The report is previewed first; nothing leaves until the parent says so.
    expect(mocks.shareOrCopyText).not.toHaveBeenCalled();
    const preview = await screen.findByRole('dialog');
    await userEvent.click(within(preview).getByRole('button', { name: 'Copy' }));

    expect(mocks.shareOrCopyText).toHaveBeenCalledTimes(1);
    const [text, opts] = mocks.shareOrCopyText.mock.calls[0] as unknown as [string, { preferShare?: boolean }];
    expect(text).toContain('Food journal: Ava');
    expect(text).toContain('Broccoli');
    // jsdom has no share sheet, so the preview offers Copy only.
    expect(opts.preferShare).toBe(false);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Copy this text');
  });
});
