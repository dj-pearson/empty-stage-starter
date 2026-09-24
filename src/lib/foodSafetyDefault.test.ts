import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE } from './foodSafetyDefault';
import { acceptedRowsToFoods } from './receiptParse';
import { parseFoodsCsv } from './parseFoodsCsv';
import { NEW_FOOD_SAFETY, safetyFromFlags } from './foodSafetyChoice';

/**
 * US-803. `is_safe` is the flag a parent sets deliberately, and the one where
 * being wrong costs the most: EatPal is built for ARFID and selective eating,
 * the safe-food ladder reads this flag, and a food silently marked safe puts a
 * meal in front of a child that was never going to work.
 *
 * Five paths created a food with `is_safe: true` hardcoded, all from the same
 * kind of action -- checking a grocery item off, scanning a barcode,
 * photographing a food, parsing a receipt, importing a CSV. Every one means
 * "this is in my house". None means "my child eats this".
 */

const ROOT = path.resolve(__dirname, '..', '..');

describe('a food the app created is not marked safe', () => {
  it('the default is false', () => {
    expect(ACQUIRED_FOOD_IS_SAFE).toBe(false);
    expect(ACQUIRED_FOOD_IS_TRY_BITE).toBe(false);
  });

  it('a receipt row becomes an unmarked pantry food', () => {
    // The one path that is a pure function, so it can be exercised rather than
    // read. A receipt says what was bought and nothing more.
    const { creates: foods } = acceptedRowsToFoods([
      {
        accept: true,
        parsedName: 'Broccoli',
        category: 'vegetable',
        qty: 1,
        unit: 'bag',
      } as Parameters<typeof acceptedRowsToFoods>[0][number],
    ]);

    expect(foods).toHaveLength(1);
    expect(foods[0].is_safe).toBe(false);
    expect(foods[0].is_try_bite).toBe(false);
  });
});

describe('the add-food dialog and the CSV import start unmarked', () => {
  it('a new food in AddFoodDialog opens on "Not set"', () => {
    // The dialog used to open with the Safe switch on (setIsSafe(true)).
    expect(NEW_FOOD_SAFETY).toBe(safetyFromFlags(ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE));
    expect(NEW_FOOD_SAFETY).toBe('none');
  });

  it('a CSV row that says nothing about safety is the acquired default', () => {
    const { foods } = parseFoodsCsv('name,category,is_safe,is_try_bite\nBroccoli,vegetable,,');
    expect(foods[0].is_safe).toBe(ACQUIRED_FOOD_IS_SAFE);
    expect(foods[0].is_try_bite).toBe(ACQUIRED_FOOD_IS_TRY_BITE);
  });
});

/**
 * The other four write through React components, so they are guarded at the
 * source. What matters is the shape that must not come back: a literal
 * `is_safe: true` on a food the parent did not mark.
 */
describe('no acquisition path hardcodes a safe food', () => {
  const ACQUISITION_PATHS = [
    'src/pages/Grocery.tsx', // check-off, and the done-shopping fallback
    'src/pages/Pantry.tsx', // both quick-add paths
    'src/components/admin/BarcodeScannerDialog.tsx',
    'src/lib/receiptParse.ts',
    'src/lib/parseFoodsCsv.ts', // the CSV import's parser
    'src/lib/foodSafetyChoice.ts', // AddFoodDialog's new-food default
    'src/components/settings/DataImport.tsx',
  ];

  it.each(ACQUISITION_PATHS)('%s uses the shared default', (file) => {
    const src = readFileSync(path.join(ROOT, file), 'utf8');
    expect(src).toContain('ACQUIRED_FOOD_IS_SAFE');
    expect(src, 'is_safe: true is the defect this story removed').not.toMatch(
      /is_safe:\s*true/
    );
  });

  it('the photo path has no safety flag to set at all', () => {
    // ImageFoodCapture used to stamp is_safe onto what it handed the page.
    // FoodIdentification no longer has the field, so the page's own
    // ACQUIRED_FOOD_IS_SAFE is the only answer that can reach the insert.
    const src = readFileSync(path.join(ROOT, 'src/components/ImageFoodCapture.tsx'), 'utf8');
    const shape = src.slice(src.indexOf('export interface FoodIdentification'));
    expect(shape.slice(0, shape.indexOf('}'))).not.toMatch(/^\s*is_safe\??:/m);
    expect(src).not.toMatch(/is_safe:\s*true/);
  });

  it('finds no sixth path that slipped in', () => {
    // A new "add this food for me" flow is exactly how this comes back. The
    // curated onboarding starters are the deliberate exception: a parent is
    // picking those from a list of typical safe foods, which is a choice rather
    // than an assumption.
    const ALLOWED = new Set([
      'src/contexts/AppContext.tsx', // STARTER_FOODS, offered at onboarding
      'src/lib/starterFoods.ts', // the same curated list
    ]);

    // Product code only. A test fixture saying is_safe: true is a test fixture.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      // readdirSync with withFileTypes, not readdir + statSync: the second
      // form stats a path it has already been told about, which is a
      // check-then-use on the file system (CodeQL js/file-system-race). It is
      // also a syscall per entry for information the directory read already
      // carried.
      for (const dirent of readdirSync(dir, { withFileTypes: true })) {
        const entry = dirent.name;
        const full = path.join(dir, entry);
        if (dirent.isDirectory()) walk(full);
        else if (
          /\.tsx?$/.test(entry) &&
          !/\.test\.|\.spec\./.test(entry) &&
          /is_safe:\s*true/.test(readFileSync(full, 'utf8'))
        ) {
          offenders.push(path.relative(ROOT, full).split(path.sep).join('/'));
        }
      }
    };
    walk(path.join(ROOT, 'src'));

    expect(
      offenders.filter((f) => !ALLOWED.has(f)),
      'These mark a food safe on the parent\'s behalf. Use ACQUIRED_FOOD_IS_SAFE ' +
        'from src/lib/foodSafetyDefault.ts, or add the file to ALLOWED here with a ' +
        'reason it is a parent\'s choice rather than the app\'s assumption.'
    ).toEqual([]);
  });
});
