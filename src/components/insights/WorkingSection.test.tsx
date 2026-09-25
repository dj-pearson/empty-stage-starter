import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { addIsoDays } from '@/lib/date-utils';
import type { SafeFoodRisk } from '@/lib/safeFoodRisk';
import type { Food, Kid, PlanEntry } from '@/types';

const TODAY = '2026-09-24';

const state = vi.hoisted(() => ({
  flag: true,
  entries: [] as PlanEntry[],
  foods: [] as Food[],
  rows: [] as SafeFoodRisk[],
  hookArgs: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/contexts/AppContext', () => ({
  usePlan: () => ({ planEntries: state.entries }),
  useFoods: () => ({ foods: state.foods }),
}));
vi.mock('@/hooks/useFeatureFlag', () => ({
  useFeatureFlag: () => state.flag,
}));
vi.mock('@/hooks/useSafeFoodInsurance', () => ({
  useSafeFoodInsurance: (args: Record<string, unknown>) => {
    state.hookArgs.push(args);
    return { rows: state.rows, alerts: [], backupByFood: new Map(), dismiss: () => {}, loading: false };
  },
}));
vi.mock('@/components/SafeFoodInsuranceCard', () => ({
  SafeFoodInsuranceCard: () => <div data-testid="safe-food-insurance-card" />,
}));

import { WorkingSection } from './WorkingSection';

const kid: Kid = { id: 'k1', name: 'Maya', allergens: ['peanut'] };
const food = (id: string, name: string, over: Partial<Food> = {}): Food => ({
  id,
  name,
  category: 'protein',
  is_safe: true,
  is_try_bite: false,
  ...over,
});

let seq = 0;
const ate = (food_id: string, n: number): PlanEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${++seq}`,
    kid_id: 'k1',
    food_id,
    date: addIsoDays(TODAY, -i * 2),
    meal_slot: 'dinner',
    result: 'ate',
  }));

function risk(foodId: string, foodName: string, over: Partial<SafeFoodRisk> = {}): SafeFoodRisk {
  return {
    foodId,
    foodName,
    level: 'watch',
    score: 0.4,
    signals: [{ kind: 'declining_acceptance', baselineRate: 1, recentRate: 0.33 }],
    // 6 recent: 2 ate, 4 refused. 5 baseline, all ate.
    recentAcceptanceRate: 0.33,
    baselineAcceptanceRate: 1,
    recentRefusalRate: 0.67,
    baselineRefusalRate: 0,
    observations: { recent: 6, baseline: 5 },
    insufficientData: false,
    ...over,
  };
}

function renderSection() {
  return render(
    <MemoryRouter>
      <WorkingSection kid={kid} todayIso={TODAY} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.flag = true;
  state.foods = [
    food('f-rice', 'Rice'),
    food('f-toast', 'Toast'),
    food('f-nuts', 'Peanuts', { allergens: ['peanuts'] }),
    food('f-corn', 'Corn'),
  ];
  state.entries = [...ate('f-rice', 4), ...ate('f-toast', 3), ...ate('f-nuts', 5), ...ate('f-corn', 2)];
  state.rows = [];
  state.hookArgs = [];
});

describe('WorkingSection', () => {
  it('lists reliable foods as Food Journal links, without allergens or thin history', () => {
    renderSection();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent("What's working");
    expect(screen.getByText('Last 4 weeks')).toBeInTheDocument();
    expect(screen.getByText(/Maya reliably eats:/)).toBeInTheDocument();
    const rice = screen.getByRole('link', { name: /Rice/ });
    expect(rice).toHaveAttribute('href', '/dashboard/food-journal');
    expect(screen.getByRole('link', { name: /Toast/ })).toHaveAttribute('href', '/dashboard/food-journal');
    expect(screen.queryByRole('link', { name: /Peanuts/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Corn/ })).not.toBeInTheDocument();
  });

  it('lists every slipping safe food, past the Home alert cap, without the Home card', () => {
    state.rows = [
      risk('a', 'Chicken nuggets', { level: 'at_risk' }),
      risk('b', 'Pasta'),
      risk('c', 'Yogurt'),
      risk('d', 'Apples', { level: 'none', signals: [] }),
    ];
    renderSection();
    expect(screen.getByText('Chicken nuggets: eaten 2 of the last 6 times')).toBeInTheDocument();
    expect(screen.getByText('Pasta: eaten 2 of the last 6 times')).toBeInTheDocument();
    expect(screen.getByText('Yogurt: eaten 2 of the last 6 times')).toBeInTheDocument();
    expect(screen.getAllByText(/Before that: 5 of 5/)).toHaveLength(3);
    expect(screen.queryByText(/Apples/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('safe-food-insurance-card')).not.toBeInTheDocument();
    expect(state.hookArgs.at(-1)).toMatchObject({ kidId: 'k1', skipBackups: true });
  });

  it('says so when every safe food has too little history', () => {
    state.rows = [risk('a', 'Rice', { level: 'none', signals: [], insufficientData: true })];
    renderSection();
    expect(screen.getByText(/Not enough history yet/)).toBeInTheDocument();
  });

  it('leaves out the slipping list when the ladder is off', () => {
    state.flag = false;
    state.rows = [risk('a', 'Chicken nuggets')];
    renderSection();
    expect(screen.queryByText(/Chicken nuggets/)).not.toBeInTheDocument();
    expect(state.hookArgs).toHaveLength(0);
  });
});
