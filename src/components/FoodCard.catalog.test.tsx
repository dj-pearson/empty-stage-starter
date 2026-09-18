import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { FoodCard } from './FoodCard';
import type { CatalogEntry } from '@/lib/effectiveFood';
import type { Food } from '@/types';

/**
 * US-797: a product promoted from a barcode scan is usable, and says what it
 * is.
 *
 * A scan promotes itself into the shared catalog as `verification =
 * 'unverified'` -- one household's scan of one label, checked by nobody. The
 * design deliberately lets those rows be shopped from, which only works if the
 * app is honest about them: a row nobody has checked must not be presented as
 * a confirmed fact.
 *
 * Open Food Facts and FoodRepo are ODbL, and the licence wants the credit
 * wherever the data is displayed. Until now it appeared only in the scanner
 * dialog the product arrived through; once a household food is linked, the
 * pantry card is where the data is.
 */

const food: Food = {
  id: 'f1',
  name: 'Marmite',
  category: 'snack',
  is_safe: false,
  is_try_bite: false,
  canonical_id: 'c1',
};

const catalog = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: 'c1',
  name: 'Marmite',
  default_category: 'snack',
  default_aisle_section: null,
  verification: 'unverified',
  source: 'openfoodfacts',
  ...over,
});

const noop = vi.fn();
const renderCard = (props: Partial<React.ComponentProps<typeof FoodCard>> = {}) =>
  render(<FoodCard food={food} onEdit={noop} onDelete={noop} {...props} />);

describe('an unverified catalog row says so', () => {
  it('marks a food linked to an unverified row', () => {
    renderCard({ catalog: catalog() });
    expect(screen.getByText('Unverified')).toBeInTheDocument();
  });

  it('explains what unverified means, for anyone who has not read the spec', () => {
    renderCard({ catalog: catalog() });
    expect(screen.getByTitle(/scanned barcode and not yet checked/i)).toBeInTheDocument();
  });

  it('says nothing about a verified row', () => {
    renderCard({ catalog: catalog({ verification: 'verified' }) });
    expect(screen.queryByText('Unverified')).not.toBeInTheDocument();
  });

  it('says nothing about a food that is not catalog-linked', () => {
    // Every FoodCard rendered outside the pantry passes no catalog at all.
    renderCard();
    expect(screen.queryByText('Unverified')).not.toBeInTheDocument();
  });

  it('says nothing when the food has no canonical link even if a row is passed', () => {
    renderCard({ food: { ...food, canonical_id: undefined }, catalog: null });
    expect(screen.queryByText('Unverified')).not.toBeInTheDocument();
  });
});

describe('the ODbL credit follows the data', () => {
  it('credits Open Food Facts on the card, not only in the scanner', () => {
    renderCard({ catalog: catalog() });
    const link = screen.getByRole('link', { name: /open food facts/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('openfoodfacts.org'));
  });

  it('names the licence, which is the part ODbL actually requires', () => {
    renderCard({ catalog: catalog() });
    expect(screen.getByRole('link', { name: /odbl/i })).toBeInTheDocument();
  });

  it('credits FoodRepo too', () => {
    renderCard({ catalog: catalog({ source: 'foodrepo' }) });
    expect(screen.getByRole('link', { name: /foodrepo/i })).toBeInTheDocument();
  });

  it('credits nobody for our own data', () => {
    // Attribution on a row we wrote ourselves would be noise, and noise is how
    // a licence notice stops being read.
    renderCard({ catalog: catalog({ source: 'usda' }) });
    expect(screen.queryByText(/licensed under/i)).not.toBeInTheDocument();
  });

  it('credits nobody when there is no catalog link', () => {
    renderCard();
    expect(screen.queryByText(/data from/i)).not.toBeInTheDocument();
  });
});

/**
 * AC3's other half: unverified rows stay out of the ladder and out of
 * nutrition totals.
 *
 * Nothing in src/ reads the catalog's nutrition columns today, and the ladder
 * does not read the catalog at all, so there is currently nothing to exclude
 * them FROM. That makes this a guard rather than an assertion about behaviour:
 * the first consumer that starts reading those columns has to decide what to do
 * about verification, and this is where it finds out.
 */
describe('unverified nutrition stays out of totals and the ladder', () => {
  const ROOT = path.resolve(__dirname, '..', '..');
  const NUTRITION_COLUMNS = /\b(calories_kcal_100|protein_g_100|carbs_g_100|fat_g_100|fiber_g_100|sugar_g_100|sodium_mg_100)\b/;

  it('no product file reads catalog nutrition without checking verification', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry) || /\.test\.|\.spec\./.test(entry)) continue;
        // The generated Supabase types name every column; they read nothing.
        if (full.endsWith(path.join('integrations', 'supabase', 'types.ts'))) continue;

        const src = readFileSync(full, 'utf8');
        if (NUTRITION_COLUMNS.test(src) && !/verification/.test(src)) {
          offenders.push(path.relative(ROOT, full).split(path.sep).join('/'));
        }
      }
    };
    walk(path.join(ROOT, 'src'));

    expect(
      offenders,
      'These read catalog nutrition columns without mentioning verification. An ' +
        'unverified row is one household\'s scan of one label, checked by nobody, ' +
        'and US-797 keeps it out of the ladder and out of nutrition totals. Filter ' +
        'on verification, or say in the file why this use is exempt.'
    ).toEqual([]);
  });

  it('the ladder does not reach into the catalog at all', () => {
    for (const file of ['src/hooks/useFoodLadder.ts', 'src/lib/ladderScheduler.ts']) {
      const src = readFileSync(path.join(ROOT, file), 'utf8');
      expect(src, `${file} started reading the catalog`).not.toMatch(
        /grocery_product_catalog|canonical_id/
      );
    }
  });
});
