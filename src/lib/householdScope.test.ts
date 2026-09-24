import { describe, it, expect } from 'vitest';
import { enTranslation } from '@/i18n/appLocale';
import { NAV_ITEMS } from './navigation';
import { HOUSEHOLD_LINKS, PRIVATE_SCOPE_KEYS, SHARED_SCOPE_KEYS } from './householdScope';

type Tree = { [key: string]: string | Tree };

function resolve(tree: Tree, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Tree)[part] : undefined),
    tree,
  );
}

describe('household sharing scope', () => {
  it('lists the shared items in order', () => {
    expect(SHARED_SCOPE_KEYS.map((k) => k.split('.').pop())).toEqual([
      'kids',
      'plan',
      'grocery',
      'pantry',
      'recipes',
      'collections',
      'aisles',
      'notes',
    ]);
  });

  it.each([...SHARED_SCOPE_KEYS, ...PRIVATE_SCOPE_KEYS])('%s has English copy', (key) => {
    const value = resolve(enTranslation as Tree, key);
    expect(typeof value).toBe('string');
    expect((value as string).trim().length).toBeGreaterThan(0);
  });

  it('links only to routes in the navigation list', () => {
    const paths = new Set(NAV_ITEMS.map((item) => item.to));
    for (const path of Object.values(HOUSEHOLD_LINKS)) expect(paths.has(path)).toBe(true);
    expect(HOUSEHOLD_LINKS).toEqual({
      careCards: '/dashboard/kids',
      foodJournal: '/dashboard/food-journal',
      billing: '/dashboard/billing',
    });
  });
});
