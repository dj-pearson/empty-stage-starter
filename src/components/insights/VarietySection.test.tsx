import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { addIsoDays } from '@/lib/date-utils';
import type { Food, GroceryItem, Kid, PlanEntry } from '@/types';

const TODAY = '2026-09-24';

const state = vi.hoisted(() => ({
  foods: [] as Food[],
  entries: [] as PlanEntry[],
  grocery: [] as GroceryItem[],
  addGroceryItem: vi.fn(),
  deleteGroceryItem: vi.fn(),
}));

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: state.foods }),
  usePlan: () => ({ planEntries: state.entries }),
  useRecipes: () => ({ recipes: [] }),
  useGrocery: () => ({
    groceryItems: state.grocery,
    addGroceryItem: state.addGroceryItem,
    deleteGroceryItem: state.deleteGroceryItem,
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

import { VarietySection } from './VarietySection';

const kid: Kid = { id: 'k1', name: 'Maya', allergens: [] };

function food(id: string, category: Food['category'], quantity = 0): Food {
  return { id, name: id, category, is_safe: false, is_try_bite: false, allergens: [], quantity };
}

let seq = 0;
function row(food_id: string, result: PlanEntry['result'], daysAgo = 1): PlanEntry {
  seq += 1;
  return { id: `p${seq}`, kid_id: 'k1', date: addIsoDays(TODAY, -daysAgo), meal_slot: 'dinner', food_id, result };
}

function renderSection() {
  return render(
    <MemoryRouter>
      <VarietySection kid={kid} todayIso={TODAY} />
    </MemoryRouter>,
  );
}

describe('VarietySection', () => {
  beforeEach(() => {
    state.addGroceryItem.mockReset();
    state.grocery = [];
    state.foods = [
      food('Chicken', 'protein', 3),
      food('Rice', 'carb', 3),
      food('Yogurt', 'dairy', 3),
      food('Apple', 'fruit', 3),
      food('Chips', 'snack', 3),
      food('Broccoli', 'vegetable', 0),
    ];
    state.entries = [
      row('Chicken', 'ate'),
      row('Rice', 'tasted'),
      row('Yogurt', 'ate'),
      row('Apple', 'refused'),
      row('Chips', 'ate'),
    ];
  });

  it('has no snack row and no percentage text', () => {
    renderSection();
    const section = document.getElementById('insights-variety');
    expect(section).not.toBeNull();
    expect(section?.textContent).not.toContain('%');
    expect(screen.queryByText(/snack/i)).not.toBeInTheDocument();
    expect(screen.getByText('Protein')).toBeInTheDocument();
    expect(screen.getByText('Protein').closest('li')).toHaveTextContent('1 eaten or tasted of 1 offered');
  });

  it("shows 'Not offered in 4 weeks' for a never-offered group", () => {
    renderSection();
    const veg = screen.getByText('Vegetables').closest('li');
    expect(veg).toHaveTextContent('Not offered in 4 weeks');
  });

  it("calls addGroceryItem from 'Add to list'", () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Add Broccoli to the grocery list/ }));
    expect(state.addGroceryItem).toHaveBeenCalledTimes(1);
    expect(state.addGroceryItem.mock.calls[0][0]).toMatchObject({ name: 'Broccoli', added_via: 'pantry' });
  });

  it('tags an in-stock easy add as in the pantry', () => {
    state.foods = [...state.foods, food('Carrot', 'vegetable', 4)];
    renderSection();
    const chip = screen.getByText('Carrot').closest('li');
    expect(chip).toHaveTextContent('In pantry');
  });
});
