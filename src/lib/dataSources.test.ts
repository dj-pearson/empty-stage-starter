import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { catalogSourceLabel, getDataSourceAttribution, licensedDataSources } from './dataSources';

describe('getDataSourceAttribution', () => {
  it('credits Open Food Facts under ODbL', () => {
    const attribution = getDataSourceAttribution('Open Food Facts');

    expect(attribution).toMatchObject({
      label: 'Open Food Facts',
      url: 'https://world.openfoodfacts.org',
      license: 'ODbL',
    });
  });

  it('names USDA without a licence, since it is public domain', () => {
    const attribution = getDataSourceAttribution('USDA FoodData Central');

    expect(attribution?.license).toBeNull();
    expect(attribution?.url).toContain('fdc.nal.usda.gov');
  });

  it.each(['Your Pantry', 'Nutrition Database', 'Community Catalog', '', null, undefined])(
    'returns null for %s, which needs no attribution',
    (source) => {
      expect(getDataSourceAttribution(source as string | null | undefined)).toBeNull();
    }
  );

  it('covers every third-party source lookup-barcode can return', () => {
    const fn = readFileSync(
      path.resolve(__dirname, '../../supabase/functions/lookup-barcode/index.ts'),
      'utf-8'
    );
    const sources = [...fn.matchAll(/source:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    // US-808: the scrape picks up both vocabularies out of this one file --
    // the display names the client is handed, and the lowercase provenance
    // keys written to grocery_product_catalog.source. Both must resolve,
    // because the licence obligation is the same either way.
    const thirdParty = sources.filter(
      (s) => !['Your Pantry', 'Nutrition Database', 'Community Catalog'].includes(s)
    );

    expect(thirdParty.length).toBeGreaterThan(0);
    for (const source of thirdParty) {
      expect(getDataSourceAttribution(source)).not.toBeNull();
    }
  });
});

/**
 * US-808: a catalog row keeps the licence of the data it was promoted from.
 *
 * lookup-barcode used to answer a shared-catalog hit with a flat
 * `source: 'Community Catalog'`. The client resolves its attribution notice
 * from that string, so a row promoted out of Open Food Facts -- ODbL data,
 * which obliges attribution wherever it is shown -- rendered with no notice at
 * all. The row's own provenance was sitting in the column the whole time.
 */
describe('catalog provenance survives promotion', () => {
  const ownSources = ['user', 'admin', null, undefined, ''];

  it.each([
    ['openfoodfacts', 'Open Food Facts', 'ODbL'],
    ['foodrepo', 'FoodRepo', 'ODbL'],
  ])('a %s row is credited as %s under %s', (provenance, label, license) => {
    expect(catalogSourceLabel(provenance)).toBe(label);
    expect(getDataSourceAttribution(provenance)).toMatchObject({ label, license });
  });

  it('a usda row is named without a licence, since it is public domain', () => {
    expect(catalogSourceLabel('usda')).toBe('USDA FoodData Central');
    expect(getDataSourceAttribution('usda')?.license).toBeNull();
  });

  it.each(ownSources)('a %s row stays our own catalog and needs no notice', (provenance) => {
    expect(catalogSourceLabel(provenance as string | null | undefined)).toBe('Community Catalog');
    expect(getDataSourceAttribution(provenance as string | null | undefined)).toBeNull();
  });

  /**
   * Two copies of this map exist by necessity: the edge function cannot import
   * from src/, and the web cannot import Deno source. Same split as the aisle
   * vocabulary. So pin them in agreement rather than trusting that whoever
   * edits one remembers the other.
   */
  it('agrees with the edge function copy of the map', () => {
    const shared = readFileSync(
      path.resolve(__dirname, '../../supabase/functions/_shared/catalogPromotion.ts'),
      'utf-8'
    );
    const block = shared.match(/CATALOG_SOURCE_LABELS[^{]*\{([^}]*)\}/)?.[1];
    expect(block, 'CATALOG_SOURCE_LABELS not found in catalogPromotion.ts').toBeTruthy();

    const pairs = [...(block ?? '').matchAll(/(\w+):\s*'([^']+)'/g)];
    expect(pairs.length).toBeGreaterThan(0);
    for (const [, key, label] of pairs) {
      expect(catalogSourceLabel(key)).toBe(label);
    }
  });

  /**
   * Every value the column can legally hold has to land somewhere: either a
   * third party we credit, or our own catalog. Read from the CHECK constraint
   * so a migration that adds a provider cannot quietly skip attribution.
   */
  it('handles every source the CHECK constraint allows', () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        '../../supabase/migrations/20260906000000_canonical_food_catalog.sql'
      ),
      'utf-8'
    );
    const allowed = migration.match(/gpc_source_check[\s\S]*?source IN \(([^)]*)\)/)?.[1];
    expect(allowed, 'gpc_source_check not found').toBeTruthy();

    const values = [...(allowed ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      const label = catalogSourceLabel(value);
      expect(label, `no label for catalog source '${value}'`).toBeTruthy();
      // A third-party label must carry an attribution; ours must not.
      const attribution = getDataSourceAttribution(value);
      if (label === 'Community Catalog') {
        expect(attribution).toBeNull();
      } else {
        expect(attribution, `'${value}' names ${label} but has no attribution`).not.toBeNull();
      }
    }
  });
});

describe('licensed sources', () => {
  it('are all credited in the privacy policy', () => {
    const policy = readFileSync(path.resolve(__dirname, '../pages/PrivacyPolicy.tsx'), 'utf-8');

    for (const source of licensedDataSources()) {
      expect(policy).toContain(source.label);
      expect(policy).toContain(source.url);
    }
    expect(policy).toMatch(/ODbL/);
  });

  it('are credited at the point the data is displayed', () => {
    const dialog = readFileSync(
      path.resolve(__dirname, '../components/admin/BarcodeScannerDialog.tsx'),
      'utf-8'
    );

    expect(dialog).toMatch(/DataSourceCredit/);
  });
});

describe('USDA wording', () => {
  it.each([
    'src/pages/BudgetCalculator.tsx',
    'src/pages/BudgetCalculatorResults.tsx',
    'src/i18n/locales/en.json',
  ])('%s cites USDA as a source, not an endorsement', (file) => {
    const source = readFileSync(path.resolve(__dirname, '../..', file), 'utf-8');

    expect(source).not.toMatch(/official USDA/i);
  });
});
