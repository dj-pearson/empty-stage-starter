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
  const onEdit = vi.fn();
  const onCompleteProfile = vi.fn();
  render(
    <MemoryRouter>
      <ChildProfileCard kid={kid} progress={withProgress} onEdit={onEdit} onCompleteProfile={onCompleteProfile} />
    </MemoryRouter>,
  );
  return { onEdit, onCompleteProfile };
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
    const chip = screen.getByText('broccoli');
    expect(chip.className).not.toMatch(/destructive/);
    expect(chip.className).toContain('text-muted-foreground');
    expect(screen.getByText(/Doesn't like right now/)).toBeInTheDocument();
  });

  it('skips an invalid profile_last_reviewed instead of throwing', async () => {
    setup({ ...maya, profile_last_reviewed: 'not-a-date' });
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });

  it("renders this week's progress for this child", () => {
    setup();
    expect(screen.getByText('Ate 5 · Tasted 2 · Refused 1')).toBeInTheDocument();
    expect(screen.getByText('Carrot')).toBeInTheDocument();
    expect(screen.getByText('Tiny taste')).toBeInTheDocument();
  });

  it('points at the ladder when no food is in progress', () => {
    setup(maya, { ...progress, activeLadder: [] });
    expect(screen.getByRole('link', { name: 'Pick a first food to work on' })).toHaveAttribute(
      'href',
      '/dashboard/food-chaining',
    );
  });

  it('asks for allergies when they were never recorded', async () => {
    const { onEdit } = setup({ id: 'k-leo', name: 'Leo' }, undefined);
    expect(screen.getByText('Allergies not recorded')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add allergies for Leo' }));
    expect(onEdit).toHaveBeenCalledWith('k-leo');
  });

  it('shows an explicit none for an empty allergy list', () => {
    setup({ id: 'k-leo', name: 'Leo', allergens: [] }, undefined);
    expect(screen.getByText('No known allergies')).toBeInTheDocument();
  });

  it('drives the completeness button from the first gap', async () => {
    const { onCompleteProfile } = setup({ id: 'k-leo', name: 'Leo', allergens: [] }, undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Add birthday' }));
    expect(onCompleteProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'k-leo' }));
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

  it('caps long chip lists behind Show all', async () => {
    const foods = Array.from({ length: 10 }, (_, i) => `food ${i + 1}`);
    setup({ ...maya, always_eats_foods: foods }, undefined);
    expect(screen.getByText('Always eats (10)')).toBeInTheDocument();
    expect(screen.queryByText('food 9')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all 10' }));
    expect(screen.getByText('food 10')).toBeInTheDocument();
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
