import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef, useImperativeHandle, useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { Kid } from '@/types';

const h = vi.hoisted(() => ({
  kids: [] as Kid[],
  activeKidId: null as string | null,
  kidsHydrated: true,
  kidsLoadError: null as string | null,
  refreshKids: vi.fn(),
  setActiveKid: vi.fn(),
  openForAdd: vi.fn(),
  openForEdit: vi.fn(),
}));

vi.mock('react-helmet-async', () => ({ Helmet: () => null }));
vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({
    kids: h.kids,
    activeKidId: h.activeKidId,
    kidsHydrated: h.kidsHydrated,
    kidsLoadError: h.kidsLoadError,
    refreshKids: h.refreshKids,
    setActiveKid: h.setActiveKid,
  }),
  useFoods: () => ({ foods: [] }),
}));
// Item 40: the page no longer asks the flag. If it ever does again, this
// makes the test fail loudly rather than quietly render a fallback.
const flagCalls = vi.hoisted(() => [] as string[]);
vi.mock('@/hooks/useFeatureFlag', () => ({
  useFeatureFlag: (key: string) => {
    flagCalls.push(key);
    return false;
  },
}));
vi.mock('@/components/foodTracker/LadderOverview', () => ({
  LadderOverview: ({ kid, logRequestNonce }: { kid: Kid; logRequestNonce?: number }) => (
    <div data-testid="ladder-overview" data-kid={kid.id} data-nonce={logRequestNonce} />
  ),
}));
vi.mock('@/components/foodTracker/FoodHistoryList', () => ({
  FoodHistoryList: ({ kidId }: { kidId: string }) => <div data-testid="food-history" data-kid={kidId} />,
}));
vi.mock('@/components/foodTracker/FamilyLadderSummary', () => ({
  FamilyLadderSummary: () => <div data-testid="family-summary" />,
}));
vi.mock('@/components/ManageKidsDialog', () => ({
  ManageKidsDialog: forwardRef((_props, ref) => {
    useImperativeHandle(ref, () => ({ openForAdd: h.openForAdd, openForEdit: h.openForEdit }));
    return null;
  }),
}));

import FoodTracker from './FoodTracker';
import { QuickLogProvider, useQuickLog } from '@/contexts/QuickLogContext';
import { QuickActionsFab } from '@/components/QuickActionsFab';

const maya: Kid = { id: 'kid-1', name: 'Maya', allergens: [] };
const leo: Kid = { id: 'kid-2', name: 'Leo', allergens: [] };

function wrap(ui: ReactNode) {
  return render(<MemoryRouter initialEntries={['/dashboard/food-tracker']}>{ui}</MemoryRouter>);
}

beforeEach(() => {
  h.kids = [maya, leo];
  h.activeKidId = 'kid-1';
  h.kidsHydrated = true;
  h.kidsLoadError = null;
  flagCalls.length = 0;
  h.refreshKids.mockReset().mockResolvedValue(undefined);
  h.setActiveKid.mockReset();
  h.openForAdd.mockReset();
  h.openForEdit.mockReset();
});

describe('FoodTracker kid gating', () => {
  it('shows a skeleton, not the no-kids copy, before kids hydrate', () => {
    h.kids = [];
    h.activeKidId = null;
    h.kidsHydrated = false;
    wrap(<FoodTracker />);
    expect(screen.getByTestId('food-tracker-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('No children yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add child/i })).not.toBeInTheDocument();
  });

  it('shows Retry on a kids load error, calling refreshKids, with no add-child CTA', async () => {
    h.kids = [];
    h.activeKidId = null;
    h.kidsHydrated = false;
    h.kidsLoadError = 'network';
    wrap(<FoodTracker />);
    expect(screen.queryByText('No children yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add child/i })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refreshKids).toHaveBeenCalledTimes(1);
  });

  it('shows No children yet only for a hydrated, empty list', () => {
    h.kids = [];
    h.activeKidId = null;
    wrap(<FoodTracker />);
    expect(screen.getByRole('heading', { level: 2, name: 'No children yet' })).toBeInTheDocument();
  });

  it('falls through to family mode when activeKidId resolves to no child', () => {
    h.activeKidId = 'deleted-kid';
    wrap(<FoodTracker />);
    expect(screen.getByTestId('family-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('ladder-overview')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add child/i })).toBeInTheDocument();
  });
});

describe('FoodTracker body', () => {
  it('renders LadderOverview and FoodHistoryList for everyone, without asking a flag', () => {
    wrap(<FoodTracker />);
    expect(screen.getByTestId('ladder-overview')).toHaveAttribute('data-kid', 'kid-1');
    expect(screen.getByTestId('food-history')).toHaveAttribute('data-kid', 'kid-1');
    expect(flagCalls).not.toContain('exposure_ladder');
  });

  it('renders the family summary in family mode', () => {
    h.activeKidId = null;
    wrap(<FoodTracker />);
    expect(screen.getByTestId('family-summary')).toBeInTheDocument();
  });

  it('the edit button opens the active kid in ManageKidsDialog', async () => {
    wrap(<FoodTracker />);
    await userEvent.setup().click(screen.getByRole('button', { name: "Edit Maya's profile" }));
    await waitFor(() => expect(h.openForEdit).toHaveBeenCalledWith('kid-1'));
  });

  it('kid chips switch the child and mark the active one', async () => {
    wrap(<FoodTracker />);
    const group = screen.getByRole('group', { name: 'Choose a child' });
    expect(within(group).getByRole('button', { name: /Maya/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(within(group).getByRole('button', { name: /Leo/ }));
    expect(h.setActiveKid).toHaveBeenCalledWith('kid-2');
  });

  it('focuses the new kid heading and announces the switch', () => {
    const view = wrap(<FoodTracker />);
    h.activeKidId = 'kid-2';
    view.rerender(
      <MemoryRouter initialEntries={['/dashboard/food-tracker']}>
        <FoodTracker />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 2, name: "Leo's foods" })).toHaveFocus();
    expect(screen.getByText('Now tracking Leo')).toBeInTheDocument();
  });
});

describe('FoodTracker FAB action', () => {
  function FabFromContext() {
    const { pageAction } = useQuickLog();
    return (
      <QuickActionsFab
        kidCount={2}
        hasUnloggedToday
        onLogMeal={pageAction ? pageAction.run : () => {}}
        logLabel={pageAction?.label}
        todayKey="2026-09-24"
      />
    );
  }

  function Harness() {
    const [showPage, setShowPage] = useState(true);
    return (
      <QuickLogProvider openQuickLog={() => {}}>
        {showPage ? <FoodTracker /> : null}
        <button type="button" onClick={() => setShowPage(false)}>
          leave page
        </button>
        <FabFromContext />
      </QuickLogProvider>
    );
  }

  it("reads 'Log a tasting' on Food Tracker and reverts after unmount", async () => {
    const user = userEvent.setup();
    wrap(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Quick actions' }));
    const menu = screen.getByRole('group', { name: 'Quick actions' });
    expect(within(menu).getByRole('button', { name: 'Log a tasting' })).toBeInTheDocument();

    await user.click(within(menu).getByRole('button', { name: 'Log a tasting' }));
    expect(screen.getByTestId('ladder-overview')).toHaveAttribute('data-nonce', '1');

    await act(async () => {
      screen.getByRole('button', { name: 'leave page' }).click();
    });
    await user.click(screen.getByRole('button', { name: 'Quick actions' }));
    const after = screen.getByRole('group', { name: 'Quick actions' });
    expect(within(after).queryByRole('button', { name: 'Log a tasting' })).not.toBeInTheDocument();
    expect(within(after).getByRole('button', { name: 'Log a meal' })).toBeInTheDocument();
  });
});
