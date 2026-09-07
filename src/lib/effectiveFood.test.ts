import { describe, it, expect } from 'vitest';
import { resolveFood, aisleDisplayName, type CatalogEntry } from './effectiveFood';
import type { Food } from '@/types';

const householdFood: Food = {
  id: 'f1',
  name: 'cheddar cheese',
  category: 'dairy',
  is_safe: true,
  is_try_bite: false,
  aisle: 'Whatever the parent typed',
  quantity: 2,
  unit: 'block',
};

const catalog: CatalogEntry = {
  id: 'c1',
  name: 'Cheese, cheddar',
  default_category: 'dairy',
  default_aisle_section: 'dairy',
  verification: 'verified',
};

describe('resolveFood', () => {
  it('uses the household row when there is no catalog match', () => {
    const r = resolveFood(householdFood, null);
    expect(r.name).toBe('cheddar cheese');
    expect(r.aisle).toBe('Whatever the parent typed');
    expect(r.isCanonical).toBe(false);
  });

  it('prefers catalog values when linked', () => {
    const r = resolveFood(householdFood, catalog);
    expect(r.name).toBe('Cheese, cheddar');
    expect(r.aisle).toBe('Dairy');
    expect(r.aisleRaw).toBe('dairy');
    expect(r.isCanonical).toBe(true);
  });

  it('NEVER takes household state from the catalog', () => {
    // The catalog has no is_safe and must never appear to. A wrong is_safe is
    // a child eating something they react to.
    const r = resolveFood(householdFood, catalog) as unknown as Record<string, unknown>;
    expect(r.is_safe).toBeUndefined();
    expect(r.quantity).toBeUndefined();
    expect(r.is_try_bite).toBeUndefined();
  });

  it('falls back to the household value when a catalog field is null', () => {
    const sparse: CatalogEntry = { ...catalog, default_aisle_section: null, default_category: null };
    const r = resolveFood(householdFood, sparse);
    expect(r.aisle).toBe('Whatever the parent typed');
    expect(r.category).toBe('dairy');
  });

  it('reports verification so unverified rows can be marked', () => {
    expect(resolveFood(householdFood, { ...catalog, verification: 'unverified' }).isVerified).toBe(false);
    expect(resolveFood(householdFood, catalog).isVerified).toBe(true);
  });

  it('ignores a catalog category that is not a FoodCategory', () => {
    // Nothing constrains default_category in the database, so a bad value
    // must not become the food's category.
    const r = resolveFood(householdFood, { ...catalog, default_category: 'Protein' });
    expect(r.category).toBe('dairy');
  });
});

describe('aisleDisplayName', () => {
  it('maps every iOS rawValue to human text', () => {
    expect(aisleDisplayName('meat_deli')).toBe('Meat & Deli');
    expect(aisleDisplayName('rice_grains')).toBe('Rice & Grains');
    expect(aisleDisplayName('frozen_veg')).toBe('Frozen Vegetables');
  });

  it('returns undefined for an unknown or absent rawValue rather than echoing it', () => {
    expect(aisleDisplayName(null)).toBeUndefined();
    expect(aisleDisplayName(undefined)).toBeUndefined();
    expect(aisleDisplayName('Produce')).toBeUndefined(); // a web display string is NOT a rawValue
  });
});
