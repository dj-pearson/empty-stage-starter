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
 *
 * US-808: there are two vocabularies, and both have to resolve here. The
 * client-facing one names the source for a human ('Open Food Facts'); the
 * `grocery_product_catalog.source` column records provenance in lowercase keys
 * ('openfoodfacts'), constrained by gpc_source_check in
 * 20260906000000_canonical_food_catalog.sql. A catalog row promoted from Open
 * Food Facts carries ODbL data whichever spelling you read it by, so a surface
 * that has only the raw column must be able to attribute it too.
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
 * `grocery_product_catalog.source` values that mean the row came from a
 * third party, mapped onto the attribution that third party requires. The
 * remaining values the CHECK constraint allows -- 'user' and 'admin' -- are
 * ours and need none.
 */
const CATALOG_PROVENANCE: Record<string, string> = {
  openfoodfacts: 'Open Food Facts',
  usda: 'USDA FoodData Central',
  foodrepo: 'FoodRepo',
};

/**
 * Returns the attribution for a source string, or null for sources that are
 * ours ('Your Pantry', 'Nutrition Database', 'Community Catalog') and need
 * none. Accepts either vocabulary: the display name or the catalog's
 * provenance key.
 */
export function getDataSourceAttribution(source?: string | null): DataSourceAttribution | null {
  if (!source) return null;
  const displayName = CATALOG_PROVENANCE[source] ?? source;
  return ATTRIBUTIONS[displayName] ?? null;
}

/**
 * The name to show for a `grocery_product_catalog.source` value. Third-party
 * rows are named after the third party, so the attribution line renders;
 * everything else is our own catalog.
 */
export function catalogSourceLabel(source?: string | null): string {
  if (!source) return 'Community Catalog';
  return CATALOG_PROVENANCE[source] ?? 'Community Catalog';
}

/** Every third-party source that carries a licence obligation. */
export function licensedDataSources(): DataSourceAttribution[] {
  return Object.values(ATTRIBUTIONS).filter((a) => a.license !== null);
}
