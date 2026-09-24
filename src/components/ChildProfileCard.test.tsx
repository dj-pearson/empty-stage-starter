import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { Kid } from '@/types';
import type { KidProgressSummary } from '@/lib/kidProgress';
import { ChildProfileCard } from './ChildProfileCard';

vi.mock('@/hooks/useSignedProfilePicture', () => ({
  useSignedProfilePicture: (src?: string) => src,
}));

const maya: Kid & { allergen_severity?: Record<string, string>; cross_contamination_sensitive?: boolean } = {
  id: 'k-maya',
  name: 'Maya',
  age: 4,
  allergens: ['peanuts', 'egg'],
  allergen_severity: { peanuts: 'severe' },
  cross_contamination_sensitive: true,
  always_eats_foods: ['toast'],
  disliked_foods: ['broccoli'],
  texture_dislikes: ['slimy'],
};

const progress: KidProgressSummary = {
  ate: 5,
  tasted: 2,
  refused: 1,
  offered: 8,
  newFoodsTried: 1,
  mastered: 0,
  activeLadder: [{ foodId: 'f1', foodName: 'Carrot', rung: 4 }],
};

function setup(kid: Kid = maya, withProgress: KidProgressSummary | undefined = progress) {
  const onEditSection = vi.fn();
  render(
    <MemoryRouter>
      <ChildProfileCard kid={kid} progress={withProgress} onEditSection={onEditSection} />
    </MemoryRouter>,
  );
  return { onEditSection };
}

describe('ChildProfileCard', () => {
  it('shows allergy chips with severity without switching tabs', () => {
    setup();
    const list = screen.getByRole('list', { name: 'Allergies for Maya' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual(['Peanuts (severe)', 'Egg', 'Cross-contact sensitive']);
    expect(items[0].className).toContain('bg-destructive');
  });

  it('does not style dislikes as a hazard', () => {
    setup();
    const row = screen.getByRole('button', { name: /Dislikes/ });
    expect(row).toHaveTextContent('broccoli');
    expect(row.innerHTML).not.toMatch(/destructive/);
  });

  it('skips an invalid profile_last_reviewed instead of throwing', () => {
    setup({ ...maya, profile_last_reviewed: 'not-a-date' });
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });

  it("renders this week's progress for this child", () => {
    setup();
    expect(screen.getByText('Ate 5 · Tasted 2 · Refused 1')).toBeInTheDocument();
    expect(screen.getByText('Carrot')).toBeInTheDocument();
    expect(screen.getByText('Tiny taste')).toBeInTheDocument();
  });

  it('points at Food Chaining for this child when no food is in progress', () => {
    setup(maya, { ...progress, activeLadder: [] });
    expect(screen.getByRole('link', { name: 'Pick a first food to work on' })).toHaveAttribute(
      'href',
      `/dashboard/food-chaining?kid=${encodeURIComponent(maya.id)}`,
    );
  });

  it('asks for allergies when they were never recorded, and opens the Allergies section', async () => {
    const { onEditSection } = setup({ id: 'k-leo', name: 'Leo' }, undefined);
    expect(screen.getByText('Allergies not recorded')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add allergies for Leo' }));
    expect(onEditSection).toHaveBeenCalledWith('k-leo', 'allergies');
  });

  it('shows an explicit none for an empty allergy list, with an edit button', async () => {
    const { onEditSection } = setup({ id: 'k-leo', name: 'Leo', allergens: [] }, undefined);
    expect(screen.getByText('No known allergies')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit allergies for Leo' }));
    expect(onEditSection).toHaveBeenCalledWith('k-leo', 'allergies');
  });

  it('drives the completeness button from the first gap, to the section that fills it', async () => {
    const { onEditSection } = setup({ id: 'k-leo', name: 'Leo', allergens: [] }, undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Add birthday' }));
    expect(onEditSection).toHaveBeenCalledWith('k-leo', 'basics');
  });

  it('sends the safe-foods gap to Always eats, which is what it counts', async () => {
    const { onEditSection } = setup({ id: 'k-leo', name: 'Leo', allergens: [], age: 5 }, undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Add foods they always eat' }));
    expect(onEditSection).toHaveBeenCalledWith('k-leo', 'alwaysEats');
  });

  it('opens one section per row, in editor order, each with its summary', async () => {
    const { onEditSection } = setup(
      {
        ...maya,
        favorite_foods: ['rice'],
        texture_sensitivity_level: 'mild',
        preferred_preparations: ['Roasted'],
        eating_behavior: 'limited',
        health_goals: ['More protein'],
        notes: 'Uses a small fork',
      },
      undefined,
    );
    const rows = within(screen.getByRole('list', { name: "Maya's profile" })).getAllByRole('button');
    expect(rows.map((r) => r.querySelector('.font-medium')?.textContent)).toEqual([
      'Basics',
      'Safe foods',
      'Always eats',
      'Dislikes',
      'Textures and sensory',
      'Eating behavior',
      'Goals',
      'Notes',
    ]);
    expect(rows[1]).toHaveTextContent('rice');
    expect(rows[2]).toHaveTextContent('toast');
    expect(rows[4]).toHaveTextContent('Texture sensitivity: Mild');
    expect(rows[4]).toHaveTextContent('Prepared: Roasted');
    expect(rows[5]).toHaveTextContent('Limited variety');
    expect(rows[6]).toHaveTextContent('More protein');
    expect(rows[7]).toHaveTextContent('Uses a small fork');
    expect(rows[0]).toHaveTextContent('Not added yet');

    await userEvent.click(rows[4]);
    expect(onEditSection).toHaveBeenCalledWith('k-maya', 'textures');
    await userEvent.click(screen.getByRole('button', { name: "Edit Maya's profile" }));
    expect(onEditSection).toHaveBeenLastCalledWith('k-maya', 'basics');
  });

  it('says months for a toddler and never "1 years old"', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 4, 9, 12));
    try {
      setup({ id: 'k-b', name: 'Bea', date_of_birth: '2024-11-09' }, undefined);
      expect(screen.getByText('18 months old')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('copies the care card when the share sheet is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup();
    await userEvent.click(screen.getByRole('button', { name: "Share Maya's care card" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Allergies: Peanuts (severe), Egg'));
  });
});
