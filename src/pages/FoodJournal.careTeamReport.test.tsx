/**
 * The Food Journal's care-team report: previewed in full before it leaves the
 * household, first names only, household notes signed by role.
 */
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
const ava: Kid = { id: 'kid-ava', name: 'Ava Smith', allergens: [] };
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

describe('FoodJournal care-team report', () => {
  function withMariaNote() {
    const e = entry({ result: 'ate' });
    mocks.planEntries = [e];
    mocks.feedback = [
      {
        id: 'fb1',
        plan_entry_id: e.id,
        user_id: 'user-maria',
        rating: 4,
        note: 'Asked for more',
        created_at: `${today}T18:30:00Z`,
      },
    ];
  }

  it('shows the exact text before anything is sent', async () => {
    withMariaNote();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Share report' }));

    const dialog = await screen.findByRole('dialog');
    expect(mocks.shareOrCopyText).not.toHaveBeenCalled();
    const text = (within(dialog).getByRole('textbox') as HTMLTextAreaElement).value;
    expect(text).toContain('Food journal: Ava');
    expect(text).toContain('Broccoli');
    expect(text).toContain('Asked for more (Parent)');
    expect(text).not.toContain('Smith');
    expect(text).not.toContain('Maria');
  });

  it('copies the previewed text and closes', async () => {
    withMariaNote();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Share report' }));
    const dialog = await screen.findByRole('dialog');
    const shown = (within(dialog).getByRole('textbox') as HTMLTextAreaElement).value;
    // jsdom has no share sheet, so only Copy is offered.
    expect(within(dialog).queryByRole('button', { name: 'Share' })).toBeNull();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));

    expect(mocks.shareOrCopyText).toHaveBeenCalledTimes(1);
    const [text, opts] = mocks.shareOrCopyText.mock.calls[0] as unknown as [string, { preferShare?: boolean }];
    expect(text).toBe(shown);
    expect(opts.preferShare).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers Share where a share sheet exists and falls back to copy by hand', async () => {
    mocks.shareOrCopyText.mockResolvedValue('failed');
    const nav = navigator as Navigator & { share?: unknown };
    const had = 'share' in nav;
    Object.defineProperty(nav, 'share', { value: vi.fn(), configurable: true, writable: true });
    try {
      withMariaNote();
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Share report' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Share' }));

      const [, opts] = mocks.shareOrCopyText.mock.calls[0] as unknown as [string, { preferShare?: boolean }];
      expect(opts.preferShare).toBe(true);
      expect(await screen.findByRole('dialog')).toHaveTextContent('Copy this text');
    } finally {
      if (!had) delete (nav as { share?: unknown }).share;
    }
  });
});
