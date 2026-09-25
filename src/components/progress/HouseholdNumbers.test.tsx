/**
 * HouseholdNumbers with the twelve-month read mocked: per-kid chips, the two
 * CSV exports and the empty-kid link.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Kid, PlanEntry } from '@/types';
import '@/i18n';

const state = vi.hoisted(() => ({
  entries: [] as PlanEntry[],
  downloads: [] as Array<{ filename: string; csv: string }>,
  downloadOk: true,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'u1', householdId: 'h1' }),
}));

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({
    foods: [
      { id: 'f1', name: 'Peas' },
      { id: 'f2', name: '=HYPERLINK("http://x.test","hi")' },
      { id: 'f3', name: 'Rice' },
    ],
  }),
  useRecipes: () => ({ recipes: [] }),
  usePlan: () => ({ planEntries: [] }),
}));

vi.mock('@/hooks/useHouseholdHistory', () => ({
  useHouseholdHistory: () => ({
    entries: state.entries,
    loading: false,
    error: false,
    truncated: false,
    fromIso: '2025-09-24',
  }),
}));

vi.mock('@/lib/csvExport', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/csvExport')>();
  return {
    ...real,
    downloadCsv: (filename: string, csv: string) => {
      state.downloads.push({ filename, csv });
      return state.downloadOk;
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: state.toastSuccess, error: state.toastError },
}));

import { HouseholdNumbers } from './HouseholdNumbers';
import { HouseholdChart } from './HouseholdChart';

const kids = [
  { id: 'k1', name: 'Ava' },
  { id: 'k2', name: 'Ben' },
] as Kid[];

function entry(id: string, kid: string, date: string, food: string, result: PlanEntry['result'], notes?: string): PlanEntry {
  return { id, kid_id: kid, date, meal_slot: 'dinner', food_id: food, result, amount_eaten: null, notes };
}

function renderNumbers(scopeKidId: string | null = null) {
  return render(
    <MemoryRouter>
      <HouseholdNumbers kids={kids} scopeKidId={scopeKidId} ladderRows={[]} />
    </MemoryRouter>
  );
}

describe('HouseholdNumbers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24, 12));
    state.downloads = [];
    state.downloadOk = true;
    state.toastSuccess.mockClear();
    state.toastError.mockClear();
    state.entries = [
      entry('e1', 'k1', '2026-09-02', 'f1', 'ate', 'loved it, said Grandma'),
      entry('e2', 'k1', '2026-09-03', 'f2', 'tasted'),
      entry('e3', 'k1', '2026-08-20', 'f3', 'refused'),
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives Ate and Tasted chips different token classes', () => {
    const { container } = renderNumbers();
    const row = container.querySelector('[data-testid="household-kid-k1"]') as HTMLElement;
    const ate = row.querySelector('[data-result="ate"]') as HTMLElement;
    const tasted = row.querySelector('[data-result="tasted"]') as HTMLElement;
    expect(ate.className).toContain('safe-food');
    expect(tasted.className).toContain('try-bite');
    expect(ate.className).not.toEqual(tasted.className);
    expect(ate.textContent).toContain('1');
  });

  it('builds the monthly summary with the expected header and row count', () => {
    renderNumbers();
    fireEvent.click(screen.getByRole('button', { name: 'Monthly summary (CSV)' }));
    expect(state.downloads).toHaveLength(1);
    const lines = state.downloads[0].csv.split('\r\n');
    expect(lines[0]).toBe('kid,month,dishes_logged,ate,tasted,refused,distinct_foods,first_tries,graduations');
    // Ava: August and September. Ben: nothing.
    expect(lines).toHaveLength(3);
    expect(state.downloads[0].filename).toBe('eatpal-household-2025-09-24-to-2026-09-24.csv');
    expect(state.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('leaves notes out of the meal CSV and guards the formula name', () => {
    renderNumbers('k1');
    fireEvent.click(screen.getByRole('button', { name: 'Every logged meal (CSV)' }));
    const { csv, filename } = state.downloads[0];
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('kid,date,meal_slot,dish,result,amount,exposure_number,first_try');
    expect(lines).toHaveLength(4);
    expect(csv).not.toContain('Grandma');
    expect(csv).toContain(`"'=HYPERLINK(`);
    expect(filename).toBe('eatpal-ava-2025-09-24-to-2026-09-24.csv');
  });

  it('shows toast.error when the download cannot start', () => {
    state.downloadOk = false;
    renderNumbers();
    fireEvent.click(screen.getByRole('button', { name: 'Monthly summary (CSV)' }));
    expect(state.toastError).toHaveBeenCalledTimes(1);
    expect(state.toastSuccess).not.toHaveBeenCalled();
  });

  it('gives a kid with no logs a link to the planner', () => {
    const { container } = renderNumbers();
    const row = container.querySelector('[data-testid="household-kid-k2"]') as HTMLElement;
    const link = row.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/dashboard/planner');
  });

  it('puts the scoped kid first', () => {
    const { container } = renderNumbers('k2');
    const rows = container.querySelectorAll('li[data-testid^="household-kid-"]');
    expect(rows[0].getAttribute('data-testid')).toBe('household-kid-k2');
  });

  it('never compares against a thin previous month', () => {
    renderNumbers();
    expect(screen.getByText(/Not enough logged in August 2026 to compare/)).toBeTruthy();
  });

  it('has no hex fill anywhere, the chart included', () => {
    const { container } = renderNumbers();
    const chart = render(
      <HouseholdChart
        kidName="Ava"
        months={['2026-08', '2026-09']}
        rows={[
          { kidId: 'k1', month: '2026-09', dishesLogged: 2, ate: 1, tasted: 1, refused: 0, distinctFoods: 2, firstTries: 2, graduations: 0 },
        ]}
      />
    );
    for (const root of [container, chart.container]) {
      for (const el of root.querySelectorAll('[fill], [stroke]')) {
        expect(el.getAttribute('fill') ?? '').not.toMatch(/^#/);
        expect(el.getAttribute('stroke') ?? '').not.toMatch(/^#/);
      }
      // chart.tsx's own selectors mention '#ccc' to restyle recharts' defaults,
      // so the colour check reads the series colours this component sets.
      for (const style of root.querySelectorAll('style')) {
        expect(style.textContent ?? '').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      }
      expect(root.innerHTML).not.toContain('text-white');
    }
    const css = chart.container.querySelector('style')?.textContent ?? '';
    expect(css).toContain('--color-ate: hsl(var(--safe-food))');
    expect(css).toContain('--color-tasted: hsl(var(--try-bite))');
  });

  it('gives screen readers every month as a table instead of the bars', () => {
    const chart = render(
      <HouseholdChart
        kidName="Ava"
        months={['2026-08', '2026-09']}
        rows={[
          { kidId: 'k1', month: '2026-09', dishesLogged: 3, ate: 2, tasted: 1, refused: 0, distinctFoods: 2, firstTries: 2, graduations: 0 },
        ]}
      />
    );
    const table = chart.container.querySelector('table.sr-only');
    expect(table).toBeTruthy();
    const rows = table!.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain('September 2026');
    expect([...rows[1].querySelectorAll('td')].map((td) => td.textContent)).toEqual(['2', '1', '0']);
    // An empty month is still a row with zeros, not a gap.
    expect([...rows[0].querySelectorAll('td')].map((td) => td.textContent)).toEqual(['0', '0', '0']);
    expect(chart.container.querySelector('[data-chart]')?.getAttribute('aria-hidden')).toBe('true');
  });
});
