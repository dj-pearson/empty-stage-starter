import { describe, it, expect } from 'vitest';
import type { PlanEntry } from '@/types';
import {
  amountForResult,
  amountForSave,
  buildFoodJournal,
  isAmountEaten,
  normalizeNoteKey,
  summarizeAmounts,
  summarizeJournal,
  type JournalAttempt,
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

describe('amountForSave', () => {
  it('stores no amount on an unlogged meal or a refusal', () => {
    expect(amountForSave(null, 'a_lot')).toBeNull();
    expect(amountForSave('refused', 'some')).toBeNull();
  });

  it('keeps the pick for a meal that was eaten or tasted', () => {
    expect(amountForSave('tasted', 'nibbles')).toBe('nibbles');
    expect(amountForSave('ate', null)).toBeNull();
  });
});

describe('buildFoodJournal: recipes', () => {
  const recipeFoods = [
    { id: 'pasta', name: 'Pasta' },
    { id: 'cheese', name: 'Cheese sauce', allergens: ['Milk'] },
    { id: 'peas', name: 'Peas' },
  ];
  const recipes = [{ id: 'mac', name: 'Mac and cheese' }];
  const row = (overrides: Partial<PlanEntry>) =>
    entry({ meal_slot: 'dinner', recipe_id: 'mac', result: null, ...overrides });

  it('shows a 3-row recipe logged on the primary as one item named after the recipe', () => {
    const days = buildFoodJournal({
      entries: [
        row({ id: 'r1', food_id: 'pasta', is_primary_dish: true, result: 'ate' }),
        row({ id: 'r2', food_id: 'cheese', is_primary_dish: false }),
        row({ id: 'r3', food_id: 'peas', is_primary_dish: false }),
      ],
      foods: recipeFoods,
      recipes,
    });

    expect(days[0].items).toHaveLength(1);
    expect(days[0].items[0]).toMatchObject({ entryId: 'r1', name: 'Mac and cheese', recipeId: 'mac', result: 'ate' });
    expect(days[0].items[0].components).toEqual([]);
  });

  it('nests a side row logged on its own under the dish', () => {
    const days = buildFoodJournal({
      entries: [
        row({ id: 'r1', food_id: 'pasta', is_primary_dish: true, result: 'ate' }),
        row({ id: 'r3', food_id: 'peas', is_primary_dish: false, result: 'refused', notes: 'Picked them out' }),
      ],
      foods: recipeFoods,
      recipes,
    });

    expect(days[0].items).toHaveLength(1);
    expect(days[0].items[0].components).toEqual([
      expect.objectContaining({ entryId: 'r3', name: 'Peas', result: 'refused' }),
    ]);
    expect(days[0].counts).toEqual({ ate: 1, tasted: 0, refused: 0 });
  });

  it('reads two recipe rows with no primary flag as one dish', () => {
    const days = buildFoodJournal({
      entries: [
        row({ id: 'r1', food_id: 'pasta', result: 'ate' }),
        row({ id: 'r2', food_id: 'cheese', result: 'ate' }),
      ],
      foods: recipeFoods,
      recipes,
    });

    expect(days[0].items).toHaveLength(1);
    expect(days[0].items[0].entryId).toBe('r1');
  });

  it('keeps a stray row under another key as its own item', () => {
    const days = buildFoodJournal({
      entries: [
        row({ id: 'r1', food_id: 'pasta', is_primary_dish: true, result: 'ate' }),
        row({ id: 'r2', food_id: 'cheese', is_primary_dish: false }),
        entry({ id: 's1', meal_slot: 'dinner', food_id: 'f2', result: 'tasted' }),
      ],
      foods: [...recipeFoods, ...foods],
      recipes,
    });

    expect(days[0].items.map((i) => i.name)).toEqual(['Apple slices', 'Mac and cheese']);
  });

  it('flags a recipe whose component carries the kid\'s allergen', () => {
    const days = buildFoodJournal({
      entries: [
        row({ id: 'r1', food_id: 'pasta', is_primary_dish: true, result: 'ate' }),
        row({ id: 'r2', food_id: 'cheese', is_primary_dish: false }),
      ],
      foods: recipeFoods,
      recipes,
      kids: [{ id: 'k1', allergens: ['milk'] }],
    });

    expect(days[0].items[0].allergen).toBe('milk');
  });
});

describe('buildFoodJournal: names, notes, exposure', () => {
  it('names a food missing from the list null', () => {
    const days = buildFoodJournal({ entries: [entry({ food_id: 'gone' })], foods });
    expect(days[0].items[0].name).toBeNull();
  });

  it('reads the same words with a different case or full stop once', () => {
    expect(normalizeNoteKey('  Only the   corners. ')).toBe('only the corners');
    const days = buildFoodJournal({
      entries: [entry({ notes: 'Only the corners.' })],
      foods,
      feedback: [fb({ note: 'only the corners' })],
    });

    expect(days[0].items[0].notes.map((n) => n.text)).toEqual(['Only the corners.']);
  });

  it('counts exposures across dinners and marks only the first taste', () => {
    const days = buildFoodJournal({
      entries: [
        entry({ id: 'd3', date: '2026-09-22', meal_slot: 'dinner', result: 'ate' }),
        entry({ id: 'd1', date: '2026-09-20', meal_slot: 'dinner', result: 'refused' }),
        entry({ id: 'd2', date: '2026-09-21', meal_slot: 'dinner', result: 'tasted' }),
      ],
      foods,
    });
    const items = days.flatMap((d) => d.items).sort((a, b) => a.date.localeCompare(b.date));

    expect(items.map((i) => i.exposureNumber)).toEqual([1, 2, 3]);
    expect(items.map((i) => i.firstTry)).toEqual([false, true, false]);
  });

  it('counts exposures before the date filter', () => {
    const days = buildFoodJournal({
      entries: [
        entry({ id: 'd1', date: '2026-09-01', result: 'ate' }),
        entry({ id: 'd2', date: '2026-09-20', result: 'ate' }),
      ],
      foods,
      from: '2026-09-10',
    });

    expect(days[0].items[0]).toMatchObject({ exposureNumber: 2, firstTry: false });
  });

  it('sets the allergen when the food carries one of the kid\'s', () => {
    const days = buildFoodJournal({
      entries: [entry({})],
      foods: [{ id: 'f1', name: 'Yogurt', allergens: ['Milk'] }],
      kids: [{ id: 'k1', allergens: ['milk'] }],
    });
    expect(days[0].items[0].allergen).toBe('milk');

    const noKids = buildFoodJournal({ entries: [entry({})], foods: [{ id: 'f1', name: 'Yogurt', allergens: ['Milk'] }] });
    expect(noKids[0].items[0].allergen).toBeNull();
  });

  it('shows the reaction written on a linked food attempt', () => {
    const attempt: JournalAttempt = {
      id: 'att1',
      plan_entry_id: null,
      reaction_notes: 'Hives on cheeks',
      parent_notes: 'Gave antihistamine',
      attempted_at: '2026-09-20T12:45:00Z',
    };
    const days = buildFoodJournal({
      entries: [entry({ food_attempt_id: 'att1' })],
      foods,
      attempts: [attempt],
    });

    expect(days[0].items[0].notes).toEqual([
      expect.objectContaining({ source: 'reaction', text: 'Hives on cheeks', createdAt: '2026-09-20T12:45:00Z' }),
      expect.objectContaining({ source: 'attempt', text: 'Gave antihistamine' }),
    ]);
  });

  it('matches an attempt by its plan_entry_id too', () => {
    const days = buildFoodJournal({
      entries: [entry({ result: null })],
      foods,
      attempts: [{ id: 'a', plan_entry_id: 'e1', reaction_notes: 'Rash', parent_notes: null, attempted_at: null }],
    });
    expect(days[0].items[0].notes.map((n) => n.source)).toEqual(['reaction']);
  });

  it('orders siblings in a slot by kidOrder', () => {
    const entries = [
      entry({ id: 'a', kid_id: 'k1' }),
      entry({ id: 'b', kid_id: 'k2' }),
    ];
    expect(buildFoodJournal({ entries, foods, kidOrder: ['k2', 'k1'] })[0].items.map((i) => i.kidId)).toEqual([
      'k2',
      'k1',
    ]);
    expect(buildFoodJournal({ entries, foods, kidOrder: ['k1', 'k2'] })[0].items.map((i) => i.kidId)).toEqual([
      'k1',
      'k2',
    ]);
  });
});

describe('summarizeJournal', () => {
  const entries = [
    entry({ id: 'a', amount_eaten: 'some', notes: 'Slow start' }),
    entry({ id: 'b', meal_slot: 'dinner', result: 'refused' }),
    entry({ id: 'c', meal_slot: 'snack2', result: null, notes: 'Wanted it warm' }),
    entry({ id: 'd', kid_id: 'k2', meal_slot: 'breakfast', result: 'tasted', amount_eaten: 'nibbles' }),
  ];

  it('counts note-only meals apart from logged ones', () => {
    const summary = summarizeJournal(buildFoodJournal({ entries, foods }));

    expect(summary.logged).toBe(3);
    expect(summary.noteOnly).toBe(1);
    expect(summary.logged).toBe(summary.counts.ate + summary.counts.tasted + summary.counts.refused);
    expect(summary.amounts).toEqual({ a_lot: 0, some: 1, nibbles: 1 });
    expect(summary.byKid.get('k1')).toEqual({
      logged: 2,
      counts: { ate: 1, tasted: 0, refused: 1 },
      amounts: { a_lot: 0, some: 1, nibbles: 0 },
    });
  });

  it('gives different totals when built through the notes filter', () => {
    const all = summarizeJournal(buildFoodJournal({ entries, foods, onlyWithNotes: false }));
    const filtered = summarizeJournal(buildFoodJournal({ entries, foods, onlyWithNotes: true }));

    expect(filtered.logged).toBe(1);
    expect(all.logged).not.toBe(filtered.logged);
  });
});
