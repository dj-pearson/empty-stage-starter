import { describe, it, expect } from 'vitest';
import type { PlanEntry } from '@/types';
import {
  amountForResult,
  buildFoodJournal,
  isAmountEaten,
  summarizeAmounts,
  type JournalFeedback,
} from './foodJournal';

/**
 * The food journal is where a caregiver reads back what they logged. Notes come
 * from two tables (plan_entries.notes from the web, plan_entry_feedback from
 * the iOS sheet), and before this there was no screen that showed the second
 * one at all.
 */

const foods = [
  { id: 'f1', name: 'Crackers' },
  { id: 'f2', name: 'Apple slices' },
];

const entry = (overrides: Partial<PlanEntry>): PlanEntry => ({
  id: 'e1',
  kid_id: 'k1',
  date: '2026-09-20',
  meal_slot: 'lunch',
  food_id: 'f1',
  result: 'ate',
  ...overrides,
});

const fb = (overrides: Partial<JournalFeedback>): JournalFeedback => ({
  id: 'fb1',
  plan_entry_id: 'e1',
  user_id: 'nanny',
  rating: 3,
  note: 'Only the corners',
  created_at: '2026-09-20T12:30:00Z',
  ...overrides,
});

describe('amountForResult', () => {
  it('keeps the pick for a meal that was eaten or tasted', () => {
    expect(amountForResult('ate', 'a_lot', null)).toBe('a_lot');
    expect(amountForResult('tasted', 'nibbles', 'some')).toBe('nibbles');
  });

  it('keeps what was recorded when nothing new was picked', () => {
    expect(amountForResult('ate', undefined, 'some')).toBe('some');
  });

  it('has no amount for a refusal', () => {
    expect(amountForResult('refused', 'a_lot', 'some')).toBeNull();
  });
});

describe('isAmountEaten', () => {
  it('accepts only the three stored values', () => {
    expect(isAmountEaten('a_lot')).toBe(true);
    expect(isAmountEaten('half')).toBe(false);
    expect(isAmountEaten(null)).toBe(false);
  });
});

describe('buildFoodJournal', () => {
  it('shows notes from the web and from the iOS sheet on the same meal', () => {
    const days = buildFoodJournal({
      entries: [entry({ notes: 'Asked for more' })],
      foods,
      feedback: [fb({})],
    });

    expect(days).toHaveLength(1);
    expect(days[0].items[0].notes.map((n) => n.text)).toEqual(['Asked for more', 'Only the corners']);
  });

  it('shows the same words once when they were saved both ways', () => {
    const days = buildFoodJournal({
      entries: [entry({ notes: 'Only the corners' })],
      foods,
      feedback: [fb({})],
    });

    expect(days[0].items[0].notes).toHaveLength(1);
  });

  it('leaves out planned meals nobody has logged yet', () => {
    const days = buildFoodJournal({ entries: [entry({ result: null })], foods });
    expect(days).toEqual([]);
  });

  it('keeps an unlogged meal that has a note on it', () => {
    const days = buildFoodJournal({ entries: [entry({ result: null, notes: 'Wanted it warm' })], foods });
    expect(days[0].items[0].result).toBeNull();
  });

  it('puts the newest day first and meals in eating order within a day', () => {
    const days = buildFoodJournal({
      entries: [
        entry({ id: 'a', date: '2026-09-19', meal_slot: 'dinner' }),
        entry({ id: 'b', date: '2026-09-20', meal_slot: 'dinner' }),
        entry({ id: 'c', date: '2026-09-20', meal_slot: 'breakfast', food_id: 'f2' }),
      ],
      foods,
    });

    expect(days.map((d) => d.date)).toEqual(['2026-09-20', '2026-09-19']);
    expect(days[0].items.map((i) => i.entryId)).toEqual(['c', 'b']);
  });

  it('filters by child, date range and notes', () => {
    const entries = [
      entry({ id: 'a', kid_id: 'k1', notes: 'Gagged on texture' }),
      entry({ id: 'b', kid_id: 'k2' }),
      entry({ id: 'c', kid_id: 'k1', date: '2026-09-01' }),
    ];

    expect(buildFoodJournal({ entries, foods, kidId: 'k1', from: '2026-09-10' })[0].items.map((i) => i.entryId)).toEqual(['a']);
    expect(buildFoodJournal({ entries, foods, onlyWithNotes: true })[0].items.map((i) => i.entryId)).toEqual(['a']);
  });

  it('counts results per day and amounts overall', () => {
    const days = buildFoodJournal({
      entries: [
        entry({ id: 'a', amount_eaten: 'nibbles' }),
        entry({ id: 'b', meal_slot: 'dinner', result: 'refused' }),
        entry({ id: 'c', meal_slot: 'snack2', amount_eaten: 'nibbles' }),
      ],
      foods,
    });

    expect(days[0].counts).toEqual({ ate: 2, tasted: 0, refused: 1 });
    expect(summarizeAmounts(days)).toEqual({ a_lot: 0, some: 0, nibbles: 2 });
  });
});
