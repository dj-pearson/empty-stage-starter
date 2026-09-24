import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import React from 'react';
import '@/i18n';
import type { MealSlot } from '@/types';

/**
 * The phone layout. Save as Template and Use Template used to pass props none
 * of the dialogs accepted (weekStart/onApply), and the missing-ingredients
 * dialog was only mounted in the desktop return, so a recipe scheduled on a
 * phone never offered to fill the gap.
 */

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('max-width: 1023px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

const KID = { id: 'kid-1', name: 'Robin', date_of_birth: '2020-01-01', allergens: [] };
const FOODS = [
  { id: 'rice', name: 'Rice', category: 'carb', unit: 'cup', is_safe: true, is_try_bite: false, quantity: 4 },
];
const RECIPE = {
  id: 'rec-1',
  name: 'Saffron rice',
  food_ids: ['rice'],
  recipe_ingredients: [
    { id: 'ing-1', recipe_id: 'rec-1', sort_order: 0, name: 'Saffron', quantity: 1, unit: 'pinch' },
  ],
};

const scheduleRecipe = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: FOODS, updateFood: vi.fn() }),
  useGrocery: () => ({ addGroceryItemsMerged: vi.fn().mockReturnValue(1), deleteGroceryItems: vi.fn() }),
  useKids: () => ({ kids: [KID], activeKidId: 'kid-1', setActiveKid: vi.fn() }),
  useRecipes: () => ({ recipes: [RECIPE] }),
  usePlan: () => ({
    planEntries: [],
    setPlanEntries: vi.fn(),
    updatePlanEntry: vi.fn(),
    addPlanEntry: vi.fn(),
    addPlanEntries: vi.fn(),
    copyWeekPlan: vi.fn(),
    deleteWeekPlan: vi.fn(),
    deletePlanEntries: vi.fn(),
    movePlanEntries: vi.fn(),
    replaceSlot: vi.fn(),
    replaceWeekPlan: vi.fn(),
    scheduleRecipe,
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ userId: null, householdId: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@/lib/mealPlanTemplatesApi', () => ({
  listTemplates: vi.fn().mockResolvedValue({ data: [], error: null }),
  saveWeekAsTemplate: vi.fn().mockResolvedValue({ data: null, error: null }),
  applyTemplate: vi.fn().mockResolvedValue({ data: null, error: null }),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));
vi.mock('@/lib/logger', () => {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withContext: () => logger };
  return { logger };
});
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
const GROCERY = { preview: () => ({ toAdd: 0, alreadyHave: 0, onList: 0 }), push: vi.fn() };
vi.mock('@/hooks/usePlanToGrocery', () => ({ usePlanToGrocery: () => GROCERY }));
vi.mock('@/components/VarietyFatigueBanner', () => ({ VarietyFatigueBanner: () => null }));
vi.mock('@/components/GSAPCalendarMealPlanner', () => ({ GSAPCalendarMealPlanner: () => <div>desktop-grid</div> }));

interface MobileStubProps {
  onSaveTemplate?: () => void;
  onOpenTemplateGallery?: () => void;
  onSelectRecipeForKids?: (recipeId: string, date: string, slot: MealSlot, kidIds: string[]) => void;
}
vi.mock('@/components/meal-planner/MobileMealPlanner', () => ({
  MobileMealPlanner: (p: MobileStubProps) => (
    <div>
      <button onClick={() => p.onSaveTemplate?.()}>mobile-save-template</button>
      <button onClick={() => p.onOpenTemplateGallery?.()}>mobile-use-template</button>
      <button onClick={() => p.onSelectRecipeForKids?.('rec-1', '2026-09-22', 'dinner', ['kid-1'])}>
        mobile-schedule-recipe
      </button>
    </div>
  ),
}));

import Planner from './Planner';

const renderPlanner = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <Planner />
      </MemoryRouter>
    </HelmetProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  scheduleRecipe.mockResolvedValue({ error: null, succeeded: ['kid-1'], failed: [] });
});

describe('Planner on a phone', () => {
  it('renders the mobile layout', async () => {
    renderPlanner();
    expect(await screen.findByRole('button', { name: 'mobile-save-template' })).toBeInTheDocument();
    expect(screen.queryByText('desktop-grid')).not.toBeInTheDocument();
  });

  it('opens Save as Template without throwing', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(await screen.findByRole('button', { name: 'mobile-save-template' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('opens Use Template without throwing, and fires no toast without an apply', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(await screen.findByRole('button', { name: 'mobile-use-template' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('scheduling a recipe with a shortfall opens the missing-ingredients dialog', async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(await screen.findByRole('button', { name: 'mobile-schedule-recipe' }));

    await waitFor(() => expect(scheduleRecipe).toHaveBeenCalledWith('rec-1', '2026-09-22', 'dinner', ['kid-1']));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/Missing ingredients/);
    expect(dialog.textContent).toMatch(/Saffron rice/);
    // One toast for the scheduling, not one per child.
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });
});
