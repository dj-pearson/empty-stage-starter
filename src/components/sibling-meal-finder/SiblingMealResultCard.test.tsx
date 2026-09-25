import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import '@/i18n';
import '@/i18n/appLocale';
import { SiblingMealResultCard } from './SiblingMealResultCard';
import type { SolverResult } from '@/lib/siblingConstraintSolver';
import type { Reconciled } from '@/lib/siblingMealFinder';
import type { KidPlate } from '@/lib/platePlanner';

type CardProps = ComponentProps<typeof SiblingMealResultCard>;

function makeResult(overrides: Partial<SolverResult> = {}): SolverResult {
  return {
    recipeId: 'r1',
    recipeName: 'Chicken pasta',
    imageUrl: null,
    prepMinutes: 20,
    resolutionType: 'full_match',
    satisfactionScore: 100,
    perKidSatisfaction: [
      { kidId: 'ava', kidName: 'Ava', score: 1, hardViolations: [], softViolations: [], favoriteHits: [] },
      { kidId: 'sam', kidName: 'Sam', score: 1, hardViolations: [], softViolations: [], favoriteHits: [] },
    ],
    swaps: [],
    splitPlates: [],
    excluded: false,
    ...overrides,
  };
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

const EVERYONE: Reconciled = { tier: 'everyone', usableKidIds: ['ava', 'sam'], blocked: [] };

function renderCard(props: Partial<CardProps> = {}) {
  const onUse = vi.fn();
  const onCook = vi.fn();
  const utils = render(
    <MemoryRouter>
      <SiblingMealResultCard
        result={makeResult()}
        reconciled={EVERYONE}
        uncheckedIngredients={[]}
        unknownAllergyKidNames={[]}
        slotText="dinner tonight"
        plannerHref="/dashboard/planner?date=2026-09-24&slot=dinner"
        onUse={onUse}
        onCook={onCook}
        {...props}
      />
    </MemoryRouter>
  );
  return { ...utils, onUse, onCook };
}

const primary = () => screen.queryByTestId('primary-use');

describe('SiblingMealResultCard tier', () => {
  it('some_blocked names the child, never says everyone, and plans only usable kids', () => {
    const { onUse } = renderCard({
      reconciled: {
        tier: 'some_blocked',
        usableKidIds: ['ava'],
        blocked: [
          { kidId: 'sam', kidName: 'Sam', allergen: 'peanut', copyKind: 'severe', cause: 'allergen' },
        ],
      },
    });
    expect(screen.getByText('Not for Sam')).toBeInTheDocument();
    expect(screen.queryByText('Works for everyone')).not.toBeInTheDocument();
    const btn = primary();
    expect(btn).not.toBeNull();
    expect(btn).toHaveTextContent(/Plan for Ava/);
    fireEvent.click(btn as HTMLElement);
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse.mock.calls[0][1]).toEqual(['ava']);
  });

  it('never shows "Works for everyone" when a plate is blocked or empty, even if reconciled says so', () => {
    renderCard({
      plates: [
        plate('ava', 'Ava'),
        plate('sam', 'Sam', {
          blocked: true,
          blockedBy: {
            kind: 'severe_allergen',
            copyKind: 'severeUnrated',
            componentName: 'Sauce',
            foodName: 'Peanut',
          },
        }),
      ],
    });
    expect(screen.queryByText('Works for everyone')).not.toBeInTheDocument();
    expect(screen.getByText('Not for Sam')).toBeInTheDocument();
    fireEvent.click(primary() as HTMLElement);
  });

  it('tier none renders no primary button', () => {
    renderCard({ reconciled: { tier: 'none', usableKidIds: [], blocked: [] } });
    expect(primary()).toBeNull();
    expect(screen.getByRole('button', { name: /Cook now/ })).toBeEnabled();
  });

  it('tier unverified lists the unchecked ingredient names and links to the recipe', () => {
    renderCard({
      reconciled: { tier: 'unverified', usableKidIds: ['ava', 'sam'], blocked: [] },
      uncheckedIngredients: ['Mystery sauce', 'Crunchy topping'],
      recipeHref: '/dashboard/recipes/r1',
    });
    expect(screen.getByText('Check 2 ingredients')).toBeInTheDocument();
    expect(screen.getByText(/Mystery sauce and Crunchy topping/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Link ingredients' })).toHaveAttribute(
      'href',
      '/dashboard/recipes/r1'
    );
    expect(screen.queryByText('Works for everyone')).not.toBeInTheDocument();
  });

  it('with_changes counts swaps and plate changes', () => {
    renderCard({
      reconciled: { tier: 'with_changes', usableKidIds: ['ava', 'sam'], blocked: [] },
      result: makeResult({
        swaps: [
          {
            kidId: 'sam',
            kidName: 'Sam',
            swapOutFoodId: 'f1',
            swapOutFoodName: 'Broccoli',
            swapInFoodId: 'f2',
            swapInFoodName: 'Peas',
            reason: '',
          },
        ],
      }),
    });
    expect(screen.getByText('1 change')).toBeInTheDocument();
    expect(screen.getByText('swap Broccoli for Peas')).toBeInTheDocument();
  });
});

describe('SiblingMealResultCard button states', () => {
  it('isPending disables the button and marks it busy', () => {
    renderCard({ isPending: true });
    const btn = primary();
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('isAccepted renders a link to plannerHref and no submit button', () => {
    renderCard({ isAccepted: true });
    expect(primary()).toBeNull();
    const link = screen.getByRole('link', { name: /On the plan, dinner tonight/ });
    expect(link).toHaveAttribute('href', '/dashboard/planner?date=2026-09-24&slot=dinner');
  });

  it('disabledReason soft-disables planning, shows the reason and keeps Cook now enabled', () => {
    const { onUse, onCook } = renderCard({ disabledReason: "You're offline" });
    const btn = primary() as HTMLElement;
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(onUse).not.toHaveBeenCalled();
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    const cook = screen.getByRole('button', { name: /Cook now/ });
    expect(cook).toBeEnabled();
    fireEvent.click(cook);
    expect(onCook).toHaveBeenCalledTimes(1);
  });

  it('carries the slot in the visible label', () => {
    renderCard();
    expect(primary()).toHaveTextContent('Plan for dinner tonight');
  });
});

describe('SiblingMealResultCard plates', () => {
  const splitResult = makeResult({
    resolutionType: 'split_plate',
    splitPlates: [
      { kidId: 'sam', kidName: 'Sam', plateDescription: 'Same dish, hold the cheese', modifications: ['hold the cheese'] },
    ],
  });
  const changes: Reconciled = { tier: 'with_changes', usableKidIds: ['ava', 'sam'], blocked: [] };

  it('platesLoading shows the skeleton and disables Use', () => {
    renderCard({ platesLoading: true });
    expect(screen.getByTestId('plates-loading')).toBeInTheDocument();
    expect(primary()).toBeDisabled();
  });

  it('shows the split-plate box without plates and hides it when plates are present', () => {
    const { unmount } = renderCard({ result: splitResult, reconciled: changes });
    expect(screen.getByTestId('split-plate-box')).toBeInTheDocument();
    unmount();
    renderCard({
      result: splitResult,
      reconciled: changes,
      plates: [plate('ava', 'Ava'), plate('sam', 'Sam')],
    });
    expect(screen.queryByTestId('split-plate-box')).not.toBeInTheDocument();
  });

  it('platesError shows the line and blocks planning for an unverified dish', () => {
    renderCard({
      platesError: true,
      reconciled: { tier: 'unverified', usableKidIds: ['ava', 'sam'], blocked: [] },
      unknownAllergyKidNames: ['Sam'],
    });
    expect(screen.getByText('Plate check unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Plan anyway/)).not.toBeInTheDocument();
    expect(primary()).toBeDisabled();
  });

  it('platesError blocks planning a dish that needs changes, but not one that works as is', () => {
    const { unmount } = renderCard({ platesError: true, reconciled: changes });
    expect(primary()).toBeDisabled();
    unmount();
    renderCard({ platesError: true });
    expect(primary()).not.toBeDisabled();
  });

  it('shows each child once', () => {
    renderCard({
      result: makeResult({
        swaps: [
          {
            kidId: 'sam',
            kidName: 'Sam',
            swapOutFoodId: 'f1',
            swapOutFoodName: 'Broccoli',
            swapInFoodId: 'f2',
            swapInFoodName: 'Peas',
            reason: '',
          },
        ],
      }),
      reconciled: changes,
    });
    expect(screen.getAllByTestId(/^kid-row-/)).toHaveLength(2);
    expect(screen.getByTestId('kid-row-sam')).toHaveAttribute('data-status', 'changed');
    expect(screen.getByTestId('kid-row-ava')).toHaveAttribute('data-status', 'as_is');
  });

  it('uses no raw palette classes', () => {
    const { container } = renderCard({
      result: splitResult,
      reconciled: changes,
      uncheckedIngredients: ['x'],
      platesError: true,
    });
    const offenders = Array.from(container.querySelectorAll('[class]')).filter((el) =>
      /emerald|amber|orange|rose/.test(el.getAttribute('class') ?? '')
    );
    expect(offenders).toHaveLength(0);
  });
});

describe('SiblingMealResultCard compact', () => {
  it('expands to the full body on tap', () => {
    renderCard({ variant: 'compact' });
    const toggle = screen.getByRole('button', { expanded: false });
    expect(primary()).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(primary()).not.toBeNull();
  });
});
