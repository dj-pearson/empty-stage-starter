import { describe, it, expect } from 'vitest';
import {
  planRegenerationFromPlan,
  MEAL_PLAN_SYNC,
  categoryLabel,
  filterItemsByList,
  splitByChecked,
  computeProgressPercent,
  milestoneMessage,
  groupItems,
  flattenGroupedRows,
  buildFoodByDisplayNameIndex,
  initialExpandedGroups,
  reconcileExpandedGroups,
  orderGroupNames,
  withLingering,
  stepQuantity,
  milestoneKey,
  buildGroceryKidIndex,
  groceryKidKey,
} from './groceryData';
import { resolveFood, type CatalogEntry, type EffectiveFood } from '@/lib/effectiveFood';
import type { Food, GroceryItem, PlanEntry } from '@/types';

const item = (id: string, over: Partial<GroceryItem> = {}): GroceryItem =>
  ({
    id,
    name: id,
    quantity: 1,
    unit: 'ea',
    checked: false,
    category: 'protein',
    ...over,
  }) as GroceryItem;

describe('groceryData (US-553 AC2)', () => {
  it('categoryLabel maps known categories and falls back to Other', () => {
    expect(categoryLabel('protein')).toBe('Protein');
    expect(categoryLabel('vegetable')).toBe('Vegetables');
    expect(categoryLabel('other')).toBe('Other');
    expect(categoryLabel(null)).toBe('Other');
    expect(categoryLabel(undefined)).toBe('Other');
  });

  it('filterItemsByList restricts to the selected list or returns all', () => {
    const items = [item('a', { grocery_list_id: 'L1' }), item('b', { grocery_list_id: 'L2' })];
    expect(filterItemsByList(items, 'L1').map((i) => i.id)).toEqual(['a']);
    expect(filterItemsByList(items, null).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('splitByChecked separates active and purchased', () => {
    const items = [item('a'), item('b', { checked: true }), item('c')];
    const { active, purchased } = splitByChecked(items);
    expect(active.map((i) => i.id)).toEqual(['a', 'c']);
    expect(purchased.map((i) => i.id)).toEqual(['b']);
  });

  it('computeProgressPercent floors and guards divide-by-zero', () => {
    expect(computeProgressPercent(0, 0)).toBe(0);
    expect(computeProgressPercent(4, 1)).toBe(25);
    expect(computeProgressPercent(3, 1)).toBe(33);
    expect(computeProgressPercent(3, 3)).toBe(100);
  });

  it('milestoneMessage returns tiered encouragement', () => {
    expect(milestoneMessage(0)).toBe('');
    expect(milestoneMessage(25)).toBe('Great start!');
    expect(milestoneMessage(50)).toBe('Halfway there!');
    expect(milestoneMessage(75)).toBe('Almost done!');
    expect(milestoneMessage(100)).toBe('Shopping complete!');
  });

  it('groupItems buckets by category label and by aisle with fallbacks', () => {
    const items = [
      item('a', { category: 'protein', aisle: 'Meat' }),
      item('b', { category: 'weird' as GroceryItem['category'], aisle: undefined }),
    ];
    const byCat = groupItems(items, 'category');
    expect(byCat.Protein.map((i) => i.id)).toEqual(['a']);
    expect(byCat.Other.map((i) => i.id)).toEqual(['b']);

    const byAisle = groupItems(items, 'aisle');
    expect(byAisle.Meat.map((i) => i.id)).toEqual(['a']);
    expect(byAisle.Uncategorized.map((i) => i.id)).toEqual(['b']);
  });

  it('flattenGroupedRows emits a header per non-empty group then its items', () => {
    const grouped = { Meat: [item('a'), item('b')], Empty: [], Produce: [item('c')] };
    const rows = flattenGroupedRows(grouped);
    expect(rows).toEqual([
      { type: 'header', group: 'Meat', count: 2 },
      { type: 'item', item: grouped.Meat[0], group: 'Meat' },
      { type: 'item', item: grouped.Meat[1], group: 'Meat' },
      { type: 'header', group: 'Produce', count: 1 },
      { type: 'item', item: grouped.Produce[0], group: 'Produce' },
    ]);
  });
});

describe('buildFoodByDisplayNameIndex (US-795 fix round)', () => {
  const pantryFood = (over: Partial<Food> & { id: string }): Food =>
    ({
      name: over.id,
      category: 'protein',
      is_safe: true,
      is_try_bite: false,
      canonical_id: null,
      ...over,
    }) as Food;

  const catalog = (over: Partial<CatalogEntry> & { id: string; name: string }): CatalogEntry => ({
    default_category: null,
    default_aisle_section: null,
    verification: 'verified',
    ...over,
  });

  it(
    'finds a catalog-linked food by its CATALOG name, not just its household name',
    () => {
      // Reproduces the round-trip bug the review found: US-796 can link a food
      // to a catalog row by barcode, which puts no constraint on the name at
      // all -- "ground beef" (household) can link to "Beef, ground, 80% lean"
      // (catalog). A grocery row built from the resolver shows the catalog
      // name (that IS the visible point of the story). Checking that row off
      // has to find the SAME pantry food that spelling came from, or the
      // toggle handler creates a second food with `is_safe: true` hardcoded
      // and orphans the original -- which might be `is_safe: false`.
      const linked = pantryFood({ id: 'f1', name: 'ground beef', is_safe: false, canonical_id: 'cat-1' });
      const catalogById = {
        'cat-1': catalog({ id: 'cat-1', name: 'Beef, ground, 80% lean' }),
      };
      const index = buildFoodByDisplayNameIndex([linked], catalogById);

      // The grocery item was written under the catalog name (what the
      // resolver now puts on the row).
      const found = index.get('beef, ground, 80% lean');
      expect(found).toBe(linked);
      expect(found?.is_safe).toBe(false); // still the household's own flag
    },
  );

  it('still finds an unlinked (or old-row) food by its household name', () => {
    const unlinked = pantryFood({ id: 'f2', name: 'rice' });
    const index = buildFoodByDisplayNameIndex([unlinked], {});
    expect(index.get('rice')).toBe(unlinked);
  });

  it('still finds a linked food by its household name too (rows written before linking)', () => {
    const linked = pantryFood({ id: 'f3', name: 'milk', canonical_id: 'cat-2' });
    const catalogById = { 'cat-2': catalog({ id: 'cat-2', name: 'Whole Milk' }) };
    const index = buildFoodByDisplayNameIndex([linked], catalogById);
    expect(index.get('milk')).toBe(linked);
    expect(index.get('whole milk')).toBe(linked);
  });
});

/**
 * US-767: which aisles are open when a shopper opens the list on a phone.
 */
describe('initialExpandedGroups', () => {
  it('opens only the first group at phone width', () => {
    const open = initialExpandedGroups(['Produce', 'Dairy', 'Frozen'], true);
    expect([...open]).toEqual(['Produce']);
  });

  it('opens everything on a desktop, so that view is unchanged', () => {
    const open = initialExpandedGroups(['Produce', 'Dairy', 'Frozen'], false);
    expect([...open].sort()).toEqual(['Dairy', 'Frozen', 'Produce']);
  });

  it('copes with an empty list rather than opening a group that is not there', () => {
    expect([...initialExpandedGroups([], true)]).toEqual([]);
    expect([...initialExpandedGroups([], false)]).toEqual([]);
  });

  it('follows the render order, because a shopper works down the list', () => {
    // groupItems preserves insertion order, so "first" means the aisle at the
    // top of the page -- not alphabetically first.
    expect([...initialExpandedGroups(['Frozen', 'Produce'], true)]).toEqual(['Frozen']);
  });
});

describe('reconcileExpandedGroups', () => {
  it('keeps a group the shopper opened when the list re-groups', () => {
    // Checking an item off re-runs groupItems. Slamming Dairy shut because of
    // that would undo a deliberate tap.
    const open = reconcileExpandedGroups(new Set(['Dairy']), ['Produce', 'Dairy'], true);
    expect([...open]).toEqual(['Dairy']);
  });

  it('keeps several open groups', () => {
    const open = reconcileExpandedGroups(
      new Set(['Produce', 'Dairy']),
      ['Produce', 'Dairy', 'Frozen'],
      true,
    );
    expect([...open].sort()).toEqual(['Dairy', 'Produce']);
  });

  it('drops a group that no longer exists instead of remembering it forever', () => {
    const open = reconcileExpandedGroups(new Set(['Produce', 'Gone']), ['Produce'], true);
    expect([...open]).toEqual(['Produce']);
  });

  it('falls back to the default rather than leaving everything shut', () => {
    // The shopper finished the only aisle they had open.
    const open = reconcileExpandedGroups(new Set(['Produce']), ['Dairy', 'Frozen'], true);
    expect([...open]).toEqual(['Dairy']);
  });

  it('opens everything again when the viewport grows past phone width', () => {
    const open = reconcileExpandedGroups(new Set(['Dairy']), ['Produce', 'Dairy'], false);
    expect([...open].sort()).toEqual(['Dairy', 'Produce']);
  });

  it('returns an empty set for an empty list at either width', () => {
    expect([...reconcileExpandedGroups(new Set(['Old']), [], true)]).toEqual([]);
    expect([...reconcileExpandedGroups(new Set(['Old']), [], false)]).toEqual([]);
  });
});

/**
 * The loop this prevents is not visible in review. The caller runs
 * reconcileExpandedGroups in an effect, and groupItems returns a fresh object
 * every render -- so a new Set each time sets state, re-renders, re-groups and
 * runs the effect again. It presented as a vitest worker dying with
 * "Ineffective mark-compacts near heap limit", with 9.9GB free.
 */
describe('reconcileExpandedGroups is identity-stable', () => {
  it('returns the SAME set object when nothing changed', () => {
    const previous = new Set(['Produce', 'Dairy']);
    expect(reconcileExpandedGroups(previous, ['Produce', 'Dairy'], true)).toBe(previous);
  });

  it('is stable regardless of the order the groups arrive in', () => {
    const previous = new Set(['Produce', 'Dairy']);
    expect(reconcileExpandedGroups(previous, ['Dairy', 'Produce'], true)).toBe(previous);
  });

  it('is stable on the desktop branch too', () => {
    const previous = new Set(['Produce', 'Dairy']);
    expect(reconcileExpandedGroups(previous, ['Produce', 'Dairy'], false)).toBe(previous);
  });

  it('returns a NEW set when something actually changed', () => {
    const previous = new Set(['Produce']);
    const next = reconcileExpandedGroups(previous, ['Produce', 'Dairy'], false);
    expect(next).not.toBe(previous);
    expect([...next].sort()).toEqual(['Dairy', 'Produce']);
  });

  it('settles after one application, so a second pass changes nothing', () => {
    const first = reconcileExpandedGroups(new Set(['Gone']), ['Produce', 'Dairy'], true);
    const second = reconcileExpandedGroups(first, ['Produce', 'Dairy'], true);
    expect(second).toBe(first);
  });
});

describe('planRegenerationFromPlan window scope', () => {
  const syncRow = (id: string, name: string, source: string | undefined): GroceryItem => ({
    id,
    name,
    quantity: 1,
    unit: 'servings',
    checked: false,
    category: 'protein',
    auto_generated: true,
    added_via: MEAL_PLAN_SYNC,
    source_plan_entry_id: source,
  }) as GroceryItem;

  const existing = [
    syncRow('this-week', 'Chicken', 'e-this-week'),
    syncRow('next-week-stale', 'Rice', 'e-next-week'),
    syncRow('no-source', 'Beans', undefined),
  ];

  it('retires only stale rows whose source entry is in the synced window', () => {
    const plan = planRegenerationFromPlan({
      existing,
      generated: [{ name: 'Pasta', quantity: 1, source_plan_entry_id: 'e-next-week-2' }],
      selectedListId: null,
      windowEntryIds: ['e-next-week', 'e-next-week-2'],
    });
    expect(plan.retireIds).toEqual(['next-week-stale']);
    expect(plan.additions.map((a) => a.name)).toEqual(['Pasta']);
  });

  it('with no window keeps the old behaviour and retires every stale sync row', () => {
    const plan = planRegenerationFromPlan({
      existing,
      generated: [{ name: 'Pasta', quantity: 1 }],
      selectedListId: null,
    });
    expect(plan.retireIds.sort()).toEqual(['next-week-stale', 'no-source', 'this-week']);
  });
});

describe('grocery list layout helpers', () => {
  const grouped = {
    Dairy: [item('milk'), item('cheese')],
    Produce: [item('apple')],
    Uncategorized: [item('mystery')],
  };

  it('flattenGroupedRows emits every header but only expanded groups items, in order', () => {
    const rows = flattenGroupedRows(grouped, {
      expanded: new Set(['Produce']),
      order: ['Produce', 'Dairy', 'Uncategorized'],
    });
    expect(rows.map((r) => (r.type === 'header' ? `#${r.group}:${r.count}` : r.item.id))).toEqual([
      '#Produce:1',
      'apple',
      '#Dairy:2',
      '#Uncategorized:1',
    ]);
  });

  it('flattenGroupedRows keeps groups the order does not name, and opens all by default', () => {
    const rows = flattenGroupedRows(grouped, { order: ['Uncategorized'] });
    expect(rows.filter((r) => r.type === 'header').map((r) => r.group)).toEqual([
      'Uncategorized',
      'Dairy',
      'Produce',
    ]);
    expect(rows.filter((r) => r.type === 'item')).toHaveLength(4);
  });

  it('orderGroupNames sorts alphabetically with Uncategorized and Other last', () => {
    expect(orderGroupNames(['Uncategorized', 'Produce', 'Aisle 12', 'Aisle 2', 'Bakery'], 'aisle')).toEqual([
      'Aisle 2',
      'Aisle 12',
      'Bakery',
      'Produce',
      'Uncategorized',
    ]);
    expect(orderGroupNames(['Other', 'Snacks', 'Dairy'], 'category')).toEqual(['Dairy', 'Snacks', 'Other']);
  });

  it('initialExpandedGroups opens the first group in the given order on a phone', () => {
    expect([...initialExpandedGroups(['Dairy', 'Produce'], true, ['Produce', 'Dairy'])]).toEqual(['Produce']);
    expect([...initialExpandedGroups(['Dairy', 'Produce'], true)]).toEqual(['Dairy']);
  });

  it('withLingering keeps a just-checked row in active, in place', () => {
    const all = [item('a'), item('b', { checked: true }), item('c'), item('d', { checked: true })];
    const active = all.filter((i) => !i.checked);
    const purchased = all.filter((i) => i.checked);

    const placed = withLingering(active, purchased, new Set(['b']), all);
    expect(placed.active.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(placed.purchased.map((i) => i.id)).toEqual(['d']);

    const appended = withLingering(active, purchased, new Set(['b']));
    expect(appended.active.map((i) => i.id)).toEqual(['a', 'c', 'b']);

    const none = withLingering(active, purchased, new Set());
    expect(none.active).toBe(active);
    expect(none.purchased).toBe(purchased);
  });

  it('stepQuantity takes quarters below 1 and whole steps from 1, never below 0.25', () => {
    expect(stepQuantity(0.25, 1)).toBe(0.5);
    expect(stepQuantity(0.75, 1)).toBe(1);
    expect(stepQuantity(1, 1)).toBe(2);
    expect(stepQuantity(3, -1)).toBe(2);
    expect(stepQuantity(1, -1)).toBe(0.75);
    expect(stepQuantity(1.5, -1)).toBe(1);
    expect(stepQuantity(0.25, -1)).toBe(0.25);
    expect(stepQuantity(0.5, -3)).toBe(0.25);
    expect(stepQuantity(2, 0)).toBe(2);
  });

  it('milestoneKey maps progress to an i18n key', () => {
    expect(milestoneKey(0)).toBeNull();
    expect(milestoneKey(24)).toBeNull();
    expect(milestoneKey(25)).toBe('grocery.progress.milestone.start');
    expect(milestoneKey(50)).toBe('grocery.progress.milestone.halfway');
    expect(milestoneKey(75)).toBe('grocery.progress.milestone.almost');
    expect(milestoneKey(100)).toBe('grocery.progress.milestone.complete');
  });

  it('does not call a list complete while an item is left (Math.floor at 199/200)', () => {
    expect(computeProgressPercent(200, 199)).toBe(99);
    expect(milestoneKey(computeProgressPercent(200, 199))).toBe('grocery.progress.milestone.almost');
    expect(computeProgressPercent(200, 200)).toBe(100);
  });
});

describe('buildGroceryKidIndex', () => {
  const foods: Food[] = [
    { id: 'f-milk', name: 'milk', category: 'dairy', is_safe: true, is_try_bite: false },
    { id: 'f-pasta', name: 'Pasta', category: 'carb', is_safe: true, is_try_bite: false },
  ];
  const effective: Record<string, EffectiveFood> = Object.fromEntries(
    foods.map((f) => [f.id, resolveFood(f, null)]),
  );
  const WEEK = { from: '2026-09-06', to: '2026-09-12' };

  it('attributes milk to both kids, not just the entry that first put it on the list', () => {
    const entries: PlanEntry[] = [
      { id: 'e1', kid_id: 'ava', date: '2026-09-07', meal_slot: 'breakfast', food_id: 'f-milk', result: null },
      { id: 'e2', kid_id: 'sam', date: '2026-09-08', meal_slot: 'breakfast', food_id: 'f-milk', result: null },
      { id: 'e3', kid_id: 'ava', date: '2026-09-09', meal_slot: 'breakfast', food_id: 'f-milk', result: null },
      { id: 'e4', kid_id: 'sam', date: '2026-09-07', meal_slot: 'dinner', food_id: 'f-pasta', result: null },
      // Next week: not this list's business.
      { id: 'e5', kid_id: 'leo', date: '2026-09-14', meal_slot: 'dinner', food_id: 'f-pasta', result: null },
    ];
    const index = buildGroceryKidIndex(entries, foods, effective, WEEK);
    expect(index.get(groceryKidKey('Milk'))).toEqual(['ava', 'sam']);
    expect(index.get(groceryKidKey(' pasta '))).toEqual(['sam']);
  });
});

describe('planRegenerationFromPlan grows a kept row', () => {
  it('emits a bump when the plan now needs more of a kept row', () => {
    const existing = [
      item('pasta-row', {
        name: 'Pasta',
        quantity: 1,
        unit: 'box',
        auto_generated: true,
        added_via: MEAL_PLAN_SYNC,
        source_plan_entry_id: 'e1',
      }),
    ];
    const plan = planRegenerationFromPlan({
      existing,
      generated: [{ name: 'Pasta', quantity: 3, unit: 'box', source_plan_entry_id: 'e1' }],
      selectedListId: null,
    });
    expect(plan.additions).toEqual([]);
    expect(plan.retireIds).toEqual([]);
    expect(plan.updates).toEqual([{ id: 'pasta-row', name: 'Pasta', unit: 'box', quantity: 3, delta: 2 }]);
  });

  it('never shrinks a row, and leaves a row in another unit or with a hand-added twin', () => {
    const syncRow = (over: Partial<GroceryItem>) =>
      item(over.id ?? 'x', { auto_generated: true, added_via: MEAL_PLAN_SYNC, ...over });
    const shrink = planRegenerationFromPlan({
      existing: [syncRow({ id: 'p', name: 'Pasta', quantity: 5, unit: 'box' })],
      generated: [{ name: 'Pasta', quantity: 2, unit: 'box' }],
      selectedListId: null,
    });
    expect(shrink.updates).toEqual([]);

    const otherUnit = planRegenerationFromPlan({
      existing: [syncRow({ id: 'p', name: 'Pasta', quantity: 1, unit: 'lb' })],
      generated: [{ name: 'Pasta', quantity: 3, unit: 'box' }],
      selectedListId: null,
    });
    expect(otherUnit.updates).toEqual([]);

    const twin = planRegenerationFromPlan({
      existing: [
        item('hand', { name: 'Pasta', quantity: 1, unit: 'box' }),
        syncRow({ id: 'p', name: 'Pasta', quantity: 1, unit: 'box' }),
      ],
      generated: [{ name: 'Pasta', quantity: 3, unit: 'box' }],
      selectedListId: null,
    });
    expect(twin.updates).toEqual([]);
  });
});
