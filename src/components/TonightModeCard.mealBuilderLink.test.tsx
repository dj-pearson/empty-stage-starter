import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { Kid } from '@/types';

const h = vi.hoisted(() => ({ kids: [] as Kid[], activeKidId: null as string | null }));

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: [] }),
  useKids: () => ({ kids: h.kids, activeKidId: h.activeKidId }),
  useRecipes: () => ({ recipes: [] }),
  usePlan: () => ({ planEntries: [] }),
}));
vi.mock('@/lib/analytics', () => ({ analytics: { trackEvent: vi.fn() } }));
vi.mock('@/components/TonightSuggestionsDialog', () => ({ TonightSuggestionsDialog: () => null }));

import { TonightModeCard } from './TonightModeCard';

const maya: Kid = { id: 'kid-1', name: 'Maya', allergens: [] };
const leo: Kid = { id: 'kid-2', name: 'Leo', allergens: [] };

const renderCard = () =>
  render(
    <MemoryRouter>
      <TonightModeCard />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  h.kids = [maya, leo];
  h.activeKidId = null;
});

describe('TonightModeCard with no recipes', () => {
  it('links to Meal Builder, naming the active child', () => {
    h.activeKidId = 'kid-1';
    renderCard();
    expect(screen.getByRole('link', { name: 'Build a plate with Maya' })).toHaveAttribute('href', '/dashboard/meal-builder');
    expect(screen.getByRole('link', { name: 'Add a recipe' })).toBeInTheDocument();
  });

  it('uses the generic label when the plate is for more than one child', () => {
    renderCard();
    expect(screen.getByRole('link', { name: 'Build a plate in Meal Builder' })).toHaveAttribute(
      'href',
      '/dashboard/meal-builder',
    );
  });
});
