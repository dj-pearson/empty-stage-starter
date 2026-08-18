import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { getDataSourceAttribution, licensedDataSources } from './dataSources';

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

  it.each(['Your Pantry', 'Nutrition Database', '', null, undefined])(
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
    const thirdParty = sources.filter(
      (s) => !['Your Pantry', 'Nutrition Database'].includes(s)
    );

    expect(thirdParty.length).toBeGreaterThan(0);
    for (const source of thirdParty) {
      expect(getDataSourceAttribution(source)).not.toBeNull();
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
