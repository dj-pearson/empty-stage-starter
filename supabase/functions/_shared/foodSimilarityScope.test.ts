// Deno tests for calculate-food-similarity's household scoping.
// Run with: deno test supabase/functions/_shared/foodSimilarityScope.test.ts
// Vitest mirror: src/lib/foodSimilarityScopeShared.test.ts
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveSimilarityScope,
  type HouseholdScopedRow,
} from './foodSimilarityScope.ts';

const MINE = 'hh-mine';
const THEIRS = 'hh-theirs';

interface Row extends HouseholdScopedRow {
  name: string;
}

const FOODS: Row[] = [
  { id: 'apple', household_id: MINE, name: 'Apple' },
  { id: 'pear', household_id: MINE, name: 'Pear' },
  { id: 'their-mango', household_id: THEIRS, name: 'Mango' },
];
const KIDS: Row[] = [
  { id: 'my-kid', household_id: MINE, name: 'Sam' },
  { id: 'their-kid', household_id: THEIRS, name: 'Alex' },
];

// A deliberately careless database: the loaders ignore the household
// argument, so these tests show the helper refuses even when a query forgets
// its filter. The real loaders filter as well, and RLS applies under them.
function harness(userId: string | null | undefined, body: unknown, household: string | null = MINE) {
  const seen = { householdLookups: [] as string[], foodsFor: [] as string[], kidLoads: 0, sourceLoads: 0 };
  const run = () =>
    resolveSimilarityScope<Row, Row>({
      userId,
      body,
      lookupHousehold: (uid) => {
        seen.householdLookups.push(uid);
        return Promise.resolve(household);
      },
      loadSourceFood: (id) => {
        seen.sourceLoads += 1;
        return Promise.resolve(FOODS.find((f) => f.id === id) ?? null);
      },
      loadKid: (id) => {
        seen.kidLoads += 1;
        return Promise.resolve(KIDS.find((k) => k.id === id) ?? null);
      },
      loadHouseholdFoods: (hh) => {
        seen.foodsFor.push(hh);
        return Promise.resolve(FOODS);
      },
    });
  return { seen, run };
}

Deno.test('anon (no verified user) is 401 and nothing is loaded', async () => {
  for (const userId of [undefined, null, '']) {
    const h = harness(userId, { sourceFoodId: 'apple' });
    const out = await h.run();
    assertEquals(out.kind, 'refused');
    if (out.kind === 'refused') assertEquals(out.refusal.status, 401);
    assertEquals(h.seen, { householdLookups: [], foodsFor: [], kidLoads: 0, sourceLoads: 0 });
  }
});

Deno.test('another household\'s kid is 403 and no foods are returned', async () => {
  const h = harness('user-1', { sourceFoodId: 'apple', kidId: 'their-kid' });
  const out = await h.run();
  assertEquals(out.kind, 'refused');
  if (out.kind === 'refused') {
    assertEquals(out.refusal.status, 403);
    assertEquals(out.refusal.error, 'Forbidden');
  }
  assertEquals(h.seen.foodsFor, []);
});

Deno.test('another household\'s source food is 404', async () => {
  const out = await harness('user-1', { sourceFoodId: 'their-mango' }).run();
  assertEquals(out.kind, 'refused');
  if (out.kind === 'refused') assertEquals(out.refusal.status, 404);
});

Deno.test('own household: only that household\'s foods, minus the source', async () => {
  const out = await harness('user-1', { sourceFoodId: 'apple', kidId: 'my-kid' }).run();
  assertEquals(out.kind, 'scoped');
  if (out.kind === 'scoped') {
    assertEquals(out.householdId, MINE);
    assertEquals(out.candidates.map((f) => f.id), ['pear']);
    assertEquals(out.kid?.id, 'my-kid');
  }
});

Deno.test('a household id in the body is ignored', async () => {
  const h = harness('user-1', {
    sourceFoodId: 'apple',
    household_id: THEIRS,
    householdId: THEIRS,
  });
  const out = await h.run();
  assertEquals(h.seen.householdLookups, ['user-1']);
  assertEquals(h.seen.foodsFor, [MINE]);
  if (out.kind === 'scoped') assertEquals(out.householdId, MINE);
});

Deno.test('missing sourceFoodId is 400 with the old message; no household is 403', async () => {
  const missing = await harness('user-1', {}).run();
  if (missing.kind === 'refused') {
    assertEquals(missing.refusal.status, 400);
    assertEquals(missing.refusal.error, 'Source food ID is required');
  } else {
    throw new Error('expected a refusal');
  }
  const homeless = await harness('user-1', { sourceFoodId: 'apple' }, null).run();
  assertEquals(homeless.kind === 'refused' ? homeless.refusal.status : 0, 403);
});

Deno.test('a loader throw propagates for the handler to answer generically', async () => {
  await assertRejects(() =>
    resolveSimilarityScope<Row, Row>({
      userId: 'user-1',
      body: { sourceFoodId: 'apple' },
      lookupHousehold: () => Promise.reject(new Error('rpc down')),
      loadSourceFood: () => Promise.resolve(null),
      loadKid: () => Promise.resolve(null),
      loadHouseholdFoods: () => Promise.resolve([]),
    }),
  );
});
