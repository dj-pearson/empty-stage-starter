import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { addIsoDays } from '@/lib/date-utils';
import type { Food, Kid, PlanEntry } from '@/types';

const TODAY = '2026-09-24'; // a Thursday

const state = vi.hoisted(() => ({ foods: [] as Food[], entries: [] as PlanEntry[] }));

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: state.foods }),
  usePlan: () => ({ planEntries: state.entries }),
}));

import { AllergyCheckSection } from './AllergyCheckSection';

function renderSection(kid: Kid) {
  return render(
    <MemoryRouter>
      <AllergyCheckSection kid={kid} todayIso={TODAY} />
    </MemoryRouter>,
  );
}

const pb: Food = {
  id: 'pb',
  name: 'Peanut butter toast',
  category: 'protein',
  is_safe: false,
  is_try_bite: false,
  allergens: ['en:peanuts'],
};

describe('AllergyCheckSection', () => {
  it('renders the unknown copy, not "No known allergies", when allergens are undefined', () => {
    state.foods = [pb];
    state.entries = [];
    renderSection({ id: 'k1', name: 'Maya' });
    expect(screen.getByText(/Allergies not recorded for Maya/)).toBeInTheDocument();
    expect(screen.queryByText(/No known allergies/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record allergies' })).toHaveAttribute(
      'href',
      '/dashboard/kids?kid=k1&section=allergies',
    );
    expect(document.body.textContent).not.toMatch(/automatically exclude/i);
  });

  it('renders a weekday line for a planned conflicting food', () => {
    state.foods = [pb];
    state.entries = [
      { id: 'p1', kid_id: 'k1', date: addIsoDays(TODAY, 2), meal_slot: 'lunch', food_id: 'pb', result: null },
    ];
    renderSection({
      id: 'k1',
      name: 'Maya',
      allergens: ['peanuts'],
      allergen_severity: { peanuts: 'severe' },
      cross_contamination_sensitive: true,
    });
    expect(screen.getByText('Peanut butter toast on Saturday lunch contains peanuts')).toBeInTheDocument();
    expect(screen.getByLabelText('peanuts, severe allergy')).toBeInTheDocument();
    expect(screen.getByText('Sensitive to cross-contact')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/automatically exclude/i);
  });

  it('says what it could not check instead of reading as clear', () => {
    state.foods = [];
    state.entries = [
      { id: 'p1', kid_id: 'k1', date: addIsoDays(TODAY, 1), meal_slot: 'dinner', food_id: 'gone', result: null },
    ];
    renderSection({ id: 'k1', name: 'Maya', allergens: ['sesame'] });
    expect(screen.getByText('1 planned item could not be checked.')).toBeInTheDocument();
  });

  it('shows "No known allergies" for an empty list', () => {
    state.entries = [];
    renderSection({ id: 'k1', name: 'Maya', allergens: [] });
    expect(screen.getByText(/No known allergies/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute(
      'href',
      '/dashboard/kids?kid=k1&section=allergies',
    );
  });
});
