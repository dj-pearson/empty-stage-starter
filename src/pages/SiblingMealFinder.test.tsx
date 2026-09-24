import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '@/i18n';
import '@/i18n/appLocale';
import type { Food, Kid, MealSlot, PlanEntry, Recipe } from '@/types';
import type { KidPlate } from '@/lib/platePlanner';
import type { ScheduleRecipeResult } from '@/contexts/PlanContext';
import type { SiblingScheduleGuardResult } from '@/lib/siblingSchedule';
import { findSiblingMeals } from '@/lib/siblingMealFinder';

// ---- shared, mutable mock state ------------------------------------------
const h = vi.hoisted(() => ({
  kids: [] as Kid[],
  foods: [] as Food[],
  recipes: [] as Recipe[],
  planEntries: [] as PlanEntry[],
  platesByRecipe: new Map<string, KidPlate[]>(),
  online: true,
  schedule: vi.fn(),
  recordResolution: vi.fn(),
  guardOverride: null as null | ((kidIds: string[]) => SiblingScheduleGuardResult),
}));

vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({ kids: h.kids, kidsHydrated: true }),
  useFoods: () => ({ foods: h.foods }),
  useRecipes: () => ({ recipes: h.recipes }),
  usePlan: () => ({ planEntries: h.planEntries }),
}));

vi.mock('@/hooks/useSiblingResolutions', () => ({
  useSiblingResolutions: () => ({
    householdId: 'hh1',
    history: [],
    loading: false,
    recordResolution: h.recordResolution,
  }),
}));

vi.mock('@/hooks/useRecipeQuickPlan', () => ({
  useRecipeQuickPlan: () => ({ schedule: h.schedule, planTonight: vi.fn() }),
  defaultPlanSlot: (): MealSlot => 'dinner',
  weekdayLabel: () => 'Wednesday',
}));

vi.mock('@/hooks/useRecipePlates', () => ({
  useRecipePlates: () => ({ platesByRecipe: h.platesByRecipe, loading: false, error: false }),
}));

vi.mock('@/hooks/useCommon', () => ({
  useOnline: () => h.online,
}));

vi.mock('@/components/TonightCookDialog', () => ({
  TonightCookDialog: () => null,
}));

vi.mock('@/lib/analytics', () => ({
  analytics: { trackEvent: vi.fn() },
}));

vi.mock('@/lib/siblingSchedule', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/siblingSchedule')>();
  return {
    ...actual,
    siblingScheduleGuard: (args: Parameters<typeof actual.siblingScheduleGuard>[0]) =>
      h.guardOverride
        ? h.guardOverride(args.kids.map((k) => k.id))
        : actual.siblingScheduleGuard(args),
  };
});

import SiblingMealFinder from './SiblingMealFinder';

// ---- fixtures --------------------------------------------------------------
function kid(id: string, name: string, over: Partial<Kid> = {}): Kid {
  return { id, name, allergens: [], allergen_severity: {}, ...over } as Kid;
}

function food(id: string, name: string, allergens: string[] = []): Food {
  return { id, name, category: 'protein', is_safe: true, is_try_bite: false, allergens } as Food;
}

function recipe(id: string, name: string, food_ids: string[]): Recipe {
  return { id, name, food_ids } as Recipe;
}

function plate(kidId: string, kidName: string, over: Partial<KidPlate> = {}): KidPlate {
  return {
    kidId,
    kidName,
    placements: [],
    onPlate: [],
    separated: [],
    heldBack: [],
    exposure: null,
    blocked: false,
    blockedBy: null,
    isEmpty: false,
    ...over,
  };
}

function scheduleResult(over: Partial<ScheduleRecipeResult>): ScheduleRecipeResult {
  return { error: null, succeeded: [], failed: [], rows: [], ...over };
}

function entry(id: string, kidId: string, recipeId: string, date: string, slot: MealSlot, primary = false): PlanEntry {
  return {
    id,
    kid_id: kidId,
    date,
    meal_slot: slot,
    food_id: 'f1',
    result: null,
    recipe_id: recipeId,
    is_primary_dish: primary,
  } as PlanEntry;
}

const AVA = kid('a', 'Ava');
const BEN = kid('b', 'Ben');
const CAL = kid('c', 'Cal', { allergens: ['peanut'], allergen_severity: { peanut: 'severe' } });

function tree(url = '/dashboard/sibling-meal-finder') {
  return (
    <HelmetProvider>
      <MemoryRouter initialEntries={[url]}>
        <SiblingMealFinder />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function renderPage(url?: string) {
  return render(tree(url));
}

function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  localStorage.clear();
  h.kids = [AVA, BEN, CAL];
  h.foods = [
    food('f1', 'Pasta'),
    food('f2', 'Chicken'),
    food('f3', 'Peanut sauce', ['peanut']),
    food('f4', 'Rice'),
    food('f5', 'Broccoli'),
  ];
  h.recipes = [recipe('r1', 'Chicken pasta', ['f1', 'f2'])];
  h.planEntries = [];
  h.platesByRecipe = new Map();
  h.online = true;
  h.guardOverride = null;
  h.schedule = vi.fn(async () => scheduleResult({ succeeded: ['a', 'b', 'c'] }));
  h.recordResolution = vi.fn(async () => true);
});

describe('SiblingMealFinder', () => {
  it('shows a hero on mount with no button tap', () => {
    h.recipes = [recipe('r1', 'Chicken pasta', ['f1', 'f2']), recipe('r2', 'Rice bowl', ['f4', 'f5'])];
    renderPage();
    const hero = screen.getByTestId('hero');
    expect(within(hero).getByText(/Chicken pasta|Rice bowl/)).toBeInTheDocument();
    expect(within(hero).getByTestId('primary-use')).toBeInTheDocument();
  });

  it('records the resolution only for the kids that were planned, with the primary row', async () => {
    h.schedule = vi.fn(async () =>
      scheduleResult({
        succeeded: ['a'],
        failed: ['b'],
        rows: [entry('pe1', 'a', 'r1', todayIsoLocal(), 'dinner'), entry('pe2', 'a', 'r1', todayIsoLocal(), 'dinner', true)],
      })
    );
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('primary-use'));
    });
    expect(h.schedule).toHaveBeenCalledTimes(1);
    expect(h.recordResolution).toHaveBeenCalledWith(
      expect.objectContaining({ selectedKidIds: ['a'], planEntryId: 'pe2' })
    );
  });

  it('does not record a resolution when nothing was planned', async () => {
    h.schedule = vi.fn(async () => scheduleResult({ succeeded: [], failed: ['a', 'b', 'c'] }));
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('primary-use'));
    });
    expect(h.schedule).toHaveBeenCalledTimes(1);
    expect(h.recordResolution).not.toHaveBeenCalled();
  });

  it('plans only for the usable kids when a plate is blocked', async () => {
    h.platesByRecipe = new Map([
      [
        'r1',
        [
          plate('a', 'Ava'),
          plate('b', 'Ben'),
          plate('c', 'Cal', {
            blocked: true,
            blockedBy: { kind: 'cannot_hold_back', componentName: 'Sauce' },
          } as Partial<KidPlate>),
        ],
      ],
    ]);
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('primary-use'));
    });
    expect(h.schedule).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), expect.any(String), 'dinner', ['a', 'b']);
  });

  it('drops a kid the schedule guard blocks and says why', async () => {
    h.guardOverride = (kidIds) => ({
      schedule: kidIds.filter((id) => id !== 'b'),
      blocked: [{ kid: BEN, allergen: 'peanut', copyKind: 'severeUnrated', cause: 'allergen' }],
      noFoods: false,
    });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('primary-use'));
    });
    expect(h.schedule).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'dinner', ['a', 'c']);
    expect(
      screen.getByText('Not planned for Ben: peanut, severity not recorded (treated as severe)')
    ).toBeInTheDocument();
  });

  it('does not write a recipe with no linked foods, and says so', async () => {
    h.recipes = [recipe('r9', 'Mystery stew', [])];
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('primary-use'));
    });
    expect(h.schedule).not.toHaveBeenCalled();
    expect(screen.getByText(/This recipe has no linked foods yet/)).toBeInTheDocument();
  });

  it('schedules once on a double tap, then shows the planner link until the slot changes', async () => {
    let resolve: (r: ScheduleRecipeResult) => void = () => {};
    h.schedule = vi.fn(
      () =>
        new Promise<ScheduleRecipeResult>((r) => {
          resolve = r;
        })
    );
    const { rerender } = renderPage();
    const button = screen.getByTestId('primary-use');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(h.schedule).toHaveBeenCalledTimes(1);

    const date = todayIsoLocal();
    const rows = ['a', 'b', 'c'].map((k, i) => entry(`pe${i}`, k, 'r1', date, 'dinner', true));
    await act(async () => {
      resolve(scheduleResult({ succeeded: ['a', 'b', 'c'], rows }));
    });
    h.planEntries = rows;
    rerender(tree());
    expect(screen.queryByTestId('primary-use')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /On the plan/ })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('controls-summary'));
    fireEvent.click(screen.getByRole('radio', { name: 'Lunch' }));
    expect(screen.getByTestId('primary-use')).toBeInTheDocument();
  });

  it('keeps Cook now while offline and does not plan', async () => {
    h.online = false;
    renderPage();
    const use = screen.getByTestId('primary-use');
    expect(use).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(use);
    });
    expect(h.schedule).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Cook now/ })).toBeEnabled();
  });

  it('preselects date, slot and kids from a deep link', () => {
    renderPage('/dashboard/sibling-meal-finder?date=2026-09-30&slot=lunch&kids=a,b');
    const chipA = screen.getByRole('button', { name: /^Ava/ });
    const chipB = screen.getByRole('button', { name: /^Ben/ });
    const chipC = screen.getByRole('button', { name: /^Cal/ });
    expect(chipA).toHaveAttribute('data-state', 'on');
    expect(chipB).toHaveAttribute('data-state', 'on');
    expect(chipC).toHaveAttribute('data-state', 'off');
    expect(screen.getByTestId('controls-summary')).toHaveTextContent('Lunch');
  });

  it('falls back to the default slot for a bogus one', () => {
    renderPage('/dashboard/sibling-meal-finder?slot=bogus');
    expect(screen.getByTestId('controls-summary')).toHaveTextContent('Dinner');
  });

  it('counts from one array: header equals hero plus other options, exclusions equal excluded results', () => {
    h.recipes = [
      recipe('r1', 'Chicken pasta', ['f1', 'f2']),
      recipe('r2', 'Rice bowl', ['f4', 'f5']),
      recipe('r3', 'Chicken rice', ['f2', 'f4']),
      recipe('r4', 'Pasta and broccoli', ['f1', 'f5']),
      recipe('r5', 'Satay noodles', ['f1', 'f3']),
      recipe('r6', 'Peanut chicken', ['f2', 'f3']),
    ];
    renderPage();
    const count = Number(screen.getByTestId('result-count').getAttribute('data-count'));
    const others = screen.queryByTestId('other-options');
    const otherCards = others ? within(others).getAllByRole('button', { expanded: false }).length : 0;
    expect(count).toBe(1 + otherCards);
    expect(count).toBe(4);

    const excluded = findSiblingMeals({
      recipes: h.recipes,
      foods: h.foods,
      kids: h.kids,
      selectedKidIds: ['a', 'b', 'c'],
      history: [],
      options: { limit: Infinity },
    }).filter((r) => r.excluded).length;
    expect(screen.getByTestId('exclusions-toggle')).toHaveTextContent(`Ruled out for safety (${excluded})`);
    expect(excluded).toBe(2);
  });
});
