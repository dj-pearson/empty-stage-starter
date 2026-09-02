// Deno tests for the meal-plan-template transforms (US-716).
// Run with: deno test supabase/functions/_shared/meal-plan-templates.test.ts
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildTemplatePlanRows,
  dateForOffset,
  groupPlannedWeekIntoTemplateEntries,
  unsafeReason,
  type FoodSafety,
} from './meal-plan-templates.ts';

const START = '2026-09-07'; // a Monday

const foods = (entries: Array<[string, string[]]>): Map<string, FoodSafety> =>
  new Map(entries.map(([id, allergens]) => [id, { name: id, allergens }]));

const KIDS = [
  { id: 'kid-a', allergens: ['Peanut'], dietary_restrictions: [] },
  { id: 'kid-b', allergens: [], dietary_restrictions: ['dairy'] },
];

// --- dates ------------------------------------------------------------------

Deno.test('dateForOffset walks forward from the start date', () => {
  assertEquals(dateForOffset(START, 0), '2026-09-07');
  assertEquals(dateForOffset(START, 6), '2026-09-13');
});

Deno.test('dateForOffset crosses a month boundary', () => {
  assertEquals(dateForOffset('2026-09-28', 5), '2026-10-03');
});

// --- allergens --------------------------------------------------------------

Deno.test('unsafeReason matches an allergen case-insensitively', () => {
  const reason = unsafeReason(KIDS[0], 'satay', foods([['satay', ['peanut']]]));
  assertStringIncludes(reason!, 'peanut');
});

Deno.test('unsafeReason matches a dietary restriction', () => {
  const reason = unsafeReason(KIDS[1], 'yoghurt', foods([['yoghurt', ['Dairy']]]));
  assertStringIncludes(reason!, 'dairy');
});

Deno.test('unsafeReason passes a food the kid does not react to', () => {
  assertEquals(unsafeReason(KIDS[0], 'rice', foods([['rice', []]])), null);
});

Deno.test('unsafeReason passes an unknown food rather than guessing', () => {
  assertEquals(unsafeReason(KIDS[0], 'mystery', foods([])), null);
});

// --- building plan rows -----------------------------------------------------

Deno.test('every row carries user_id and household_id', () => {
  const { rows } = buildTemplatePlanRows({
    templateEntries: [{ day_of_week: 0, meal_slot: 'lunch', food_ids: ['rice'] }],
    kids: [KIDS[0]],
    foodsById: foods([['rice', []]]),
    userId: 'user-1',
    householdId: 'hh-1',
    startDate: START,
    templateName: 'Weeknights',
  });
  assertEquals(rows.length, 1);
  // plan_entries.user_id is NOT NULL with no trigger; omitting it rejected
  // every insert this function ever attempted.
  assertEquals(rows[0].user_id, 'user-1');
  assertEquals(rows[0].household_id, 'hh-1');
  assertEquals(rows[0].food_id, 'rice');
  assertEquals(rows[0].date, '2026-09-07');
});

Deno.test('the first food is the primary dish and carries the recipe', () => {
  const { rows } = buildTemplatePlanRows({
    templateEntries: [
      { day_of_week: 1, meal_slot: 'dinner', recipe_id: 'r1', food_ids: ['pasta', 'peas'] },
    ],
    kids: [KIDS[0]],
    foodsById: foods([['pasta', []], ['peas', []]]),
    userId: 'user-1',
    householdId: 'hh-1',
    startDate: START,
    templateName: 'Weeknights',
  });
  assertEquals(rows.map((r) => r.food_id), ['pasta', 'peas']);
  assertEquals(rows[0].is_primary_dish, true);
  assertEquals(rows[0].recipe_id, 'r1');
  assertEquals(rows[1].is_primary_dish, false);
  assertEquals(rows[1].recipe_id, null);
});

Deno.test('a recipe-only entry never becomes a row with a null food_id', () => {
  const { rows, recipeOnly } = buildTemplatePlanRows({
    templateEntries: [{ day_of_week: 2, meal_slot: 'dinner', recipe_id: 'r9', food_ids: [] }],
    kids: [KIDS[0]],
    foodsById: foods([]),
    userId: 'user-1',
    householdId: 'hh-1',
    startDate: START,
    templateName: 'Weeknights',
  });
  // food_id is NOT NULL, so the old `food_ids ? food_ids[0] : null` was a
  // guaranteed rejection.
  assertEquals(rows, []);
  assertEquals(recipeOnly, [
    { kid_id: 'kid-a', recipe_id: 'r9', date: '2026-09-09', meal_slot: 'dinner' },
  ]);
});

Deno.test('an entry with neither foods nor a recipe produces nothing at all', () => {
  const { rows, recipeOnly } = buildTemplatePlanRows({
    templateEntries: [{ day_of_week: 0, meal_slot: 'snack1', food_ids: [] }],
    kids: KIDS,
    foodsById: foods([]),
    userId: 'user-1',
    householdId: 'hh-1',
    startDate: START,
    templateName: 'T',
  });
  assertEquals(rows, []);
  assertEquals(recipeOnly, []);
});

Deno.test('an unsafe food is skipped for that kid only, and reported', () => {
  const { rows, skipped } = buildTemplatePlanRows({
    templateEntries: [{ day_of_week: 0, meal_slot: 'lunch', food_ids: ['satay'] }],
    kids: KIDS,
    foodsById: foods([['satay', ['peanut']]]),
    userId: 'user-1',
    householdId: 'hh-1',
    startDate: START,
    templateName: 'T',
  });
  assertEquals(rows.map((r) => r.kid_id), ['kid-b']);
  assertEquals(skipped.length, 1);
  assertEquals(skipped[0].kid_id, 'kid-a');
  assertStringIncludes(skipped[0].reason, 'peanut');
});

Deno.test('a skipped primary still leaves the rest of the meal schedulable', () => {
  const { rows } = buildTemplatePlanRows({
    templateEntries: [{ day_of_week: 0, meal_slot: 'dinner', food_ids: ['satay', 'rice'] }],
    kids: [KIDS[0]],
    foodsById: foods([['satay', ['peanut']], ['rice', []]]),
    userId: 'user-1',
    householdId: 'hh-1',
    startDate: START,
    templateName: 'T',
  });
  assertEquals(rows.map((r) => r.food_id), ['rice']);
});

Deno.test('the same template built twice produces identical rows', () => {
  const args = {
    templateEntries: [
      { day_of_week: 0, meal_slot: 'lunch', recipe_id: 'r1', food_ids: ['rice', 'peas'] },
      { day_of_week: 3, meal_slot: 'dinner', food_ids: ['pasta'] },
    ],
    kids: KIDS,
    foodsById: foods([['rice', []], ['peas', []], ['pasta', []]]),
    userId: 'user-1',
    householdId: 'hh-1',
    startDate: START,
    templateName: 'T',
  };
  // The upsert key is (household_id, kid_id, date, meal_slot, food_id); two
  // identical builds must collide on it rather than duplicate.
  const first = buildTemplatePlanRows(args).rows;
  const second = buildTemplatePlanRows(args).rows;
  assertEquals(first, second);
  const keys = first.map(
    (r) => `${r.household_id}|${r.kid_id}|${r.date}|${r.meal_slot}|${r.food_id}`,
  );
  assertEquals(new Set(keys).size, keys.length, 'a single build must not collide with itself');
});

// --- folding a week back into a template ------------------------------------

Deno.test('a whole meal is kept, not just its primary dish', () => {
  const grouped = groupPlannedWeekIntoTemplateEntries(
    [
      { date: '2026-09-07', meal_slot: 'dinner', recipe_id: 'r1', food_id: 'pasta', is_primary_dish: true },
      { date: '2026-09-07', meal_slot: 'dinner', recipe_id: 'r1', food_id: 'peas', is_primary_dish: false },
      { date: '2026-09-07', meal_slot: 'dinner', recipe_id: 'r1', food_id: 'bread', is_primary_dish: false },
    ],
    START,
  );
  assertEquals(grouped.length, 1);
  assertEquals(grouped[0].food_ids, ['pasta', 'peas', 'bread']);
  assertEquals(grouped[0].day_of_week, 0);
});

Deno.test('the primary dish leads the food_ids array whatever order it arrives in', () => {
  const grouped = groupPlannedWeekIntoTemplateEntries(
    [
      { date: '2026-09-07', meal_slot: 'dinner', food_id: 'peas', is_primary_dish: false },
      { date: '2026-09-07', meal_slot: 'dinner', food_id: 'pasta', is_primary_dish: true },
    ],
    START,
  );
  assertEquals(grouped[0].food_ids[0], 'pasta');
});

Deno.test('different slots and different recipes stay separate', () => {
  const grouped = groupPlannedWeekIntoTemplateEntries(
    [
      { date: '2026-09-07', meal_slot: 'lunch', food_id: 'a' },
      { date: '2026-09-07', meal_slot: 'dinner', food_id: 'b' },
      { date: '2026-09-08', meal_slot: 'dinner', food_id: 'c' },
      { date: '2026-09-08', meal_slot: 'dinner', recipe_id: 'r2', food_id: 'd' },
    ],
    START,
  );
  assertEquals(grouped.length, 4);
  assertEquals(grouped.map((g) => g.day_of_week), [0, 0, 1, 1]);
});

Deno.test('a duplicate food in one meal is collapsed', () => {
  const grouped = groupPlannedWeekIntoTemplateEntries(
    [
      { date: '2026-09-07', meal_slot: 'lunch', food_id: 'rice' },
      { date: '2026-09-07', meal_slot: 'lunch', food_id: 'rice' },
    ],
    START,
  );
  assertEquals(grouped[0].food_ids, ['rice']);
});

Deno.test('a saved week round-trips back into the same meals', () => {
  const planned = [
    { date: '2026-09-07', meal_slot: 'dinner', recipe_id: 'r1', food_id: 'pasta', is_primary_dish: true },
    { date: '2026-09-07', meal_slot: 'dinner', recipe_id: 'r1', food_id: 'peas', is_primary_dish: false },
  ];
  const grouped = groupPlannedWeekIntoTemplateEntries(planned, START);
  const { rows } = buildTemplatePlanRows({
    templateEntries: grouped,
    kids: [KIDS[0]],
    foodsById: foods([['pasta', []], ['peas', []]]),
    userId: 'user-1',
    householdId: 'hh-1',
    startDate: START,
    templateName: 'T',
  });
  assertEquals(rows.map((r) => r.food_id), ['pasta', 'peas']);
  assertEquals(rows[0].is_primary_dish, true);
  assert(rows.every((r) => r.date === '2026-09-07'));
});
