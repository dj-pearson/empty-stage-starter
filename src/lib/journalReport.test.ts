import { describe, it, expect } from 'vitest';
import type { AmountEaten, MealSlot, PlanEntry } from '@/types';
import { buildFoodJournal, type JournalDay } from './foodJournal';
import { buildJournalPatterns, formatJournalDayLabel, formatJournalText, type Translate } from './journalReport';

/** Returns the English default with {{vars}} filled, or the key when there is none. */
const t: Translate = (key, vars = {}) => {
  const template = typeof vars.defaultValue === 'string' ? vars.defaultValue : key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''));
};

const entry = (overrides: Partial<PlanEntry>): PlanEntry => ({
  id: 'e1',
  kid_id: 'k1',
  date: '2026-09-20',
  meal_slot: 'lunch',
  food_id: 'f1',
  result: 'ate',
  ...overrides,
});

const foods = [
  { id: 'f1', name: 'Crackers' },
  { id: 'f2', name: 'Apple slices' },
  { id: 'f3', name: 'Yogurt', allergens: ['milk'] },
];

describe('formatJournalDayLabel', () => {
  it('says Today and Yesterday with the date beneath', () => {
    const today = formatJournalDayLabel('2026-09-24', '2026-09-24', 'en-US', t);
    expect(today.primary).toBe('Today');
    expect(today.secondary).toBe('Thursday, September 24, 2026');

    const yesterday = formatJournalDayLabel('2026-09-23', '2026-09-24', 'en-US', t);
    expect(yesterday.primary).toBe('Yesterday');
    expect(yesterday.secondary).toBe('Wednesday, September 23, 2026');
  });

  it('gives a weekday date for anything older', () => {
    expect(formatJournalDayLabel('2026-09-21', '2026-09-24', 'en-US', t)).toEqual({
      primary: 'Mon, Sep 21',
      secondary: null,
    });
  });
});

describe('formatJournalText', () => {
  const slotLabel = (slot: MealSlot) => slot.charAt(0).toUpperCase() + slot.slice(1);
  const days = buildFoodJournal({
    entries: [
      entry({ id: 'a', kid_id: 'k1', amount_eaten: 'some', notes: 'Only the corners\nthen asked for more' }),
      entry({ id: 'b', kid_id: 'k2', food_id: 'gone', result: 'tasted' }),
    ],
    foods,
    kidOrder: ['k1', 'k2'],
  });
  const text = formatJournalText(days, {
    t,
    slotLabel,
    dayLabel: (d) => `Day ${d}`,
    kidName: (id) => (id === 'k1' ? 'Maya' : 'Leo'),
    familyMode: true,
    authorLabel: () => 'Maria, 12:40',
    header: ['Food journal'],
  });
  const lines = text.split('\n');

  it('puts each kid under a heading in family mode', () => {
    expect(lines).toContain('  Maya');
    expect(lines).toContain('  Leo');
    expect(lines.indexOf('  Maya')).toBeLessThan(lines.indexOf('  Leo'));
    expect(lines[0]).toBe('Food journal');
  });

  it('writes one line per meal and indents every line of a note', () => {
    expect(lines).toContain('  - Lunch: Crackers / Ate / Some / First taste');
    expect(lines).toContain('      Only the corners');
    expect(lines).toContain('      then asked for more (Maria, 12:40)');
  });

  it('names an unknown food through the unknownFood key', () => {
    const keys: string[] = [];
    const spy: Translate = (key, vars) => {
      keys.push(key);
      return t(key, vars);
    };
    const out = formatJournalText(days, { t: spy, slotLabel, dayLabel: (d) => d, kidName: () => 'Leo', familyMode: false });
    expect(keys).toContain('foodJournal.unknownFood');
    expect(out).toContain('- Lunch: Unknown food / Tasted / First taste');
  });
});

describe('formatJournalText for the care team', () => {
  const slotLabel = (slot: MealSlot) => slot.charAt(0).toUpperCase() + slot.slice(1);
  const day: JournalDay = {
    date: '2026-09-20',
    counts: { ate: 1, tasted: 0, refused: 0 },
    items: [
      {
        entryId: 'e1',
        kidId: 'k1',
        date: '2026-09-20',
        mealSlot: 'lunch',
        foodId: 'f1',
        recipeId: null,
        name: 'Crackers',
        result: 'ate',
        amountEaten: 'some',
        notes: [
          { key: 'n1', text: 'Asked for seconds', source: 'feedback', userId: 'u2', createdAt: '2026-09-20T12:40:00Z' },
          { key: 'n2', text: 'Ate at the table', source: 'entry' },
        ],
        exposureNumber: 3,
        firstTry: false,
        allergen: null,
        components: [],
      },
    ],
  };
  const base = {
    t,
    slotLabel,
    dayLabel: (d: string) => `Day ${d}`,
    kidName: () => 'Ava Smith',
    familyMode: true,
    authorLabel: () => 'Jordan Lee, 12:40',
  };

  it('uses the first name and signs household notes with the role', () => {
    const text = formatJournalText([day], { ...base, careTeam: true, roleLabel: 'Parent' });
    expect(text).toContain('Ava');
    expect(text).not.toContain('Smith');
    expect(text).not.toContain('Jordan');
    expect(text).toContain('Asked for seconds (Parent)');
    // An entry note never had a byline and does not gain one.
    expect(text).toContain('Ate at the table');
    expect(text).not.toContain('Ate at the table (Parent)');
  });

  it('falls back to the translated role key when the caller passes none', () => {
    const text = formatJournalText([day], { ...base, careTeam: true });
    expect(text).toContain('Asked for seconds (Parent)');
  });

  it('keeps full names and bylines for the household view', () => {
    const text = formatJournalText([day], base);
    expect(text).toContain('Ava Smith');
    expect(text).toContain('Asked for seconds (Jordan Lee, 12:40)');
  });
});

describe('buildJournalPatterns', () => {
  const range = { from: '2026-09-15', to: '2026-09-22' };
  const foodName = (id: string) => foods.find((f) => f.id === id)?.name ?? null;

  it('ranks the most offered foods', () => {
    const entries = [
      entry({ id: '1', date: '2026-09-16', food_id: 'f2' }),
      entry({ id: '2', date: '2026-09-17', food_id: 'f2', result: 'tasted' }),
      entry({ id: '3', date: '2026-09-18', food_id: 'f2', result: 'refused' }),
      entry({ id: '4', date: '2026-09-16', meal_slot: 'dinner', food_id: 'f1' }),
      entry({ id: '5', date: '2026-09-01', food_id: 'f1' }),
      entry({ id: '6', date: '2026-09-17', meal_slot: 'dinner', food_id: 'f1', kid_id: 'k2' }),
    ];
    const days = buildFoodJournal({ entries, foods, kidId: 'k1', ...range });
    const { mostOffered } = buildJournalPatterns({ days, entries, kidId: 'k1', ...range, foodName });

    expect(mostOffered.map((m) => [m.name, m.offered])).toEqual([
      ['Apple slices', 3],
      ['Crackers', 1],
    ]);
    expect(mostOffered[0]).toMatchObject({ ate: 1, tasted: 1, refused: 1 });
  });

  it('counts allergen hits', () => {
    const entries = [
      entry({ id: '1', date: '2026-09-16', food_id: 'f3' }),
      entry({ id: '2', date: '2026-09-18', food_id: 'f3', result: 'refused' }),
    ];
    const days = buildFoodJournal({ entries, foods, kids: [{ id: 'k1', allergens: ['Milk'] }], ...range });
    const { allergenHits } = buildJournalPatterns({ days, entries, kidId: 'k1', ...range, foodName });

    expect(allergenHits).toEqual([{ allergen: 'milk', count: 2, names: ['Yogurt'] }]);
  });

  const trendFor = (early: AmountEaten, late: AmountEaten, lateCount = 2) => {
    const entries: PlanEntry[] = [
      entry({ id: 'x1', date: '2026-09-15', amount_eaten: early }),
      entry({ id: 'x2', date: '2026-09-16', amount_eaten: early }),
      ...Array.from({ length: lateCount }, (_, i) =>
        entry({ id: `y${i}`, date: `2026-09-2${i}`, amount_eaten: late })
      ),
    ];
    const days: JournalDay[] = buildFoodJournal({ entries, foods, ...range });
    return buildJournalPatterns({ days, entries, kidId: 'k1', ...range, foodName }).amountTrend;
  };

  it('reads the amount trend from the older half against the newer half', () => {
    expect(trendFor('nibbles', 'a_lot')).toBe('up');
    expect(trendFor('a_lot', 'nibbles')).toBe('down');
    expect(trendFor('some', 'some')).toBe('flat');
  });

  it('has no trend when a half has fewer than two amounts', () => {
    expect(trendFor('nibbles', 'a_lot', 1)).toBeNull();
  });
});
