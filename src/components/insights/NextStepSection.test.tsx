import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { addIsoDays } from '@/lib/date-utils';
import type { KidsProgressData } from '@/hooks/useKidsProgressSummary';
import type { Food, Kid, PlanEntry } from '@/types';

const TODAY = '2026-09-24';

const state = vi.hoisted(() => ({
  flag: false,
  entries: [] as PlanEntry[],
  foods: [] as Food[],
}));

vi.mock('@/contexts/AppContext', () => ({
  usePlan: () => ({ planEntries: state.entries }),
  useFoods: () => ({ foods: state.foods }),
}));
vi.mock('@/hooks/useFeatureFlag', () => ({
  useFeatureFlag: () => state.flag,
}));

import { NextStepSection } from './NextStepSection';

const kid: Kid = { id: 'k1', name: 'Maya', allergens: [] };
const food = (id: string, name: string, over: Partial<Food> = {}): Food => ({
  id,
  name,
  category: 'vegetable',
  is_safe: false,
  is_try_bite: true,
  ...over,
});

const ready: KidsProgressData = { ladderRows: [], attempts: [], loading: false, error: false };

function renderSection(props: Partial<Parameters<typeof NextStepSection>[0]> = {}) {
  return render(
    <MemoryRouter>
      <NextStepSection kid={kid} todayIso={TODAY} progress={ready} {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.flag = false;
  state.entries = [];
  state.foods = [food('f-peas', 'Peas'), food('f-kiwi', 'Kiwi')];
});

describe('NextStepSection', () => {
  it('names a stalled ladder food and links to Food Tracker when the ladder is on', () => {
    state.flag = true;
    const progress: KidsProgressData = {
      ...ready,
      ladderRows: [
        { kid_id: 'k1', food_id: 'f-kiwi', status: 'active', current_rung: 'full_portion', consecutive_successes: 1 },
        {
          kid_id: 'k1',
          food_id: 'f-peas',
          status: 'active',
          current_rung: 'touching',
          consecutive_holds: 3,
          next_due_on: TODAY,
        },
        { kid_id: 'k2', food_id: 'f-kiwi', status: 'active', current_rung: 'looking', consecutive_holds: 5 },
      ],
    };
    renderSection({ progress });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('One thing to try next');
    expect(screen.getByText(/Peas has stayed at Touching for a few tries/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Food Tracker/ })).toHaveAttribute('href', '/dashboard/food-tracker');
  });

  it('offers to plan a tasted try bite when the ladder is off', () => {
    state.entries = [
      { id: 'e1', kid_id: 'k1', food_id: 'f-kiwi', date: addIsoDays(TODAY, -3), meal_slot: 'dinner', result: 'tasted' },
      // Future and outside-window rows never count.
      { id: 'e2', kid_id: 'k1', food_id: 'f-peas', date: addIsoDays(TODAY, 2), meal_slot: 'dinner', result: 'tasted' },
      { id: 'e3', kid_id: 'k1', food_id: 'f-peas', date: addIsoDays(TODAY, -40), meal_slot: 'dinner', result: 'tasted' },
    ];
    renderSection();
    expect(screen.getByText(/Maya tasted Kiwi last time/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Plan it this week/ })).toHaveAttribute('href', '/dashboard/planner');
  });

  it('points to Food Tracker when there is nothing to pick', () => {
    renderSection();
    expect(screen.getByText(/Nothing queued to try yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a try bite in Food Tracker' })).toHaveAttribute(
      'href',
      '/dashboard/food-tracker',
    );
  });

  it('shows a skeleton while progress loads, never the empty line', () => {
    state.flag = true;
    renderSection({ progress: { ...ready, loading: true } });
    expect(screen.getByTestId('next-step-loading')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing queued/)).not.toBeInTheDocument();
  });

  it('renders the same text across a rerender', () => {
    state.flag = true;
    const progress: KidsProgressData = {
      ...ready,
      ladderRows: [
        { kid_id: 'k1', food_id: 'f-kiwi', status: 'active', current_rung: 'full_bite', consecutive_successes: 1 },
        { kid_id: 'k1', food_id: 'f-peas', status: 'active', current_rung: 'full_bite', consecutive_successes: 1 },
      ],
    };
    const { container, rerender } = renderSection({ progress });
    const first = container.textContent;
    expect(first).toMatch(/Kiwi is 3 good tries from safe, at Full bite now/);
    rerender(
      <MemoryRouter>
        <NextStepSection kid={kid} todayIso={TODAY} progress={{ ...progress }} />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe(first);
  });

  it('is a single line with no heading in compact mode', () => {
    state.flag = true;
    const progress: KidsProgressData = {
      ...ready,
      ladderRows: [{ kid_id: 'k1', food_id: 'f-peas', status: 'paused', current_rung: 'licking' }],
    };
    renderSection({ progress, compact: true });
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText(/Peas is resting at Licking/)).toBeInTheDocument();
  });
});
