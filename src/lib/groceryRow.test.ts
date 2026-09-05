import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  buildGroceryRow,
  GROCERY_DRAFT_PASSTHROUGH_KEYS,
  type GroceryRowDraft,
} from './groceryRow';

/**
 * One insert builder, pinned (US-777).
 *
 * Three hand-written field allowlists fed grocery_items, and each was a place a
 * column could be dropped without a word. It happened twice: US-713 restored
 * grocery_list_id, auto_generated and source_plan_entry_id after generated rows
 * landed on no list, and US-714 restored brand_preference, barcode, priority
 * and price_per_unit after the merge path discarded what the add dialog
 * collected. Same bug, two different doors.
 *
 * The core test is the everything-set one: a draft carrying every optional
 * column, asserting each survives. That is the assertion the two previous
 * regressions would have failed.
 */

const ctx = {
  userId: 'user-1',
  householdId: 'house-1',
  inferCategory: () => 'other',
};

describe('buildGroceryRow', () => {
  it('carries every optional column through', () => {
    const draft: Required<Omit<GroceryRowDraft, 'checked'>> = {
      name: 'ground beef',
      quantity: 2,
      unit: 'lb',
      category: 'protein',
      notes: '80/20',
      aisle: 'Meat',
      aisle_section: 'meat',
      grocery_list_id: 'list-1',
      added_via: 'scan',
      added_by_user_id: 'user-2',
      brand_preference: 'Store brand',
      barcode: '0123456789012',
      priority: 'high',
      price_per_unit: 5.99,
      currency: 'USD',
      photo_url: 'https://example.com/x.jpg',
      item_id: 'item-1',
      restock_reason: 'low',
      source_recipe_id: 'recipe-1',
      source_plan_entry_id: 'entry-1',
      auto_generated: true,
    };

    const row = buildGroceryRow(draft, ctx);

    // Every key the caller set must appear. Asserting field by field is the
    // point: a builder that drops one silently is exactly the bug.
    expect(row).toMatchObject({
      name: 'ground beef',
      quantity: 2,
      unit: 'lb',
      category: 'protein',
      notes: '80/20',
      aisle: 'Meat',
      aisle_section: 'meat',
      grocery_list_id: 'list-1',
      added_via: 'scan',
      added_by_user_id: 'user-2',
      brand_preference: 'Store brand',
      barcode: '0123456789012',
      priority: 'high',
      price_per_unit: 5.99,
      currency: 'USD',
      photo_url: 'https://example.com/x.jpg',
      item_id: 'item-1',
      restock_reason: 'low',
      source_recipe_id: 'recipe-1',
      source_plan_entry_id: 'entry-1',
      auto_generated: true,
      user_id: 'user-1',
      household_id: 'house-1',
      checked: false,
    });
  });

  it('sets the columns the builder owns, not the caller', () => {
    const row = buildGroceryRow({ name: 'milk' }, ctx);
    expect(row.user_id).toBe('user-1');
    expect(row.household_id).toBe('house-1');
  });

  it('defaults added_by_user_id to the acting user', () => {
    // The single-add path carried no attribution at all before this, so the
    // same field survived a bulk add and vanished on a single one.
    expect(buildGroceryRow({ name: 'milk' }, ctx).added_by_user_id).toBe('user-1');
  });

  it('keeps an explicit added_by_user_id', () => {
    expect(
      buildGroceryRow({ name: 'milk', added_by_user_id: 'user-9' }, ctx).added_by_user_id
    ).toBe('user-9');
  });

  it('infers a category only when the draft has none', () => {
    expect(buildGroceryRow({ name: 'milk' }, ctx).category).toBe('other');
    expect(buildGroceryRow({ name: 'milk', category: 'dairy' }, ctx).category).toBe('dairy');
  });

  it('defaults quantity to 1 and unit to an empty string', () => {
    const row = buildGroceryRow({ name: 'milk' }, ctx);
    expect(row.quantity).toBe(1);
    expect(row.unit).toBe('');
  });

  it('keeps a quantity of 0 rather than turning it into 1', () => {
    // `|| 1`, which both old builders used, silently rewrote a deliberate 0.
    expect(buildGroceryRow({ name: 'milk', quantity: 0 }, ctx).quantity).toBe(0);
  });

  it('keeps a price of 0', () => {
    expect(buildGroceryRow({ name: 'milk', price_per_unit: 0 }, ctx).price_per_unit).toBe(0);
  });

  it('omits optional columns that were not supplied, leaving DB defaults alone', () => {
    const row = buildGroceryRow({ name: 'milk' }, ctx);
    for (const key of GROCERY_DRAFT_PASSTHROUGH_KEYS) {
      expect(row).not.toHaveProperty(key);
    }
  });

  it('omits an explicit null rather than writing it', () => {
    const row = buildGroceryRow({ name: 'milk', barcode: null, priority: null }, ctx);
    expect(row).not.toHaveProperty('barcode');
    expect(row).not.toHaveProperty('priority');
  });

  it('keeps auto_generated false out of the row but true in it', () => {
    expect(buildGroceryRow({ name: 'x', auto_generated: true }, ctx).auto_generated).toBe(true);
    expect(buildGroceryRow({ name: 'x', auto_generated: false }, ctx).auto_generated).toBe(false);
  });
});

describe('GroceryContext uses the builder on every insert path', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src', 'contexts', 'GroceryContext.tsx'),
    'utf8'
  );

  it('calls buildGroceryRow rather than assembling rows inline', () => {
    expect(source).toContain('buildGroceryRow');
  });

  it('has no hand-written insert field list left', () => {
    // The shape both old builders shared. Its return is what regressed twice.
    expect(source).not.toMatch(/const row: Record<string, unknown> = \{/);
    expect(source).not.toMatch(/const newItem: Record<string, unknown> = \{/);
  });

  it('assigns no insert column conditionally', () => {
    // `if (item.barcode) row.barcode = ...` is the pattern that dropped fields;
    // there should be none of it left on the insert paths.
    expect(source).not.toMatch(/if \(item\.\w+\) (?:row|newItem)\.\w+ =/);
  });
});
