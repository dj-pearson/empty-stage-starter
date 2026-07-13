import { describe, it, expect } from 'vitest';
import {
  categoryLabel,
  filterItemsByList,
  splitByChecked,
  computeProgressPercent,
  milestoneMessage,
  groupItems,
  flattenGroupedRows,
} from './groceryData';
import type { GroceryItem } from '@/types';

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
