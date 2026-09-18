import { describe, it, expect } from 'vitest';
import {
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
} from './groceryData';
import type { CatalogEntry } from '@/lib/effectiveFood';
import type { Food, GroceryItem } from '@/types';

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

  it('computeProgressPercent rounds and guards divide-by-zero', () => {
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
