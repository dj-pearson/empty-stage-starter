/**
 * US-633: attribution for the nutrition databases behind barcode lookups.
 *
 * Open Food Facts is licensed under the Open Database License. ODbL requires
 * attribution wherever the data is presented, which is a licence obligation
 * rather than a courtesy. USDA FoodData Central is US-government work in the
 * public domain, so it needs no licence notice - but naming it as a source and
 * implying it endorses EatPal are different things, so the label says where the
 * numbers came from and nothing more.
 *
 * Source strings come from supabase/functions/lookup-barcode, which tags every
 * result it returns.
 */

export interface DataSourceAttribution {
  /** How to name the source to a user. */
  label: string;
  /** Where the source lives. */
  url: string;
  /** Licence short name, or null when none applies (public domain). */
  license: string | null;
  licenseUrl: string | null;
}

const ATTRIBUTIONS: Record<string, DataSourceAttribution> = {
  'Open Food Facts': {
    label: 'Open Food Facts',
    url: 'https://world.openfoodfacts.org',
    license: 'ODbL',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  },
  'USDA FoodData Central': {
    label: 'USDA FoodData Central',
    url: 'https://fdc.nal.usda.gov',
    license: null,
    licenseUrl: null,
  },
  FoodRepo: {
    label: 'FoodRepo',
    url: 'https://www.foodrepo.org',
    license: 'ODbL',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  },
};

/**
 * Returns the attribution for a source string, or null for sources that are
 * ours ('Your Pantry', 'Nutrition Database') and need none.
 */
export function getDataSourceAttribution(source?: string | null): DataSourceAttribution | null {
  if (!source) return null;
  return ATTRIBUTIONS[source] ?? null;
}

/** Every third-party source that carries a licence obligation. */
export function licensedDataSources(): DataSourceAttribution[] {
  return Object.values(ATTRIBUTIONS).filter((a) => a.license !== null);
}
