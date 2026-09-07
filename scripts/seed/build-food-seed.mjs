#!/usr/bin/env node
/**
 * US-794: build supabase/seed/canonical_foods.json from the USDA Foundation
 * and SR Legacy exports.
 *
 * Two halves in this file:
 *   1. Pure functions (normalizeName, displayName, buildSeed) that take
 *      already-parsed rows and return {rows, dropped}. These are unit
 *      tested directly in src/lib/foodSeedBuilder.test.ts against
 *      hand-built fixtures, no USDA download required.
 *   2. A CLI (`main`) that reads the real CSVs, hands them to buildSeed,
 *      and writes the result. This half is exercised by running the
 *      script, not by the test suite.
 *
 * Usage:
 *   node scripts/seed/build-food-seed.mjs <path-to-unzipped-usda-dir> [--out supabase/seed/canonical_foods.json]
 *
 * <path-to-unzipped-usda-dir> must contain both the Foundation and SR
 * Legacy export folders (their default unzip names, matched by substring:
 * "foundation" and "sr_legacy"/"srlegacy").
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// =====================================================================
// Pure functions -- tested directly.
// =====================================================================

/**
 * Lowercased, diacritic-stripped, punctuation-stripped key for exact-match
 * lookup and for detecting when two USDA descriptions name the same food.
 * Only [a-z0-9 ] survives, which is also why it's safe to drop straight
 * into a SQL string literal.
 *
 * @param {string} description
 * @returns {string}
 */
export function normalizeName(description) {
  return stripCombiningMarks(description.normalize('NFD'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Combining Diacritical Marks block is code points 768-879 (0x0300-0x036F),
// e.g. the combining acute accent that NFD splits "e" into "e" + accent.
// Written as a numeric range rather than a regex escape in source, because
// hex-escape sequences in this file have a way of getting silently decoded
// into the literal character by tooling upstream of the file write --
// exactly the invisible-character failure mode this project's style guide
// warns about. Numeric code-point comparison has no such ambiguity.
function stripCombiningMarks(s) {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 768 && cp <= 879) continue;
    out += ch;
  }
  return out;
}

/**
 * Preparation-state clauses that add nothing once they're the *last* clause
 * in a USDA description -- "Lemons, raw, without peel" is groceries-speak
 * for "Lemons". A clause earlier in the description, or one that isn't in
 * this list (e.g. "80% lean"), is left alone: it's doing real work
 * distinguishing the food from its siblings.
 */
const DROPPABLE_TRAILING_CLAUSE_WORDS = new Set([
  'raw',
  'cooked',
  'boiled',
  'roasted',
  'baked',
  'steamed',
  'fried',
  'grilled',
  'broiled',
  'canned',
  'frozen',
  'fresh',
  'dried',
  'drained',
  'unprepared',
  'prepared',
  'unheated',
  'unsalted',
]);

function isDroppableTrailingClause(clause) {
  const c = clause.trim().toLowerCase();
  if (DROPPABLE_TRAILING_CLAUSE_WORDS.has(c)) return true;
  // "without peel", "without skin", "without shell" -- a missing part, not
  // a distinguishing feature the family shops by.
  if (/^without\s+\S+/.test(c)) return true;
  return false;
}

// USDA appends this exact parenthetical to ~57 rows across both exports,
// always as the last thing in the description ("Pears, raw, bartlett
// (Includes foods for USDA's Food Distribution Program)"). It's a
// commodity-distribution-program annotation, not part of what the food is
// called -- deliberately narrow (matches only this clause) rather than
// stripping parentheses generally, because real food names use them too
// ("Bread, salvadoran sweet cheese (quesadilla salvadorena)", "Alcoholic
// beverage, rice (sake)").
const USDA_PROGRAM_NOTE_RE = /\s*\(Includes foods for[^)]*\)\s*$/i;

/**
 * Human display name for a USDA description: strips a trailing USDA
 * distribution-program note, strips a run of trailing preparation clauses
 * ("raw", "without peel", ...), and title-cases a shouted ("HUMMUS,
 * CLASSIC") description. Never returns an empty string -- at least one
 * clause (the base food name) always survives.
 *
 * @param {string} description
 * @returns {string}
 */
export function displayName(description) {
  let s = description.trim().replace(USDA_PROGRAM_NOTE_RE, '').trim();

  // "Shouted" = every letter is uppercase (and there is at least one
  // letter, so a name with no cased characters at all doesn't count).
  const isShouted = s.length > 0 && s === s.toUpperCase() && s !== s.toLowerCase();
  if (isShouted) {
    s = s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const clauses = s
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  while (clauses.length > 1 && isDroppableTrailingClause(clauses[clauses.length - 1])) {
    clauses.pop();
  }

  return clauses.join(', ');
}

/**
 * Preparation-state words treated as equivalent when checking whether an
 * "unprepared" entry has a "cooked" sibling (see LAB_SPEAK_PATTERNS below).
 */
const PREPARED_STATE_TOKENS = new Set(['unprepared', 'prepared', 'cooked', 'raw']);

function baseSignature(description) {
  return normalizeName(description)
    .split(' ')
    .filter((w) => !PREPARED_STATE_TOKENS.has(w))
    .join(' ');
}

/**
 * The lab-speak filter. This is the judgement-heavy part of the story:
 * USDA's exports are written for a nutrition lab, not a grocery list, and
 * these are the shapes that mark a row as lab-cut rather than something a
 * parent would recognise on a shelf. Each entry documents *why* it exists
 * so a future editor can see what's missing and correct it, per the brief.
 *
 * Exported (not just used internally) so the list is auditable from outside
 * this file, e.g. from a REPL while tuning the seed to land in range.
 */
export const LAB_SPEAK_PATTERNS = [
  {
    label: 'separable lean',
    // "Beef, chuck, ... separable lean only, raw" -- a butcher-lab cut
    // description, not a product a family buys as "chuck roast".
    test: (d) => /separable\s+lean/i.test(d),
  },
  {
    label: 'separable fat',
    test: (d) => /separable\s+fat/i.test(d),
  },
  {
    label: 'all grades',
    // "Beef, ... all grades, raw" -- a lab composite across USDA grades.
    test: (d) => /\ball\s+grades\b/i.test(d),
  },
  {
    label: 'USDA quality grade named as its own clause (choice/select/prime)',
    // ", choice," / ", select," / ", prime," -- USDA grading vocabulary a
    // shopper doesn't use ("choice grade" / "select grade" in the brief).
    // In practice every SR Legacy row carrying one of these also carries
    // "separable" or "trimmed to" and is already caught above; kept as its
    // own entry so a grade-only row in a future USDA release is still
    // caught, and so the reason it's here is on record.
    test: (d) => /,\s*(choice|select|prime)\s*(,|$)/i.test(d),
  },
  {
    label: 'trimmed to',
    // "trimmed to 1/4\" fat" -- a lab trim spec, not a cut a store sells.
    test: (d) => /trimmed\s+to/i.test(d),
  },
  {
    label: 'retail cuts',
    // "composite of retail cuts" -- an average across cuts, not one food.
    test: (d) => /retail\s+cuts?/i.test(d),
  },
  {
    label: 'composite of',
    test: (d) => /composite\s+of/i.test(d),
  },
  {
    label: 'formulated bar',
    // Lab-formulated reference bars, not a product on a shelf.
    test: (d) => /formulated\s+bar/i.test(d),
  },
  {
    label: 'USDA Commodity',
    // Commodity-program bulk foods (school lunch program, etc.), not
    // something a household buys retail.
    test: (d) => /USDA\s+Commodity/i.test(d),
  },
  {
    label: 'NFS (not further specified)',
    // Lab shorthand for "we don't know exactly what this was" -- too vague
    // to show a parent as a specific food.
    test: (d) => /\bNFS\b/.test(d),
  },
];

/**
 * "unprepared" is only lab-speak when a "cooked" sibling of the same base
 * food already exists in this batch -- USDA publishing both is a lab-paired
 * sample, and the cooked one is what the family actually buys/eats. When
 * there's no cooked sibling ("Sweet Potato puffs, frozen, unprepared" with
 * no cooked counterpart), "unprepared" just means "as purchased" and the
 * row is kept.
 *
 * @param {string} description
 * @param {Set<string>} cookedSignatures base signatures of every food in
 *   this batch whose description contains "cooked"
 * @returns {string|null} the drop label, or null if not lab-speak
 */
function matchLabSpeak(description, cookedSignatures) {
  for (const pattern of LAB_SPEAK_PATTERNS) {
    if (pattern.test(description)) return pattern.label;
  }
  if (/\bunprepared\b/i.test(description) && cookedSignatures.has(baseSignature(description))) {
    return 'unprepared, with a prepared/cooked sibling present';
  }
  return null;
}

// SR Legacy inlines brand and manufacturer names as their own ALL-CAPS
// clause in an otherwise sentence-cased description -- "Infant formula,
// MEAD JOHNSON, ENFAMIL, ..." or "Candies, ALMOND JOY Candy Bar". This
// catalog is `kind: 'generic'` (see toRow) -- a specific product like
// Cheerios or Enfamil belongs in a *branded* row keyed by barcode (a later
// story), not here as if "Cheerios" were a food category. A run of two or
// more letters-only, all-uppercase words is that signature; a handful of
// legitimate generic abbreviations are exempted below because they show up
// in real, non-branded descriptions ("BBQ" flavor, "NFS" is already caught
// by lab-speak so isn't needed here, vitamin names like "B12" are excluded
// automatically since the token-match requires letters only, no digits).
const BRAND_TOKEN_EXEMPTIONS = new Set(['BBQ']);

function findBrandToken(description) {
  const words = description.split(/[^A-Za-z'&-]+/).filter(Boolean);
  for (const w of words) {
    if (w.length < 3) continue;
    if (w !== w.toUpperCase() || w === w.toLowerCase()) continue; // not all-caps (or no letters)
    if (BRAND_TOKEN_EXEMPTIONS.has(w)) continue;
    return w;
  }
  return null;
}

/**
 * Manufacturer/brand names that lead a description in Title Case rather
 * than ALL-CAPS, so findBrandToken misses them entirely -- "Pillsbury,
 * Cinnamon Rolls with Icing, refrigerated dough" reads as a perfectly
 * plausible generic food to that filter. Round 1 review caught 36 of these
 * seeded as kind='generic', source='usda', verification='verified', which
 * is exactly the confusion US-793's generic/branded split exists to
 * prevent (a specific Pillsbury product is not a food category; it belongs
 * in a *branded* catalog row with a barcode, per US-797).
 *
 * DERIVATION, not memory: built from a frequency scan of all ~8,200 real
 * (foundation_food / sr_legacy_food) rows' leading, pre-first-comma clause
 * (scripts/seed/_brand_scan.mjs and _brand_scan2.mjs, not committed --
 * see task-2-report.md for the full candidate output). The obvious
 * structural heuristic -- two or more consecutive Title-Case words at the
 * start of a name -- was tried and rejected: tested against this file's
 * own output it was ~78% precision, throwing away real foods like "New
 * Zealand spinach", "Turkey Pot Pie, frozen entree", "Sweet Potato
 * puffs", and "Margarine Spread, 40-49% fat, tub". A hand-curated,
 * hand-editable table is the correct answer for something only a person
 * can adjudicate -- same shape as Task 1's CATEGORY_AISLE.
 *
 * Each entry is matched as a prefix of the raw description (case-sensitive,
 * word-boundary-anchored -- see findKnownBrandName), so the shortest string
 * that's unique to the brand is enough; no need to enumerate every product
 * line ("Pillsbury" alone also catches "Pillsbury Grands, ..." and
 * "Pillsbury Golden Layer Buttermilk Biscuits, ...").
 */
export const BRAND_NAMES = [
  'Archway', // cookies, category 18 (Baked Products)
  'Oscar Mayer', // lunch meats, category 7
  'Pillsbury', // refrigerated dough/baked goods, category 18
  'George Weston Bakeries', // English muffins, stuffing mix, category 18
  'Martha White Foods', // baking mixes, category 18
  'Nabisco', // crackers/cookies, category 18
  'Kraft', // Stove Top, Shake N Bake, etc, category 18
  'Hormel', // sliced meats, category 7
  'Lean Pockets', // frozen entrees, category 22
  'Reddi Wip', // whipped topping, category 1
  'Interstate Brands Corp', // hamburger rolls, category 18
  'Sage Valley', // gluten-free cookies, category 18
  'Glutino', // gluten-free cookies/wafers, category 18
  "Udi's", // gluten-free bread, category 18
  'Schar', // gluten-free bread, category 18
  "Van's", // gluten-free pancakes/waffles/crackers, category 18
  'Pepperidge Farm', // Goldfish crackers, category 18
  "Mary's Gone Crackers", // gluten-free crackers, category 18
  'Mckee Baking', // Little Debbie, category 18 (capitalization as USDA has it)
  'Continental Mills', // Krusteaz muffin mix, category 18
  'Mission Foods', // flour tortillas, category 18
  'Clif', // Clif Kid Zbar, category 3 (Baby Foods) -- "Clif Z bar"
  "Andrea's", // gluten-free dinner roll, category 18
  "Rudi's", // gluten-free bakery bread, category 18
];

function escapeRegExpLiteral(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findKnownBrandName(description) {
  for (const brand of BRAND_NAMES) {
    const re = new RegExp('^' + escapeRegExpLiteral(brand) + "(?![A-Za-z0-9'])");
    if (re.test(description)) return brand;
  }
  return null;
}

// Cap on how many comma-separated qualifier clauses a description may
// carry before it's judged too narrow a lab variant for a family catalog
// ("Chicken, broiler, rotisserie, BBQ, drumstick, meat and skin" is a real
// USDA row, not a food a parent shops for as its own line item). Tuned
// against the real USDA exports (see task-2-report.md) to land the seed in
// the brief's 1500-2000 target; a description that needs a comment this
// oddly specific to justify a number is exactly the kind of thing to
// revisit once real usage shows what's missing.
const MAX_QUALIFIER_CLAUSES = 3;

const NUTRIENT_IDS = {
  calories_kcal_100: '1008', // Energy, KCAL. NOT 1062 (kJ).
  protein_g_100: '1003',
  carbs_g_100: '1005',
  fat_g_100: '1004',
  fiber_g_100: '1079',
  sugar_g_100: '2000',
  sodium_mg_100: '1093', // MG, not G.
};

function extractNutrients(nutrientMap) {
  const out = {};
  for (const [column, nutrientId] of Object.entries(NUTRIENT_IDS)) {
    const raw = nutrientMap.get(nutrientId);
    if (raw === undefined || raw === null || raw === '') continue;
    const num = Number(raw);
    if (Number.isFinite(num)) out[column] = num;
  }
  return out;
}

// Matches the gpc_nutrition_sane CHECK constraint in
// supabase/migrations/20260906000000_canonical_food_catalog.sql exactly.
// 900 kcal/100g is pure fat and the physical maximum; a value above it (or
// a macro above 100g/100g) is a unit error or bad scrape, not a food, and
// gets dropped rather than clamped so the mistake stays visible.
const BOUNDS = {
  calories_kcal_100: [0, 900],
  protein_g_100: [0, 100],
  carbs_g_100: [0, 100],
  fat_g_100: [0, 100],
  fiber_g_100: [0, 100],
  sugar_g_100: [0, 100],
  sodium_mg_100: [0, 100000],
};

function boundsViolation(values) {
  for (const [column, [min, max]] of Object.entries(BOUNDS)) {
    const v = values[column];
    if (typeof v !== 'number') continue;
    if (v < min || v > max) {
      return `${column}=${v} outside [${min}, ${max}]`;
    }
  }
  return null;
}

function toRow(candidate) {
  const n = candidate.nutrientValues;
  return {
    name: candidate.name,
    name_normalized: candidate.name_normalized,
    barcode: null,
    default_aisle_section: candidate.mapping.aisle,
    default_category: candidate.mapping.category,
    default_unit: null,
    default_quantity: null,
    brand: null,
    package_size: null,
    package_unit: null,
    metadata: null,
    kind: 'generic',
    parent_food_id: null,
    calories_kcal_100: n.calories_kcal_100,
    protein_g_100: n.protein_g_100 ?? null,
    carbs_g_100: n.carbs_g_100 ?? null,
    fat_g_100: n.fat_g_100 ?? null,
    fiber_g_100: n.fiber_g_100 ?? null,
    sugar_g_100: n.sugar_g_100 ?? null,
    sodium_mg_100: n.sodium_mg_100 ?? null,
    serving_size_g: null,
    allergens: null,
    source: 'usda',
    source_ref: candidate.fdc_id,
    verification: 'verified',
    verified_at: null,
    verified_by: null,
  };
}

/**
 * Build the seed rows and the audit trail of what was dropped and why.
 *
 * @param {object} args
 * @param {Array<{fdc_id: string, data_type: string, description: string, food_category_id: string}>} args.foods
 * @param {Array<{fdc_id: string, nutrient_id: string, amount: string|number}>} args.nutrients
 * @param {Record<string, {category: string, aisle: string}>} args.categoryAisle
 * @param {Set<string>} args.excluded
 * @returns {{rows: object[], dropped: Array<{fdc_id: string, description: string, reason: string}>}}
 */
export function buildSeed({ foods, nutrients, categoryAisle, excluded }) {
  const dropped = [];

  const nutrientsByFdcId = new Map();
  for (const n of nutrients) {
    let m = nutrientsByFdcId.get(n.fdc_id);
    if (!m) {
      m = new Map();
      nutrientsByFdcId.set(n.fdc_id, m);
    }
    m.set(n.nutrient_id, n.amount);
  }

  // USDA's real data_type is per export ("foundation_food" in Foundation,
  // "sr_legacy_food" in SR Legacy); everything else in food.csv --
  // sub_sample_food, market_acquisition, sample_food,
  // agricultural_acquisition, or a malformed value -- is sampling
  // metadata, not a food, and falls into this same drop path without a
  // special case, so a garbage data_type can never crash the build.
  const ACCEPTED_DATA_TYPES = new Set(['foundation_food', 'sr_legacy_food']);

  // Precompute which base foods have a "cooked" sibling, for the
  // unprepared-lab-speak check.
  const cookedSignatures = new Set();
  for (const f of foods) {
    if (/\bcooked\b/i.test(f.description)) {
      cookedSignatures.add(baseSignature(f.description));
    }
  }

  const candidates = [];

  for (const food of foods) {
    const { fdc_id, data_type, description } = food;
    const categoryId = String(food.food_category_id);

    if (!ACCEPTED_DATA_TYPES.has(data_type)) {
      dropped.push({ fdc_id, description, reason: `not a food row (data_type=${data_type})` });
      continue;
    }

    // Lab-speak is checked before category exclusion/mapping: a lab-cut
    // description is worth recording as lab-speak even when its category
    // also happens to be excluded or unmapped, so the audit trail names
    // the more specific reason.
    const labSpeakLabel = matchLabSpeak(description, cookedSignatures);
    if (labSpeakLabel) {
      dropped.push({ fdc_id, description, reason: `lab-speak: ${labSpeakLabel}` });
      continue;
    }

    const brandToken = findBrandToken(description);
    if (brandToken) {
      dropped.push({ fdc_id, description, reason: `brand name (ALLCAPS token "${brandToken}") -- belongs in a branded catalog row, not generic` });
      continue;
    }

    const knownBrand = findKnownBrandName(description);
    if (knownBrand) {
      dropped.push({ fdc_id, description, reason: `brand name (curated list: "${knownBrand}") -- belongs in a branded catalog row, not generic` });
      continue;
    }

    const clauseCount = description.split(',').length;
    if (clauseCount > MAX_QUALIFIER_CLAUSES) {
      dropped.push({ fdc_id, description, reason: `too many qualifier clauses (${clauseCount} > ${MAX_QUALIFIER_CLAUSES}) -- too narrow a lab variant for a family catalog` });
      continue;
    }

    if (excluded.has(categoryId)) {
      dropped.push({ fdc_id, description, reason: `excluded category (food_category_id=${categoryId})` });
      continue;
    }

    const mapping = categoryAisle[categoryId];
    if (!mapping) {
      dropped.push({ fdc_id, description, reason: `unmapped category (food_category_id=${categoryId})` });
      continue;
    }

    const nutrientMap = nutrientsByFdcId.get(fdc_id) || new Map();
    const nutrientValues = extractNutrients(nutrientMap);

    if (typeof nutrientValues.calories_kcal_100 !== 'number') {
      dropped.push({ fdc_id, description, reason: 'missing calories (no nutrient_id 1008 amount) -- would seed a hole' });
      continue;
    }

    const violation = boundsViolation(nutrientValues);
    if (violation) {
      dropped.push({ fdc_id, description, reason: `nutrition outside CHECK bounds: ${violation}` });
      continue;
    }

    const name = displayName(description);
    const name_normalized = normalizeName(name);
    const richness = Object.values(nutrientValues).filter((v) => typeof v === 'number').length;

    candidates.push({ fdc_id, description, name, name_normalized, mapping, nutrientValues, richness });
  }

  // Resolve name_normalized collisions. grocery_product_catalog_name_uq is
  // UNIQUE on name_normalized alone (see US-793's migration), so this has
  // to happen here, before anything is ever inserted.
  //
  // Primary tie-break: keep whichever candidate has the more complete
  // nutrient profile -- a catalog is more useful with more filled in, and a
  // sparser duplicate is usually the lower-quality sample of the pair.
  // Secondary tie-break, only when nutrient completeness is equal: keep the
  // shorter original description (the plainer food).
  //
  // DO NOT "fix" this back to shorter-description-only. This exact
  // question came up during review: the task brief's prose said "keep the
  // shorter description," but its own verbatim fixture requires keeping
  // fdc 1 ("Lemons, raw, without peel", 25 chars, 2 nutrient facts) over
  // fdc 5 ("Lemons, raw", 11 chars, 1 nutrient fact) once both reduce to
  // displayName "Lemons" -- the shorter one loses. Nutrient-completeness-
  // first is not a workaround to pass that test; it's the better rule on
  // its own terms (a row with full macros is worth more to the catalog
  // than a row with a shorter name) and it happens to resolve the brief's
  // internal contradiction correctly. Length remains the tie-break only
  // when nutrient completeness ties.
  const byKey = new Map();
  for (const c of candidates) {
    let group = byKey.get(c.name_normalized);
    if (!group) {
      group = [];
      byKey.set(c.name_normalized, group);
    }
    group.push(c);
  }

  const rows = [];
  for (const group of byKey.values()) {
    if (group.length === 1) {
      rows.push(toRow(group[0]));
      continue;
    }
    const sorted = [...group].sort((a, b) => {
      if (b.richness !== a.richness) return b.richness - a.richness;
      return a.description.length - b.description.length;
    });
    const [winner, ...losers] = sorted;
    rows.push(toRow(winner));
    for (const loser of losers) {
      dropped.push({
        fdc_id: loser.fdc_id,
        description: loser.description,
        reason: `collision: duplicate name_normalized "${loser.name_normalized}" (kept fdc_id ${winner.fdc_id})`,
      });
    }
  }

  return { rows, dropped };
}

// =====================================================================
// CLI -- reads the real USDA CSVs and writes supabase/seed/canonical_foods.json.
// Not exercised by the unit test suite.
// =====================================================================

/**
 * Minimal RFC4180-ish CSV parser: comma-separated, double-quoted fields,
 * embedded commas inside quotes, and a doubled `""` as an escaped quote
 * inside a quoted field. USDA's exports use exactly this shape (verified
 * against real rows like `Beef, ... trimmed to 0"" fat, ...` in SR Legacy's
 * food.csv, which has both an embedded comma and an embedded doubled
 * quote in one field). No external dependency, per the brief.
 *
 * @param {string} text
 * @returns {string[][]}
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (c === '\r') {
      // swallow; \r\n is handled by the following \n
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readCSVAsObjects(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0] === '') continue; // trailing blank line
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = r[j];
    out.push(obj);
  }
  return out;
}

// Non-ASCII code points swapped for a plain ASCII equivalent before
// whatever's still non-ASCII gets dropped outright. Keyed by decimal code
// point (built via String.fromCodePoint) rather than a literal glyph or a
// hex-escape in source, for the same reason as stripCombiningMarks above.
const ASCII_SUBSTITUTIONS = [
  [8216, "'"], // left single quotation mark
  [8217, "'"], // right single quotation mark
  [8220, '"'], // left double quotation mark
  [8221, '"'], // right double quotation mark
  [8211, '-'], // en dash
  [8212, '-'], // em dash
  [8230, '...'], // horizontal ellipsis
  [176, ' deg'], // degree sign, e.g. "350 F" recipes -> "350 degF"
  [188, ' 1/4'], // vulgar fraction one quarter
  [189, ' 1/2'], // vulgar fraction one half
  [190, ' 3/4'], // vulgar fraction three quarters
  [160, ' '], // no-break space
  [8201, ' '], // thin space
  [8202, ' '], // hair space
  [8203, ' '], // zero-width space
  [8239, ' '], // narrow no-break space
  [12288, ' '], // ideographic space
];

/**
 * USDA descriptions carry non-ASCII (accented names, no-break spaces,
 * degree/fraction glyphs). These values end up inside SQL string literals
 * in Task 3, so transliterate to plain ASCII here rather than passing
 * anything through.
 *
 * @param {string} text
 * @returns {string}
 */
function toAscii(text) {
  let out = stripCombiningMarks(text.normalize('NFD'));
  for (const [codePoint, replacement] of ASCII_SUBSTITUTIONS) {
    out = out.split(String.fromCodePoint(codePoint)).join(replacement);
  }
  let ascii = '';
  for (const ch of out) {
    if (ch.codePointAt(0) <= 127) ascii += ch; // anything still non-ASCII: drop it
  }
  return ascii.replace(/[ \t]+/g, ' ').trim();
}

function findExportDir(usdaDir, matcher) {
  const entries = fs.readdirSync(usdaDir, { withFileTypes: true });
  const dir = entries.find((e) => e.isDirectory() && matcher.test(e.name));
  return dir ? path.join(usdaDir, dir.name) : null;
}

function loadFoodsAndNutrients(usdaDir) {
  const foundationDir = findExportDir(usdaDir, /foundation/i);
  const srLegacyDir = findExportDir(usdaDir, /sr_?legacy/i);
  if (!foundationDir || !srLegacyDir) {
    throw new Error(
      `Expected a Foundation and an SR Legacy export directory under ${usdaDir}. Found: ${fs
        .readdirSync(usdaDir)
        .join(', ')}`
    );
  }

  const foods = [];
  const nutrients = [];

  for (const dir of [foundationDir, srLegacyDir]) {
    const foodRows = readCSVAsObjects(path.join(dir, 'food.csv'));
    for (const r of foodRows) {
      foods.push({
        fdc_id: r.fdc_id,
        data_type: r.data_type,
        description: toAscii(r.description ?? ''),
        food_category_id: r.food_category_id,
      });
    }

    const nutrientRows = readCSVAsObjects(path.join(dir, 'food_nutrient.csv'));
    for (const r of nutrientRows) {
      nutrients.push({ fdc_id: r.fdc_id, nutrient_id: r.nutrient_id, amount: r.amount });
    }
  }

  return { foods, nutrients };
}

function groupCounts(dropped) {
  const counts = new Map();
  for (const d of dropped) {
    // Group by the reason up to the first ":" or "(" so e.g. every
    // "collision: duplicate name_normalized ..." lands in one bucket.
    const key = d.reason.split(/[:(]/)[0].trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  const usdaDir = process.argv[2];
  if (!usdaDir) {
    console.error('Usage: node scripts/seed/build-food-seed.mjs <path-to-unzipped-usda-dir> [--out supabase/seed/canonical_foods.json]');
    process.exit(1);
  }

  const outFlagIndex = process.argv.indexOf('--out');
  const outPath = outFlagIndex !== -1 ? process.argv[outFlagIndex + 1] : 'supabase/seed/canonical_foods.json';

  // Import lazily so the pure functions above stay importable (by the test
  // file) without requiring this module's CLI-only import graph to touch
  // the filesystem.
  const { CATEGORY_AISLE, EXCLUDED_CATEGORIES } = await import('./food-aisle-map.mjs');

  console.log(`Reading USDA CSVs from ${usdaDir} ...`);
  const { foods, nutrients } = loadFoodsAndNutrients(usdaDir);
  console.log(`Loaded ${foods.length} food.csv rows and ${nutrients.length} food_nutrient.csv rows.`);

  const { rows, dropped } = buildSeed({ foods, nutrients, categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED_CATEGORIES });

  const resolvedOut = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
  fs.writeFileSync(resolvedOut, JSON.stringify(rows, null, 2) + '\n', 'utf8');

  console.log('');
  console.log(`kept: ${rows.length}`);
  console.log(`dropped: ${dropped.length}`);
  for (const [reason, count] of groupCounts(dropped)) {
    console.log(`  ${count.toString().padStart(6)}  ${reason}`);
  }

  console.log('');
  console.log('20 random kept names:');
  const shuffled = [...rows].sort(() => Math.random() - 0.5);
  for (const r of shuffled.slice(0, 20)) {
    console.log(`  - ${r.name}  (${r.default_category} / ${r.default_aisle_section})`);
  }

  console.log('');
  console.log(`Wrote ${resolvedOut}`);
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Referenced so bundlers/linters don't flag an unused import if this file
// is ever imported for its side-effect-free exports only.
void pathToFileURL;
