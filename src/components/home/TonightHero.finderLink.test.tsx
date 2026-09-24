/**
 * TonightHero's empty dinner state links into the Sibling Meal Finder, set to
 * tonight's dinner, only when there are two or more kids to feed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';

const state = { kids: [] as { id: string; name: string }[] };

vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({ kidsHydrated: true, kidsLoadError: null, refreshKids: vi.fn(), kids: state.kids }),
  useFoods: () => ({ foodsHydrated: true }),
}));
vi.mock('@/hooks/useTonightPlan', () => ({
  useTonightPlan: () => ({ todayKey: '2026-09-24', rows: [], anyDinner: false, allergenRows: [] }),
}));
vi.mock('@/components/TonightModeCard', () => ({ TonightModeCard: () => null }));
vi.mock('@/components/recipes/KidFitBadges', () => ({ KidFitBadges: () => null }));

import { TonightHero } from './TonightHero';

function renderHero() {
  return render(
    <MemoryRouter>
      <TonightHero />
    </MemoryRouter>
  );
}

beforeEach(() => {
  state.kids = [];
});

describe('TonightHero finder link', () => {
  it('links to the finder for tonight with two or more kids, secondary to Plan dinner', () => {
    state.kids = [
      { id: 'a', name: 'Ava' },
      { id: 'b', name: 'Ben' },
    ];
    renderHero();
    const link = screen.getByRole('link', { name: 'Find one everyone eats' });
    const href = new URL(link.getAttribute('href') ?? '', 'https://x.test');
    expect(href.pathname).toBe('/dashboard/sibling-meal-finder');
    expect(href.searchParams.get('date')).toBe('2026-09-24');
    expect(href.searchParams.get('slot')).toBe('dinner');
    expect(href.searchParams.get('from')).toBe('home_tonight');
    expect(screen.getByRole('link', { name: 'Plan dinner' })).toBeInTheDocument();
  });

  it('has no finder link with a single kid', () => {
    state.kids = [{ id: 'a', name: 'Ava' }];
    renderHero();
    expect(screen.queryByRole('link', { name: 'Find one everyone eats' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Plan dinner' })).toBeInTheDocument();
  });
});
