import { describe, it, expect } from 'vitest';
import type { Food, Kid, Recipe, RecipeIngredient } from '@/types';
import {
  annotateResults,
  applyRelaxation,
  buildSolverInputs,
  describeExclusions,
  familyWins,
  filterRows,
  findSiblingMeals,
  minKidScore,
  parseFinderParams,
  rankReconciled,
  reconcileKidSelection,
  reconcileRow,
  recipeToSolverRecipe,
  topSiblingMeals,
  uncheckedIngredientNames,
  type FinderRow,
  type SolverResult,
} from './siblingMealFinder';
import { countUncheckedIngredients } from './kidFit';
import type { KidPlate } from './platePlanner';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function food(id: string, name: string, over: Partial<Food> = {}): Food {
  return {
    id,
    name,
    category: 'protein',
    is_safe: true,
    is_try_bite: false,
    allergens: [],
    ...over,
  };
}

function kid(id: string, name: string, over: Partial<Kid> = {}): Kid {
  return { id, name, allergens: [], ...over };
}

function row(recipeId: string, id: string, name: string, foodId: string | null): RecipeIngredient {
  return { id, recipe_id: recipeId, food_id: foodId, sort_order: 0, name };
}

function recipe(id: string, name: string, over: Partial<Recipe> = {}): Recipe {
  return { id, name, food_ids: [], total_time_minutes: 20, ...over };
}

const chicken = food('chicken', 'Chicken');
const rice = food('rice', 'Rice', { category: 'carb' });
const broccoli = food('broc', 'Broccoli', { category: 'vegetable' });
const peas = food('peas', 'Peas', { category: 'vegetable' });
const carrots = food('carrot', 'Carrots', { category: 'vegetable' });

function solve(args: { recipes: Recipe[]; foods: Food[]; kids: Kid[] }) {
  const results = findSiblingMeals({
    ...args,
    selectedKidIds: [],
    history: [],
    options: { limit: 50 },
  });
  const rows = annotateResults(results, { ...args, selectedKidIds: [] });
  return { results, rows };
}

const byId = (rows: FinderRow[], id: string) => rows.find((r) => r.result.recipeId === id)!;

// ---------------------------------------------------------------------------

describe('minKidScore', () => {
  it('returns 0 for no kids and the lowest per-kid score otherwise', () => {
    const base: SolverResult = {
      recipeId: 'r',
      recipeName: 'R',
      imageUrl: null,
      prepMinutes: 10,
      resolutionType: 'full_match',
      satisfactionScore: 90,
      perKidSatisfaction: [],
      swaps: [],
      splitPlates: [],
      excluded: false,
    };
    expect(minKidScore(base)).toBe(0);
    const ks = (score: number) => ({
      kidId: `k${score}`,
      kidName: 'K',
      score,
      hardViolations: [],
      softViolations: [],
      favoriteHits: [],
    });
    expect(minKidScore({ ...base, perKidSatisfaction: [ks(0.9), ks(0.4), ks(0.7)] })).toBeCloseTo(0.4);
  });
});

describe('recipeToSolverRecipe: every ingredient row is checked', () => {
  const mixed = recipe('pb', 'Chicken satay', {
    food_ids: ['chicken'],
    recipe_ingredients: [row('pb', 'i1', 'Chicken', 'chicken'), row('pb', 'i2', 'peanut butter', null)],
  });

  it('keeps a typed row as a food named by its text', () => {
    const sr = recipeToSolverRecipe(mixed, new Map([[chicken.id, chicken]]));
    expect(sr.foods.map((f) => f.id)).toEqual(['chicken', 'ing:i2']);
    expect(sr.foods[1].name).toBe('peanut butter');
  });

  it('a severe peanut allergy plus a typed "peanut butter" row excludes the dish', () => {
    const { results } = solve({
      recipes: [mixed],
      foods: [chicken],
      kids: [kid('a', 'Ava', { allergens: ['peanut'], allergen_severity: { peanut: 'severe' } }), kid('b', 'Ben')],
    });
    expect(results[0].excluded).toBe(true);
  });

  it('an unrated peanut allergy counts as severe', () => {
    const { results } = solve({
      recipes: [mixed],
      foods: [chicken],
      kids: [kid('a', 'Ava', { allergens: ['peanut'] })],
    });
    expect(results[0].excluded).toBe(true);
  });

  it('a mild peanut allergy split-plates rather than calling it a full match', () => {
    const { results } = solve({
      recipes: [mixed],
      foods: [chicken],
      kids: [kid('a', 'Ava', { allergens: ['peanut'], allergen_severity: { peanut: 'mild' } }), kid('b', 'Ben')],
    });
    expect(results[0].excluded).toBe(false);
    expect(results[0].resolutionType).toBe('split_plate');
  });

  it('unions food_ids no row covers, and names an unresolved id "Unknown ingredient"', () => {
    const r = recipe('x', 'X', {
      food_ids: ['chicken', 'rice', 'ghost'],
      recipe_ingredients: [row('x', 'i1', 'Chicken', 'chicken')],
    });
    const sr = recipeToSolverRecipe(r, new Map([chicken, rice].map((f) => [f.id, f])));
    expect(sr.foods.map((f) => f.id)).toEqual(['chicken', 'rice', 'ghost']);
    expect(sr.foods[2].name).toBe('Unknown ingredient');
  });
});

describe('annotateResults', () => {
  it('an unknown food id is one unchecked ingredient and the row is not verified', () => {
    const r = recipe('r', 'Mystery bowl', { food_ids: ['chicken', 'ghost'] });
    const { rows } = solve({ recipes: [r], foods: [chicken], kids: [kid('a', 'Ava'), kid('b', 'Ben')] });
    expect(rows[0].uncheckedIngredients).toHaveLength(1);
    expect(rows[0].verified).toBe(false);
  });

  it('agrees with kidFit.countUncheckedIngredients', () => {
    const foodById = new Map([chicken, rice].map((f) => [f.id, f]));
    const cases: Recipe[] = [
      recipe('a', 'A', { food_ids: ['chicken', 'ghost'] }),
      recipe('b', 'B', {
        food_ids: ['chicken'],
        recipe_ingredients: [row('b', 'i1', 'Chicken', 'chicken'), row('b', 'i2', 'salt', null)],
      }),
      recipe('c', 'C', {
        food_ids: ['rice', 'ghost2'],
        recipe_ingredients: [row('c', 'i1', 'Rice', 'rice'), row('c', 'i2', 'oil', null), row('c', 'i3', 'soy', null)],
      }),
      recipe('d', 'D', { food_ids: ['chicken', 'rice'] }),
    ];
    for (const r of cases) {
      expect(uncheckedIngredientNames(r, foodById)).toHaveLength(countUncheckedIngredients(r, foodById));
    }
  });

  it('an empty recipe is unchecked, not a family win, and ranks below a verified full match', () => {
    const empty = recipe('empty', 'Mystery casserole', { food_ids: [] });
    const good = recipe('good', 'Chicken and rice', { food_ids: ['chicken', 'rice'] });
    const kids = [kid('a', 'Ava'), kid('b', 'Ben')];
    const { rows } = solve({ recipes: [empty, good], foods: [chicken, rice], kids });
    const emptyRow = byId(rows, 'empty');
    expect(emptyRow.uncheckedIngredients).toEqual(['Mystery casserole']);
    expect(emptyRow.verified).toBe(false);
    expect(familyWins(rows).map((r) => r.result.recipeId)).toEqual(['good']);

    const reconciled = rows.map((r) => ({ row: r, reconciled: reconcileRow(r, undefined, kids) }));
    expect(reconciled.find((r) => r.row.result.recipeId === 'empty')!.reconciled.tier).not.toBe('everyone');
    expect(rankReconciled(reconciled).map((r) => r.row.result.recipeId)).toEqual(['good', 'empty']);
  });

  it('an empty recipe whose name hits a severe allergy is excluded-equivalent', () => {
    const empty = recipe('pbj', 'Peanut butter sandwich', { food_ids: [] });
    const kids = [kid('a', 'Ava', { allergens: ['peanut'] }), kid('b', 'Ben')];
    const { rows } = solve({ recipes: [empty], foods: [], kids });
    expect(rows[0].verified).toBe(false);
    expect(rows[0].nameAllergenHits?.[0]).toMatchObject({ kidId: 'a', allergen: 'peanut', copyKind: 'severeUnrated' });
    const rec = reconcileRow(rows[0], undefined, kids);
    expect(rec.tier).toBe('none');
    expect(rec.usableKidIds).toEqual([]);
    expect(rec.blocked[0]).toMatchObject({ kidId: 'a', cause: 'allergen', allergen: 'peanut' });
  });

  it('a kid with no allergy list on file makes the row unverified', () => {
    const good = recipe('good', 'Chicken and rice', { food_ids: ['chicken', 'rice'] });
    const noList = { id: 'c', name: 'Cal' } as Kid;
    const kids = [kid('a', 'Ava'), noList];
    const { rows } = solve({ recipes: [good], foods: [chicken, rice], kids });
    expect(rows[0].unknownAllergyKidIds).toEqual(['c']);
    expect(rows[0].verified).toBe(false);
    expect(reconcileRow(rows[0], [], kids).tier).toBe('unverified');
  });
});

describe('filterRows (end to end through the solver)', () => {
  // Ben dislikes broccoli. Peas can stand in (same category, checked allergens);
  // carrots are disliked too, so the "split" dish has no swap for them.
  const kids = [kid('a', 'Ava'), kid('b', 'Ben', { disliked_foods: ['broc', 'carrot', 'peas'] })];
  const ben2 = kid('b', 'Ben', { disliked_foods: ['broc'] });
  const recipes = [
    recipe('full', 'Chicken rice', { food_ids: ['chicken', 'rice'], total_time_minutes: 20 }),
    recipe('swap', 'Chicken broccoli', { food_ids: ['chicken', 'broc'], total_time_minutes: 40 }),
    recipe('split', 'Chicken carrots', { food_ids: ['chicken', 'carrot'] , total_time_minutes: 0 }),
    recipe('ex', 'Satay', {
      food_ids: ['chicken'],
      recipe_ingredients: [row('ex', 'i1', 'Chicken', 'chicken'), row('ex', 'i2', 'peanut sauce', null)],
    }),
  ];

  function rowsFor(kidsIn: Kid[]) {
    return solve({
      recipes,
      foods: [chicken, rice, broccoli, peas, carrots],
      kids: [...kidsIn, kid('c', 'Cal', { allergens: ['peanut'] })],
    }).rows;
  }

  it('the solver produces all three tiers plus an exclusion', () => {
    const rows = rowsFor([kids[0], ben2]);
    expect(byId(rows, 'full').result.resolutionType).toBe('full_match');
    expect(byId(rows, 'swap').result.resolutionType).toBe('with_swaps');
    expect(byId(rows, 'split').result.resolutionType).toBe('full_match');
    expect(byId(rows, 'ex').result.excluded).toBe(true);
    const rows2 = rowsFor(kids);
    expect(byId(rows2, 'split').result.resolutionType).toBe('split_plate');
    expect(byId(rows2, 'swap').result.resolutionType).toBe('split_plate');
  });

  it('as_is keeps full matches only; small_swaps adds swaps; separate_plates adds split plates', () => {
    const rows = [...rowsFor([kids[0], ben2]).filter((r) => r.result.recipeId !== 'split'), byId(rowsFor(kids), 'split')];
    const ids = (mode: 'as_is' | 'small_swaps' | 'separate_plates') =>
      filterRows(rows, { mode, prep: 'any' }).visible.map((r) => r.result.recipeId).sort();
    expect(ids('as_is')).toEqual(['full']);
    expect(ids('small_swaps')).toEqual(['full', 'swap']);
    expect(ids('separate_plates')).toEqual(['full', 'split', 'swap']);
  });

  it('never shows an excluded dish', () => {
    const rows = rowsFor(kids);
    for (const mode of ['as_is', 'small_swaps', 'separate_plates'] as const) {
      expect(filterRows(rows, { mode, prep: 'any' }).visible.some((r) => r.result.excluded)).toBe(false);
    }
  });

  it('a prep limit moves slower dishes aside and keeps untimed ones last', () => {
    const rows = rowsFor([kids[0], ben2]);
    const out = filterRows(rows, { mode: 'separate_plates', prep: 30 });
    expect(out.visible.map((r) => r.result.recipeId)).toEqual(['full', 'split']);
    expect(out.slower.map((r) => r.result.recipeId)).toEqual(['swap']);
    const anyPrep = filterRows(rows, { mode: 'separate_plates', prep: 'any' });
    expect(anyPrep.slower).toEqual([]);
    expect(anyPrep.visible).toHaveLength(3);
  });

  it('applyRelaxation (deprecated) still only responds to allowSwaps', () => {
    const results = rowsFor(kids).map((r) => r.result);
    const loose = applyRelaxation(results, { allowAversionsPerKid: 0, allowSwaps: true, hideSoftBlocks: true });
    expect(loose.length).toBe(results.filter((r) => !r.excluded).length);
  });
});

describe('swap pantry', () => {
  it('never offers a food whose allergens were never checked as a swap', () => {
    const unchecked = food('peas', 'Peas', { category: 'vegetable', allergens: undefined });
    const r = recipe('swap', 'Chicken broccoli', { food_ids: ['chicken', 'broc'] });
    const kids = [kid('a', 'Ava'), kid('b', 'Ben', { disliked_foods: ['broc'] })];
    const res = findSiblingMeals({
      recipes: [r],
      foods: [chicken, broccoli, unchecked],
      kids,
      selectedKidIds: [],
      history: [],
    });
    expect(res[0].resolutionType).toBe('split_plate');
    expect(res[0].swaps).toEqual([]);
  });

  it('puts in-stock foods first', () => {
    const out = buildSolverInputs([], [
      food('p1', 'Peas', { quantity: 0 }),
      food('p2', 'Corn', { quantity: 2 }),
      food('p3', 'Beans', { allergens: undefined, quantity: 5 }),
    ]);
    expect(out.pantry.map((f) => f.id)).toEqual(['p2', 'p1']);
  });

  it('topSiblingMeals uses the same inputs', () => {
    const r = recipe('full', 'Chicken rice', { food_ids: ['chicken', 'rice'] });
    const inputs = buildSolverInputs([r], [chicken, rice]);
    const res = topSiblingMeals(
      { recipes: [r], foods: [chicken, rice], kids: [kid('a', 'Ava')], selectedKidIds: [], history: [], inputs },
      3,
    );
    expect(res.map((x) => x.recipeId)).toEqual(['full']);
  });
});

// ---------------------------------------------------------------------------
// reconcileRow
// ---------------------------------------------------------------------------

function plate(kidId: string, over: Partial<KidPlate> = {}): KidPlate {
  return {
    kidId,
    kidName: kidId,
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

function finderRow(over: Partial<SolverResult> = {}, verified = true): FinderRow {
  const ks = (kidId: string, kidName: string) => ({
    kidId,
    kidName,
    score: 1,
    hardViolations: [],
    softViolations: [],
    favoriteHits: [],
  });
  return {
    result: {
      recipeId: 'r',
      recipeName: 'R',
      imageUrl: null,
      prepMinutes: 20,
      resolutionType: 'full_match',
      satisfactionScore: 100,
      perKidSatisfaction: [ks('a', 'Ava'), ks('b', 'Ben')],
      swaps: [],
      splitPlates: [],
      excluded: false,
      ...over,
    },
    uncheckedIngredients: verified ? [] : ['salt'],
    unknownAllergyKidIds: [],
    verified,
  };
}

const twoKids = [kid('a', 'Ava'), kid('b', 'Ben')];

describe('reconcileRow', () => {
  it('full_match with no plates is everyone', () => {
    expect(reconcileRow(finderRow(), undefined, twoKids)).toEqual({
      tier: 'everyone',
      usableKidIds: ['a', 'b'],
      blocked: [],
    });
  });

  it('a held-back or separated plate turns a full match into with_changes', () => {
    const held = plate('a', {
      heldBack: [{ componentId: 'c', componentName: 'Sauce', placement: 'held_back', reasons: [], separated: false }],
    });
    expect(reconcileRow(finderRow(), [held, plate('b')], twoKids).tier).toBe('with_changes');
  });

  it('with_swaps and split_plate are with_changes', () => {
    expect(reconcileRow(finderRow({ resolutionType: 'with_swaps' }), [], twoKids).tier).toBe('with_changes');
    expect(reconcileRow(finderRow({ resolutionType: 'split_plate' }), [], twoKids).tier).toBe('with_changes');
  });

  it('split_plate with a cannot_hold_back plate is some_blocked without that kid', () => {
    const blocked = plate('b', {
      blocked: true,
      blockedBy: { kind: 'cannot_hold_back', componentName: 'Noodles' },
    });
    const rec = reconcileRow(finderRow({ resolutionType: 'split_plate' }), [plate('a'), blocked], twoKids);
    expect(rec.tier).toBe('some_blocked');
    expect(rec.usableKidIds).toEqual(['a']);
    expect(rec.blocked).toEqual([{ kidId: 'b', kidName: 'Ben', cause: 'plate_blocked' }]);
  });

  it('a severe plate block carries the allergen and copy from the matching violation', () => {
    const row = finderRow({
      resolutionType: 'split_plate',
      perKidSatisfaction: [
        { kidId: 'a', kidName: 'Ava', score: 1, hardViolations: [], softViolations: [], favoriteHits: [] },
        {
          kidId: 'b',
          kidName: 'Ben',
          score: 0.9,
          hardViolations: [
            {
              foodId: 'f',
              foodName: 'Peanut sauce',
              reason: 'allergen (peanut)',
              severity: 'hard',
              allergenSeverity: 'severe',
              allergenSeverityRecorded: false,
              allergen: 'peanut',
            },
          ],
          softViolations: [],
          favoriteHits: [],
        },
      ],
    });
    const blocked = plate('b', {
      blocked: true,
      blockedBy: { kind: 'severe_allergen', copyKind: 'severeUnrated', componentName: 'Sauce', foodName: 'Peanut sauce' },
    });
    const rec = reconcileRow(row, [blocked], twoKids);
    expect(rec.blocked[0]).toEqual({
      kidId: 'b',
      kidName: 'Ben',
      allergen: 'peanut',
      copyKind: 'severeUnrated',
      cause: 'plate_blocked',
    });
  });

  it('an empty plate is some_blocked', () => {
    const rec = reconcileRow(finderRow(), [plate('a'), plate('b', { isEmpty: true })], twoKids);
    expect(rec.tier).toBe('some_blocked');
    expect(rec.blocked[0].cause).toBe('plate_empty');
  });

  it('all kids blocked is none', () => {
    const rec = reconcileRow(finderRow(), [plate('a', { isEmpty: true }), plate('b', { isEmpty: true })], twoKids);
    expect(rec.tier).toBe('none');
    expect(rec.usableKidIds).toEqual([]);
  });

  it('an unverified row is never everyone', () => {
    expect(reconcileRow(finderRow({}, false), [], twoKids).tier).toBe('unverified');
  });

  it('ignores plates for kids the row was not solved for', () => {
    expect(reconcileRow(finderRow(), [plate('z', { blocked: true })], twoKids).tier).toBe('everyone');
  });

  it('rankReconciled never puts some_blocked first and drops none', () => {
    const items = [
      { id: 'blocked', reconciled: { tier: 'some_blocked' as const, usableKidIds: ['a'], blocked: [] } },
      { id: 'none', reconciled: { tier: 'none' as const, usableKidIds: [], blocked: [] } },
      { id: 'unv', reconciled: { tier: 'unverified' as const, usableKidIds: ['a'], blocked: [] } },
      { id: 'chg', reconciled: { tier: 'with_changes' as const, usableKidIds: ['a'], blocked: [] } },
      { id: 'all', reconciled: { tier: 'everyone' as const, usableKidIds: ['a'], blocked: [] } },
    ];
    expect(rankReconciled(items).map((i) => i.id)).toEqual(['all', 'chg', 'unv', 'blocked']);
    expect(rankReconciled([items[0], items[2]])[0].id).toBe('unv');
  });
});

describe('describeExclusions', () => {
  it('names the kid and allergen, and marks an unrated allergy severeUnrated', () => {
    const r = recipe('ex', 'Satay', {
      food_ids: ['chicken'],
      recipe_ingredients: [row('ex', 'i1', 'Chicken', 'chicken'), row('ex', 'i2', 'peanut sauce', null)],
    });
    const { results } = solve({
      recipes: [r],
      foods: [chicken],
      kids: [
        kid('a', 'Ava', { allergens: ['peanut'] }),
        kid('b', 'Ben', { allergens: ['peanut'], allergen_severity: { peanut: 'severe' } }),
        kid('c', 'Cal'),
      ],
    });
    expect(describeExclusions(results)).toEqual([
      {
        recipeId: 'ex',
        recipeName: 'Satay',
        kids: [
          { kidId: 'a', kidName: 'Ava', foodName: 'peanut sauce', allergen: 'peanut', copyKind: 'severeUnrated' },
          { kidId: 'b', kidName: 'Ben', foodName: 'peanut sauce', allergen: 'peanut', copyKind: 'severe' },
        ],
      },
    ]);
  });

  it('reports a dietary conflict as dietary', () => {
    const beef = food('beef', 'Ground Beef');
    const peanut = food('pb', 'Peanut Butter', { allergens: ['peanut'] });
    const r = recipe('r', 'Beef and PB', { food_ids: ['beef', 'pb'] });
    const { results } = solve({
      recipes: [r],
      foods: [beef, peanut],
      kids: [kid('a', 'Ava', { dietary_restrictions: ['vegetarian'] }), kid('b', 'Ben', { allergens: ['peanut'] })],
    });
    const out = describeExclusions(results);
    expect(out[0].kids.find((k) => k.kidId === 'a')).toMatchObject({ copyKind: 'dietary', foodName: 'Ground Beef' });
  });
});

describe('reconcileKidSelection', () => {
  const kids = [kid('a', 'Ava'), kid('b', 'Ben'), kid('c', 'Cal')];

  it('selects everyone when nothing is saved', () => {
    expect(reconcileKidSelection(null, kids)).toEqual({ kidIds: ['a', 'b', 'c'], knownKidIds: ['a', 'b', 'c'] });
  });

  it('adds a new sibling and prunes a deleted id', () => {
    expect(reconcileKidSelection({ kidIds: ['a', 'gone'], knownKidIds: ['a', 'b', 'gone'] }, kids)).toEqual({
      kidIds: ['a', 'c'],
      knownKidIds: ['a', 'b', 'c'],
    });
  });

  it('keeps an explicit empty selection empty', () => {
    expect(reconcileKidSelection({ kidIds: [], knownKidIds: ['a', 'b', 'c'] }, kids).kidIds).toEqual([]);
  });
});

describe('parseFinderParams', () => {
  const kids = [kid('a', 'Ava'), kid('b', 'Ben')];
  const parse = (qs: string) => parseFinderParams(new URLSearchParams(qs), kids);

  it('reads a valid deep link', () => {
    expect(parse('date=2026-09-24&slot=dinner&kids=a,b&from=tonight_empty')).toEqual({
      date: '2026-09-24',
      slot: 'dinner',
      kidIds: ['a', 'b'],
      from: 'tonight_empty',
    });
  });

  it('drops a bad date, a bad slot, unknown kids and a bad from', () => {
    expect(parse('date=2026-02-30&slot=brunch&kids=zzz&from=<script>')).toEqual({});
    expect(parse('date=26-9-24')).toEqual({});
    expect(parse('kids=a,zzz,a').kidIds).toEqual(['a']);
  });
});
