import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '@/i18n';
import '@/i18n/appLocale';
import type { Food, Kid, PlanEntry } from '@/types';
import type { LadderRow } from '@/hooks/useFoodLadder';
import type { PlanInsertResult } from '@/contexts/PlanContext';
import { localIsoDate } from '@/components/foodTracker/ladderDates';

// ---------------------------------------------------------------------------
// A tiny store standing in for the kids context, so a kid switch re-renders.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  type KidsState = {
    kids: Kid[];
    activeKidId: string | null;
    kidsHydrated: boolean;
    kidsLoadError: string | null;
  };
  let kidsState: KidsState = { kids: [], activeKidId: null, kidsHydrated: true, kidsLoadError: null };
  const listeners = new Set<() => void>();
  return {
    kids: {
      get: () => kidsState,
      set: (patch: Partial<KidsState>) => {
        kidsState = { ...kidsState, ...patch };
        listeners.forEach((l) => l());
      },
      subscribe: (l: () => void) => {
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      },
    },
    foods: [] as Food[],
    planEntries: [] as PlanEntry[],
    ladderByKid: new Map<string, LadderRow[]>(),
    addPlanEntries: vi.fn(),
    deletePlanEntries: vi.fn(),
    refreshKids: vi.fn(async () => {}),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    manualAddOverride: null as null | (() => unknown),
  };
});

vi.mock('@/contexts/AppContext', async () => {
  const React = await import('react');
  return {
    useKids: () => {
      const state = React.useSyncExternalStore(h.kids.subscribe, h.kids.get);
      return {
        ...state,
        setActiveKid: (id: string | null) => h.kids.set({ activeKidId: id }),
        setActiveKidId: (id: string | null) => h.kids.set({ activeKidId: id }),
        refreshKids: h.refreshKids,
      };
    },
    useFoods: () => ({ foods: h.foods, foodsHydrated: true }),
    usePlan: () => ({
      planEntries: h.planEntries,
      addPlanEntries: h.addPlanEntries,
      deletePlanEntries: h.deletePlanEntries,
    }),
    useRecipes: () => ({ recipes: [] }),
  };
});

const EMPTY_LADDER: LadderRow[] = [];
const reload = vi.fn(async () => {});
vi.mock('@/hooks/useFoodLadder', () => ({
  useFoodLadder: (kidId: string | null) => ({
    rows: (kidId && h.ladderByKid.get(kidId)) || EMPTY_LADDER,
    loading: false,
    error: null,
    reload,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: [], error: null })) },
}));

vi.mock('@/components/FeatureGate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('sonner', () => ({
  toast: { success: h.toastSuccess, error: h.toastError },
}));

vi.mock('@/lib/planAllergenGuard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/planAllergenGuard')>();
  return {
    ...actual,
    manualAddPrompt: (...args: Parameters<typeof actual.manualAddPrompt>) =>
      h.manualAddOverride ? h.manualAddOverride() : actual.manualAddPrompt(...args),
  };
});

import MealBuilder from '@/pages/MealBuilder';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const today = localIsoDate(new Date());

const TOAST: Food = { id: 'f-toast', name: 'Toast', category: 'carb', is_safe: true, is_try_bite: false, quantity: 1 };
const RICE: Food = { id: 'f-rice', name: 'Rice', category: 'carb', is_safe: true, is_try_bite: false, quantity: 1 };
const PB: Food = {
  id: 'f-pb',
  name: 'Peanut butter toast',
  category: 'protein',
  is_safe: true,
  is_try_bite: false,
  allergens: ['peanut'],
  quantity: 1,
};
const PEAS: Food = { id: 'f-peas', name: 'Peas', category: 'vegetable', is_safe: false, is_try_bite: true, quantity: 1 };
const APPLE: Food = { id: 'f-apple', name: 'Apple', category: 'fruit', is_safe: false, is_try_bite: false, quantity: 2 };

const AVA: Kid = {
  id: 'k-ava',
  name: 'Ava',
  allergens: ['peanuts'],
  allergen_severity: { peanuts: 'severe' },
};
const BEN: Kid = { id: 'k-ben', name: 'Ben', allergens: [] };

function ladderRow(kidId: string, food: Food): LadderRow {
  return {
    id: `row-${kidId}-${food.id}`,
    kidId,
    foodId: food.id,
    currentRung: 'tiny_taste',
    consecutiveSuccesses: 0,
    consecutiveHolds: 0,
    consecutiveRefusals: 0,
    status: 'active',
    nextDueOn: today,
    lastAttemptAt: null,
    pairedSafeFoodId: null,
    preferredPrep: null,
    preferredMealSlot: null,
    pausedReason: null,
  };
}

function renderPage(search = `?date=${today}&slot=dinner`) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/dashboard/meal-builder${search}`]}>
        <MealBuilder />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

const ok = (ids: string[]): PlanInsertResult => ({ error: null, insertedIds: ids });

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // no storage in this environment
  }
  h.kids.set({ kids: [AVA], activeKidId: AVA.id, kidsHydrated: true, kidsLoadError: null });
  h.foods = [TOAST, PB, PEAS, APPLE];
  h.planEntries = [];
  h.ladderByKid = new Map([
    [AVA.id, [ladderRow(AVA.id, PEAS)]],
    [BEN.id, [ladderRow(BEN.id, PEAS)]],
  ]);
  h.addPlanEntries.mockReset();
  h.addPlanEntries.mockResolvedValue(ok(['p1', 'p2', 'p3']));
  h.deletePlanEntries.mockReset();
  h.deletePlanEntries.mockResolvedValue({ error: null, removed: [] });
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
  h.manualAddOverride = null;
});

afterEach(() => {
  h.manualAddOverride = null;
});

async function findPlate() {
  return screen.findByRole('radiogroup', { name: /safe food/i });
}

describe('Meal Builder', () => {
  it('renders an h1 and no stars', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Build Ava's plate");
    await findPlate();
    expect(screen.queryByText(/stars?/i)).toBeNull();
  });

  it("never offers a sibling's is_safe food that carries this kid's allergen", async () => {
    renderPage();
    await findPlate();
    const radios = screen.getAllByRole('radio');
    expect(radios.some((r) => /Toast/.test(r.getAttribute('aria-label') ?? ''))).toBe(true);
    expect(radios.some((r) => /Peanut/.test(r.getAttribute('aria-label') ?? ''))).toBe(false);
    expect(screen.queryByRole('button', { name: /Peanut butter/ })).toBeNull();
    // It is listed as held back, with its reason.
    expect(screen.getByText(/Held back/)).toBeInTheDocument();
    expect(screen.getByText(/Peanut butter toast: contains peanut/i)).toBeInTheDocument();
  });

  it('shows the kid picker, not a dead end, with two kids and no active kid', () => {
    h.kids.set({ kids: [AVA, BEN], activeKidId: null });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Whose foods?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ava/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ben/ })).toBeInTheDocument();
    expect(screen.queryByText(/select a child/i)).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('saves the prefilled plate with one tap, the try bite under try_bite', async () => {
    renderPage();
    await findPlate();
    fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
    await waitFor(() => expect(h.addPlanEntries).toHaveBeenCalledTimes(1));
    const entries = h.addPlanEntries.mock.calls[0][0] as Array<Omit<PlanEntry, 'id'>>;
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kid_id: AVA.id, date: today, food_id: PEAS.id, meal_slot: 'try_bite' }),
        expect.objectContaining({ kid_id: AVA.id, date: today, food_id: TOAST.id, meal_slot: 'dinner' }),
      ]),
    );
    expect(entries.some((e) => e.food_id === PB.id)).toBe(false);
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('link', { name: 'See it on the Planner' })).toHaveAttribute(
      'href',
      expect.stringContaining(`date=${today}&slot=dinner`),
    );
    expect(screen.getByRole('link', { name: /How did the try bite go/ })).toHaveAttribute(
      'href',
      `/dashboard/food-tracker?log=${PEAS.id}`,
    );
  });

  it('keeps the plate and fires no success toast when the write fails', async () => {
    h.addPlanEntries.mockResolvedValue({ error: new Error('boom'), insertedIds: [] });
    renderPage();
    await findPlate();
    fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
    await waitFor(() => expect(h.addPlanEntries).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('meal-builder-live')).toHaveTextContent('Not saved. Your plate is still here.'),
    );
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /Toast, safe food/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('blocks the write on a severe manualAddPrompt', async () => {
    h.manualAddOverride = () => ({
      severe: true,
      lead: { kid: AVA, food: TOAST, allergen: 'peanut', severity: 'severe', severityRecorded: true },
      conflicts: [{ kid: AVA, food: TOAST, allergen: 'peanut', severity: 'severe', severityRecorded: true }],
    });
    renderPage();
    await findPlate();
    fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText("Toast can't go on Ava's plate")).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /anyway/i })).toBeNull();
    expect(h.addPlanEntries).not.toHaveBeenCalled();
  });

  it("says a kid's allergies are unknown when allergens is undefined", async () => {
    h.kids.set({ kids: [{ id: 'k-cy', name: 'Cy' }], activeKidId: 'k-cy' });
    renderPage();
    await findPlate();
    expect(screen.getByTestId('allergies-unknown')).toHaveTextContent(
      "Cy's allergies aren't recorded, so nothing here was checked against them.",
    );
  });

  it('exposes each zone as a radiogroup with aria-checked choices', async () => {
    renderPage();
    await findPlate();
    for (const name of ['Safe food', 'Try bite', 'Add a fruit']) {
      const group = screen.getByRole('radiogroup', { name });
      const radios = within(group).getAllByRole('radio');
      expect(radios.length).toBeGreaterThan(0);
      expect(radios.length).toBeLessThanOrEqual(3);
      for (const r of radios) expect(r).toHaveAttribute('aria-checked');
      expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    }
  });

  it('moves between choices with the arrow keys and picks with Space', async () => {
    h.foods = [TOAST, RICE, PB, PEAS, APPLE];
    renderPage();
    const group = await findPlate();
    const radios = within(group).getAllByRole('radio');
    expect(radios.length).toBe(2);
    const [first, second] = radios;
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(second);
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-checked', 'true');
  });

  it('remounts on a kid switch and drops the draft', async () => {
    h.kids.set({ kids: [AVA, BEN], activeKidId: AVA.id });
    h.foods = [TOAST, RICE, PB, PEAS, APPLE];
    renderPage();
    const group = await findPlate();
    const other = within(group)
      .getAllByRole('radio')
      .find((r) => r.getAttribute('aria-checked') === 'false');
    if (!other) throw new Error('expected a second safe choice');
    const otherName = other.getAttribute('aria-label') ?? '';
    fireEvent.click(other);
    expect(other).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Ben/ }));
    expect(await screen.findByRole('heading', { level: 2, name: "Ben's plate" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('meal-builder-live')).toHaveTextContent("Building Ben's plate"),
    );
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: "Ben's plate" }));

    fireEvent.click(screen.getByRole('button', { name: /Ava/ }));
    const again = await screen.findByRole('radiogroup', { name: /safe food/i });
    expect(within(again).getByRole('radio', { name: otherName })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: /Family/ })).toBeNull();
  });

  it('disables Save offline and keeps the draft on this device', async () => {
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      h.foods = [TOAST, RICE, PB, PEAS, APPLE];
      renderPage();
      const group = await findPlate();
      expect(screen.getByRole('button', { name: 'Add to plan' })).toBeDisabled();
      expect(screen.getByText(/You're offline/)).toBeInTheDocument();
      const other = within(group)
        .getAllByRole('radio')
        .find((r) => r.getAttribute('aria-checked') === 'false');
      if (!other) throw new Error('expected a second safe choice');
      fireEvent.click(other);
      const key = `mealBuilder:draft:${AVA.id}|${today}|dinner`;
      await waitFor(() => expect(localStorage.getItem(key)).toContain('"safe"'));
    } finally {
      onLine.mockRestore();
    }
  });
});

describe('Meal Builder draft key', () => {
  it('is removed on sign-out: it names a child and is not user-scoped', async () => {
    const { draftKey } = await import('@/components/KidMealBuilder');
    const { SCRUBBED_PREFIXES } = await import('@/lib/signOutScrub');
    const key = draftKey('kid-1', '2026-09-24', 'dinner');
    expect(SCRUBBED_PREFIXES.some((p) => key.startsWith(p))).toBe(true);
  });
});
