import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '@/i18n';

/**
 * The dashboard shell (P2): sign-out that failed, the single-key shortcuts,
 * and the onboarding gate. Everything the shell reads is stubbed at the hook
 * boundary so what is under test is the shell's own decisions.
 */

const h = vi.hoisted(() => ({
  signOut: vi.fn(),
  prefs: { keyboardShortcuts: true },
  onboardingFlag: true as boolean | null,
  fetchOnboarding: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toast: vi.fn(),
  planEntries: [] as Array<Record<string, unknown>>,
  updatePlanEntry: vi.fn(),
  requestedEntryId: 'dinner-1',
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signOut: h.signOut } },
}));

vi.mock('sonner', () => ({
  toast: Object.assign(h.toast, { error: h.toastError, success: h.toastSuccess }),
}));

vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({ kids: [{ id: 'k1', name: 'Ada' }], activeKidId: null, setActiveKid: vi.fn(), kidsHydrated: true }),
  usePlan: () => ({ planEntries: h.planEntries, updatePlanEntry: h.updatePlanEntry }),
  useFoods: () => ({ foods: [{ id: 'f1', name: 'porridge' }, { id: 'f2', name: 'fish pie' }] }),
  useRecipes: () => ({ recipes: [] }),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ userId: 'u1', householdId: 'h1' }) }));
vi.mock('@/contexts/AccessibilityContext', () => ({
  useAccessibility: () => ({ preferences: h.prefs }),
}));
vi.mock('@/lib/onboardingStatus', () => ({
  readLocalOnboardingFlag: () => h.onboardingFlag,
  fetchOnboardingCompleted: h.fetchOnboarding,
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useNavEntitlements', () => ({
  useNavEntitlements: () => ({ isAdmin: false, isProfessional: false }),
}));
vi.mock('@/hooks/useWhiteLabelTheme', () => ({ useWhiteLabelTheme: () => {} }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }) }));
vi.mock('@/components/auth/BindEmailBanner', () => ({ BindEmailBanner: () => null }));
vi.mock('@/components/OfflineIndicator', () => ({ OfflineIndicator: () => null }));
vi.mock('@/components/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('@/components/AppSidebar', () => ({ AppSidebar: () => <nav aria-label="sidebar" /> }));

import Dashboard from './Dashboard';
import { useQuickLog } from '@/contexts/QuickLogContext';
import { toISODate } from '@/lib/date-utils';
import { buildQuickLogMeals } from '@/lib/quickLog';
import type { MealSlot, PlanEntry } from '@/types';
import { StillToLogCard } from '@/components/foodJournal/StillToLogCard';

/** A page inside the shell that opens the quick log on one entry, the way TodayTasks does. */
function LogDinnerPage() {
  const { openQuickLog } = useQuickLog();
  return (
    <button type="button" onClick={() => openQuickLog({ entryId: h.requestedEntryId })}>
      log this meal
    </button>
  );
}

/**
 * The food journal's "Still to log" card, unmocked, wired to the shell the way
 * FoodJournal.tsx wires it: its ids come from buildQuickLogMeals on the page
 * side and must be ids the shell's own list accepts.
 */
function JournalStillToLogPage() {
  const { openQuickLog } = useQuickLog();
  return (
    <StillToLogCard
      planEntries={h.planEntries as unknown as PlanEntry[]}
      kids={[{ id: 'k1', name: 'Ada' }]}
      foods={[{ id: 'f1', name: 'porridge' }, { id: 'f2', name: 'fish pie' }]}
      recipes={[]}
      kidId={null}
      today={toISODate(new Date())}
      slotLabel={(slot: MealSlot) => slot}
      onLog={(entryId) => openQuickLog({ entryId })}
    />
  );
}

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname}</output>;
}

function renderShell(path = '/dashboard') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<p>landing page</p>} />
          <Route path="/onboarding" element={<p>onboarding page</p>} />
          <Route path="/dashboard" element={<Dashboard />}>
            <Route index element={<p>home page</p>} />
            <Route path="log" element={<LogDinnerPage />} />
            <Route path="journal" element={<JournalStillToLogPage />} />
            <Route path="grocery" element={<p>grocery page</p>} />
          </Route>
        </Routes>
        <Where />
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  h.signOut.mockReset();
  h.toast.mockReset();
  h.toastError.mockReset();
  h.toastSuccess.mockReset();
  h.fetchOnboarding.mockReset();
  h.prefs.keyboardShortcuts = true;
  h.onboardingFlag = true;
  h.planEntries = [];
  h.updatePlanEntry.mockReset();
});

describe('signing out', () => {
  it('stays on the dashboard when signOut reports an error', async () => {
    h.signOut.mockResolvedValue({ error: new Error('network down') });
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Sign Out' }));

    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard');
    expect(screen.queryByText('landing page')).not.toBeInTheDocument();
  });

  it('goes to the landing page when it worked', async () => {
    h.signOut.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Sign Out' }));

    expect(await screen.findByText('landing page')).toBeInTheDocument();
  });
});

describe('single-key shortcuts', () => {
  it('goes to the grocery list on "g"', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.keyboard('g');

    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/grocery');
  });

  it('does nothing while the user has shortcuts turned off', async () => {
    h.prefs.keyboardShortcuts = false;
    const user = userEvent.setup();
    renderShell();

    await user.keyboard('g');

    expect(screen.getByTestId('where')).toHaveTextContent(/^\/dashboard$/);
  });

  it('opens the shortcut reference on "?"', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.keyboard('?');

    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});

describe('the onboarding gate', () => {
  it('keeps the page out while the server is still being asked', () => {
    h.onboardingFlag = null;
    h.fetchOnboarding.mockReturnValue(new Promise(() => {}));
    renderShell();

    expect(screen.queryByText('home page')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading your dashboard' })).toBeInTheDocument();
    // The shell itself still renders.
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument();
    expect(h.fetchOnboarding).toHaveBeenCalledWith('u1');
  });

  it('renders the page straight away when the cache says onboarding is done', () => {
    renderShell();
    expect(screen.getByText('home page')).toBeInTheDocument();
    expect(h.fetchOnboarding).not.toHaveBeenCalled();
  });

  it('sends a parent who never finished to /onboarding', async () => {
    h.onboardingFlag = null;
    h.fetchOnboarding.mockResolvedValue(false);
    renderShell();

    expect(await screen.findByText('onboarding page')).toBeInTheDocument();
  });

  it('lets the parent in when the server could not say', async () => {
    h.onboardingFlag = null;
    h.fetchOnboarding.mockResolvedValue(null);
    renderShell();

    expect(await screen.findByText('home page')).toBeInTheDocument();
  });
});

describe('the quick-log seam between a page and the shell', () => {
  // No mocks between the page and the write: the real QuickLogProvider, the
  // shell's openQuickLog and buildQuickLogMeals, the real QuickLogModal and
  // performQuickLog. A page names an entry id; the patch must land on it.
  it('opens on the entry the page asked for and logs against that entry', async () => {
    const today = toISODate(new Date());
    h.planEntries = [
      { id: 'breakfast-1', kid_id: 'k1', date: today, meal_slot: 'breakfast', food_id: 'f1', result: null },
      { id: 'dinner-1', kid_id: 'k1', date: today, meal_slot: 'dinner', food_id: 'f2', result: null },
    ];
    h.updatePlanEntry.mockResolvedValue(undefined);
    // Ask for the entry the time-of-day default would NOT pick, so a shell
    // that dropped entryId fails this at any hour.
    const byClock = buildQuickLogMeals(
      h.planEntries as unknown as PlanEntry[],
      [{ id: 'k1', name: 'Ada' }],
      [{ id: 'f1', name: 'porridge' }, { id: 'f2', name: 'fish pie' }],
      [],
      null,
      today,
      new Date()
    ).find((m) => m.preselected)?.id;
    h.requestedEntryId = byClock === 'dinner-1' ? 'breakfast-1' : 'dinner-1';
    const [wanted, other] = h.requestedEntryId === 'dinner-1' ? [/fish pie/, /porridge/] : [/porridge/, /fish pie/];
    const user = userEvent.setup();
    renderShell('/dashboard/log');

    await user.click(screen.getByRole('button', { name: 'log this meal' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: wanted })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: other })).toHaveAttribute('aria-pressed', 'false');

    await user.click(within(dialog).getByRole('button', { name: /Ate it!/ }));
    await waitFor(() => expect(h.updatePlanEntry).toHaveBeenCalled());
    const [entryId, patch] = h.updatePlanEntry.mock.calls[0];
    expect(entryId).toBe(h.requestedEntryId);
    expect(patch).toMatchObject({ result: 'ate' });
  });
});

describe('undoing a quick log', () => {
  type UndoAction = { label: string; onClick: () => Promise<void> | void };

  /** Log "Ate it!" with a typed note against the only meal, and hand back the toast's Undo. */
  async function logAndGetUndo(): Promise<UndoAction> {
    const today = toISODate(new Date());
    h.planEntries = [
      {
        id: 'dinner-1',
        kid_id: 'k1',
        date: today,
        meal_slot: 'dinner',
        food_id: 'f2',
        result: null,
        notes: 'rash on cheek?',
        amount_eaten: 'some',
      },
    ];
    h.requestedEntryId = 'dinner-1';
    const user = userEvent.setup();
    renderShell('/dashboard/log');

    await user.click(screen.getByRole('button', { name: 'log this meal' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Add a note/), 'too tired');
    await user.click(within(dialog).getByRole('button', { name: /Ate it!/ }));
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalled());
    const options = h.toastSuccess.mock.calls[0][1] as { action?: UndoAction };
    expect(options.action).toBeDefined();
    return options.action as UndoAction;
  }

  it('appends the note, then puts back only what the log wrote', async () => {
    h.updatePlanEntry.mockResolvedValue({ error: null });
    const undo = await logAndGetUndo();

    // The log added to the shared note rather than wiping it, and left the
    // amount alone (nothing was picked).
    expect(h.updatePlanEntry).toHaveBeenLastCalledWith('dinner-1', {
      result: 'ate',
      notes: 'rash on cheek?\ntoo tired',
    });

    await undo.onClick();

    expect(h.updatePlanEntry).toHaveBeenLastCalledWith('dinner-1', {
      result: null,
      notes: 'rash on cheek?',
    });
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('says so when the undo does not land', async () => {
    h.updatePlanEntry.mockResolvedValueOnce({ error: null });
    const undo = await logAndGetUndo();
    h.updatePlanEntry.mockRejectedValueOnce(new Error('offline'));

    await undo.onClick();

    expect(h.toastError).toHaveBeenCalledWith("Couldn't undo that. Check the meal in the planner.");
  });

  it('says so when the undo is rejected with an error result', async () => {
    h.updatePlanEntry.mockResolvedValueOnce({ error: null });
    const undo = await logAndGetUndo();
    h.updatePlanEntry.mockResolvedValueOnce({ error: { message: 'row level security' } });

    await undo.onClick();

    expect(h.toastError).toHaveBeenCalledWith("Couldn't undo that. Check the meal in the planner.");
  });
});

describe('the food journal "Still to log" card inside the shell', () => {
  it('opens the shell quick log on the meal tapped and logs against that entry', async () => {
    const today = toISODate(new Date());
    h.planEntries = [
      { id: 'breakfast-1', kid_id: 'k1', date: today, meal_slot: 'breakfast', food_id: 'f1', result: null },
      { id: 'dinner-1', kid_id: 'k1', date: today, meal_slot: 'dinner', food_id: 'f2', result: null },
    ];
    h.updatePlanEntry.mockResolvedValue({ error: null });
    // Tap the meal the clock would not preselect, so a dropped id fails at any hour.
    const byClock = buildQuickLogMeals(
      h.planEntries as unknown as PlanEntry[],
      [{ id: 'k1', name: 'Ada' }],
      [{ id: 'f1', name: 'porridge' }, { id: 'f2', name: 'fish pie' }],
      [],
      null,
      today,
      new Date()
    ).find((m) => m.preselected)?.id;
    const [targetId, targetFood] = byClock === 'dinner-1' ? ['breakfast-1', /porridge/] : ['dinner-1', /fish pie/];
    const user = userEvent.setup();
    renderShell('/dashboard/journal');

    await user.click(screen.getByRole('button', { name: new RegExp(`Log it: .*${targetFood.source}`) }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: targetFood })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(dialog).getByRole('button', { name: /Ate it!/ }));
    await waitFor(() => expect(h.updatePlanEntry).toHaveBeenCalled());
    expect(h.updatePlanEntry.mock.calls[0][0]).toBe(targetId);
    expect(h.updatePlanEntry.mock.calls[0][1]).toMatchObject({ result: 'ate' });
  });
});
