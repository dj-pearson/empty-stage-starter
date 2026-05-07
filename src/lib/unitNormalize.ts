/**
 * US-287: Unit normalization layer (web util mirroring iOS UnitInference).
 *
 * Recipes say "2 cups flour"; pantry stocks "flour, qty=1, unit=bag". Without
 * a normalization layer every shortfall comparison degrades to "unknown".
 *
 * This module turns any (qty, unit) pair into a canonical (qty, canonicalUnit,
 * family) triple, and provides a `compare` helper that returns 'incomparable'
 * across families instead of crashing or guessing.
 *
 * Canonical units per family:
 *   - mass       → grams (g)
 *   - volume     → milliliters (ml)
 *   - count      → piece
 *   - package    → each canonicalUnit is itself (jar / bottle / can / …)
 *                  — within-family compare requires identical canonicalUnit
 *
 * Compatibility note: the iOS UnitInference.swift catalogue uses package-style
 * units (gal, lb, dozen, pack, bag, jar, …) when defaulting brand-new pantry
 * rows. Those values still round-trip through this normaliser cleanly:
 *   - "gal" → volume / 3785.41 ml
 *   - "lb"  → mass   / 453.592 g
 *   - "dozen" → count / 12 pieces
 *   - "bag" / "jar" / etc. → package / canonical = bag / jar / …
 */

export type UnitFamily = 'mass' | 'volume' | 'count' | 'package' | 'unknown';

export interface Normalized {
  qty: number;
  canonicalUnit: string;
  family: UnitFamily;
  /** True when the source unit was recognised; false for opaque/unknown. */
  recognised: boolean;
}

export type CompareResult = 'less' | 'equal' | 'greater' | 'incomparable';

/**
 * Per-unit conversion factor to the family's canonical unit.
 * Numbers tagged "approx" are rounded to four sig figs for legibility — they
 * still satisfy the >0.5% accuracy bar used everywhere downstream.
 */
const MASS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  gm: 1,
  kg: 1000,
  kilo: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495, // approx
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592, // approx
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};

const VOLUME: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  millilitre: 1,
  milliliters: 1,
  millilitres: 1,
  l: 1000,
  liter: 1000,
  litre: 1000,
  liters: 1000,
  litres: 1000,
  tsp: 4.92892, // US teaspoon (approx)
  teaspoon: 4.92892,
  teaspoons: 4.92892,
  t: 4.92892,
  tbsp: 14.7868, // US tablespoon (approx)
  tablespoon: 14.7868,
  tablespoons: 14.7868,
  T: 14.7868,
  tbl: 14.7868,
  tbs: 14.7868,
  cup: 236.588, // US cup (approx)
  cups: 236.588,
  c: 236.588,
  floz: 29.5735, // US fluid ounce (approx)
  'fl oz': 29.5735,
  'fluid ounce': 29.5735,
  'fluid ounces': 29.5735,
  pt: 473.176, // US pint (approx)
  pint: 473.176,
  pints: 473.176,
  qt: 946.353, // US quart (approx)
  quart: 946.353,
  quarts: 946.353,
  gal: 3785.41, // US gallon (approx)
  gallon: 3785.41,
  gallons: 3785.41,
};

const COUNT: Record<string, number> = {
  piece: 1,
  pieces: 1,
  pc: 1,
  pcs: 1,
  each: 1,
  ea: 1,
  count: 1,
  ct: 1,
  unit: 1,
  units: 1,
  dozen: 12,
  doz: 12,
};

/**
 * "Package" units don't convert between each other (a jar of jam isn't N bottles).
 * We keep their canonical = the package noun and compare structurally — same
 * canonical = comparable, different canonical inside the family = incomparable.
 *
 * This list mirrors the package-shaped defaults in iOS UnitInference.swift.
 */
const PACKAGE_UNITS = new Set<string>([
  'pack',
  'package',
  'pkg',
  'bag',
  'jar',
  'bottle',
  'btl',
  'can',
  'box',
  'loaf',
  'bunch',
  'head',
  'roll',
  'rolls',
  'sleeve',
  'tube',
  'tray',
  'carton',
  'sachet',
  'stick',
  'sticks',
]);

const PACKAGE_ALIASES: Record<string, string> = {
  pkg: 'pack',
  package: 'pack',
  btl: 'bottle',
  rolls: 'roll',
  sticks: 'stick',
};

/** Inputs that indicate the user knew the qty but not the unit. */
const PLACEHOLDER_UNITS = new Set<string>(['', 'item', 'items', 'thing', 'things', '-', '—']);

/** Map any unit input through whitespace/casing/punctuation rules. */
function canonicaliseToken(input: string | null | undefined): string {
  if (input == null) return '';
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/\./g, '')          // tbsp. → tbsp
    .replace(/[\s_-]+/g, ' ');   // collapse whitespace / underscores / hyphens
}

/** Look up a unit in the per-family tables, returning a Normalized result. */
export function normalize(qty: number | string | null | undefined, unit?: string | null): Normalized {
  const numericQty = typeof qty === 'number' ? qty : parseFloat(String(qty ?? ''));
  const safeQty = Number.isFinite(numericQty) ? numericQty : 0;

  // Case-sensitive shortcut: a bare "T" means tablespoon (cooking convention),
  // not teaspoon. Resolve this BEFORE lowercasing so it doesn't collide with
  // lowercase "t" → teaspoon in the table below.
  const trimmed = String(unit ?? '').trim();
  if (trimmed === 'T') {
    return { qty: safeQty * VOLUME.T, canonicalUnit: 'ml', family: 'volume', recognised: true };
  }

  const token = canonicaliseToken(unit);

  if (PLACEHOLDER_UNITS.has(token)) {
    return { qty: safeQty, canonicalUnit: 'piece', family: 'count', recognised: false };
  }

  if (token in MASS) {
    return { qty: safeQty * MASS[token], canonicalUnit: 'g', family: 'mass', recognised: true };
  }
  if (token in VOLUME) {
    return { qty: safeQty * VOLUME[token], canonicalUnit: 'ml', family: 'volume', recognised: true };
  }
  if (token in COUNT) {
    return { qty: safeQty * COUNT[token], canonicalUnit: 'piece', family: 'count', recognised: true };
  }

  // Package family: canonicalise via alias table.
  if (PACKAGE_UNITS.has(token)) {
    const canonical = PACKAGE_ALIASES[token] ?? token;
    return { qty: safeQty, canonicalUnit: canonical, family: 'package', recognised: true };
  }

  // Unknown — surface qty/unit as-is so callers can render but not compare.
  return { qty: safeQty, canonicalUnit: token || '', family: 'unknown', recognised: false };
}

/**
 * Compare two (qty, unit) pairs.
 *
 *   compare({ qty: 2, unit: 'cup' }, { qty: 500, unit: 'ml' }) → 'less'  (~473 vs 500)
 *   compare({ qty: 1, unit: 'lb' },  { qty: 16, unit: 'oz' })  → 'equal' (within 1g tolerance)
 *   compare({ qty: 2, unit: 'cup' }, { qty: 1, unit: 'jar' })  → 'incomparable'
 *
 * Tolerance: 0.5% of the larger normalised qty, capped at ±1 in canonical units.
 * That's enough slack to swallow tsp/tbsp rounding without classifying truly
 * different amounts as equal.
 */
export function compare(
  a: { qty: number; unit?: string | null },
  b: { qty: number; unit?: string | null }
): CompareResult {
  const na = normalize(a.qty, a.unit);
  const nb = normalize(b.qty, b.unit);

  // Cross-family or unknown families never compare.
  if (na.family === 'unknown' || nb.family === 'unknown') return 'incomparable';
  if (na.family !== nb.family) return 'incomparable';

  // Within "package", canonical noun must match.
  if (na.family === 'package' && na.canonicalUnit !== nb.canonicalUnit) {
    return 'incomparable';
  }

  const diff = na.qty - nb.qty;
  const tolerance = Math.min(1, Math.max(Math.abs(na.qty), Math.abs(nb.qty)) * 0.005);
  if (Math.abs(diff) <= tolerance) return 'equal';
  return diff < 0 ? 'less' : 'greater';
}

/**
 * Convert a qty between two units in the same family.
 * Returns null when the conversion crosses families or hits an unknown unit.
 */
export function convert(qty: number, fromUnit: string, toUnit: string): number | null {
  const from = normalize(qty, fromUnit);
  const to = normalize(1, toUnit);
  if (from.family === 'unknown' || to.family === 'unknown') return null;
  if (from.family !== to.family) return null;
  if (from.family === 'package' && from.canonicalUnit !== to.canonicalUnit) return null;
  if (to.qty === 0) return null;
  return from.qty / to.qty;
}

/** Report the family for a unit string, useful for UI badges. */
export function unitFamily(unit: string | null | undefined): UnitFamily {
  return normalize(1, unit).family;
}
