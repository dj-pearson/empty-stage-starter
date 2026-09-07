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
 * Apostrophes are DELETED, not turned into a space like every other
 * punctuation character -- "Mother's" becomes "mothers", not "mother s".
 * This is a deliberate choice, not an oversight: US-796's matcher links a
 * household's free-text food name to this catalog by exact
 * `name_normalized` match, and a household typing "Mothers" (no
 * apostrophe, which is how most people actually type on a phone keyboard)
 * would otherwise never match "mother s" -- two normalized forms for one
 * food is exactly the kind of drift US-796 exists to close, not
 * reintroduce.
 *
 * @param {string} description
 * @returns {string}
 */
export function normalizeName(description) {
  return stripCombiningMarks(description.normalize('NFD'))
    .toLowerCase()
    .replace(/'/g, '')
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
 *
 * FIX ROUND 3 (fix 1, CRITICAL): this list used to also drop `dried`,
 * `canned`, `frozen`, `drained` and `unsalted` -- words that change what
 * the food IS, not how it was prepared. That shipped "Egg, whole" at
 * 592 kcal/100g (fdc 172188, dried whole egg powder) and "Milk,
 * buttermilk" at 387 kcal/100g (dried buttermilk) as `verification:
 * 'verified'` rows in a child-nutrition app's shared catalog, both roughly
 * 4x a real fresh value. Those five words are gone from this set; a
 * trailing "dried"/"canned"/"frozen"/"drained"/"unsalted" clause now stays
 * in the displayed name ("Egg, whole, dried"), which is also the honest
 * outcome -- the row IS dried egg, and the name should say so. The
 * PROCESSED_STATE_WORDS set below (fix 3) documents the same distinction
 * for the collision tie-break, which had the matching half of this bug.
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
  'fresh',
  'unprepared',
  'prepared',
  'unheated',
  'with skin', // a present part, not a distinguishing feature -- see "without skin" below
]);

function isDroppableTrailingClause(clause) {
  const c = clause.trim().toLowerCase();
  if (DROPPABLE_TRAILING_CLAUSE_WORDS.has(c)) return true;
  // "without peel", "without skin", "without added salt" -- a missing
  // part, not a distinguishing feature the family shops by. `.+` rather
  // than a single word, so a multi-word missing part is caught too.
  if (/^without\s+.+/.test(c)) return true;
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
 * distribution-program note, trims a trailing sentence period ("Yogurt,
 * vanilla, low fat." -> "Yogurt, vanilla, low fat" -- USDA is inconsistent
 * about adding one and a food name shouldn't carry one), strips a run of
 * trailing preparation clauses ("raw", "without peel", ...), and
 * title-cases a shouted ("HUMMUS, CLASSIC") description.
 *
 * Usually returns a non-empty string -- ordinarily at least one clause
 * (the base food name) survives -- but CAN return "" for a description
 * that is empty or entirely punctuation once trimmed. No real USDA row
 * hits that today; buildSeed drops any row whose name comes back empty
 * rather than seeding a blank name, since nothing downstream guards
 * against one.
 *
 * @param {string} description
 * @returns {string}
 */
export function displayName(description) {
  let s = description.trim().replace(USDA_PROGRAM_NOTE_RE, '').trim();
  s = s.replace(/\.+\s*$/, '').trim();

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
// story), not here as if "Cheerios" were a food category.
//
// FIX ROUND 3 (fix 5): the behaviour IS "a single all-caps word of three
// or more letters" -- the code below, unchanged. An earlier version of
// this comment said "a run of two or more," which never matched what the
// code did; that's fixed by rewriting the comment to match the code
// (single-word), not the other way around. A handful of legitimate
// generic abbreviations are exempted below because they show up in real,
// non-branded descriptions ("BBQ" flavor, "NFS" is already caught by
// lab-speak so isn't needed here, vitamin names like "B12" are excluded
// automatically since the token-match requires letters only, no digits).
//
// This runs on the RAW description, before displayName ever sees it --
// deliberately, not incidentally. displayName title-cases a shouted
// description ("HUMMUS, CLASSIC" -> "Hummus, Classic"); if that ran
// first, every ALL-CAPS brand clause would already be title-cased by the
// time this check saw it, and a token-match that specifically looks for
// ALL-CAPS would never fire on a single one of them -- the brand filter
// would go blind on exactly the rows it exists to catch. The trade-off is
// real and worth naming: a genuinely shouted description that is NOT a
// brand (no such row exists in the current USDA exports, which is how
// this filter was tuned) would be misread as one, and displayName's own
// shout-handling branch is consequently unreachable for anything that
// makes it into the seed today. That branch stays -- it's still exercised
// directly by displayName's own unit tests, and it's the correct
// fallback if a future USDA release ever adds a shouted row that isn't a
// brand name.
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

// EatPal is a child-nutrition app; this seed is the shared catalog every
// family searches. USDA category 28 (Alcoholic Beverages) is already in
// EXCLUDED_CATEGORIES (Task 1), but round 1 review found 15 rows -- sake,
// tequila sunrise, daiquiri, whiskey sour, etc. -- filed by USDA under
// category 14 (plain Beverages) instead, so the category exclusion never
// saw them. Rather than a keyword scan (tried: matching wine/beer/
// cocktail/whiskey anywhere in the name pulls in 31 rows, 15 of them
// legitimate groceries -- "Vegetable juice cocktail", "Vinegar, red wine",
// "Beerwurst, beer salami, pork", "Beverages, Wine, non-alcoholic"), this
// matches USDA's own description convention: every alcoholic-beverage row
// in both exports starts its description with exactly this prefix.
// "Malt beverage, includes non-alcoholic beer" does not start with it and
// correctly survives.
const ALCOHOLIC_BEVERAGE_PREFIX_RE = /^Alcoholic beverages?\b/i;

function isAlcoholicBeverage(description) {
  return ALCOHOLIC_BEVERAGE_PREFIX_RE.test(description);
}

// Cap on how many comma-separated qualifier clauses a description may
// carry before it's judged too narrow a lab variant for a family catalog
// ("Chicken, broiler, rotisserie, BBQ, drumstick, meat and skin" is a real
// USDA row, not a food a parent shops for as its own line item). Tuned
// against the real USDA exports (see task-2-report.md) to land the seed in
// the brief's 1500-2000 target; a description that needs a comment this
// oddly specific to justify a number is exactly the kind of thing to
// revisit once real usage shows what's missing.
//
// FIX ROUND 3 (fix 2, CRITICAL): this cap is applied to displayName's
// OUTPUT, not the raw USDA description -- counting the raw description's
// commas deleted staples outright: no tuna, no plain milk, no
// black/kidney/green beans, no salmon except "Salmon nuggets". See
// buildSeed for where `name` is computed before this check runs,
// specifically so it can be counted instead of `description`.
//
// That alone was not enough to bring tuna back, though, which is why this
// comment has a second half. "Fish, tuna, light, canned in water, drained
// solids" reduces to itself under fix 1 -- "canned in water" and "drained
// solids" are real distinguishing clauses (packed in water vs. oil,
// drained vs. not), not lab-speak, so fix 1 correctly keeps them, and that
// leaves 5 clauses in the displayName output alone, still over any cap
// narrow enough to keep genuine lab variants like the rotisserie-chicken
// example above out. Raising the cap itself to fit (tried 4: 3392 rows;
// tried 5: 4153 rows, both against a 1500-2000 target) let in far more
// noise than staples, because most of what a wider cap admits is more
// lab-cut granularity, not more tuna. NON_COUNTING_QUALIFIER_PATTERNS
// below is the alternative: a short, specific list of clause SHAPES that
// are packaging or standardized-cut information rather than a lab
// narrowing, excluded from the cap's count (but never from the displayed
// name -- fix 1's "keep what changes the product" rule still applies to
// them in full). "Fish, tuna, light, canned in water, drained solids"
// counts as 3 (Fish / tuna / light) once its packing-medium and
// drained-state clauses are excluded from the count -- under the cap,
// name intact.
const MAX_QUALIFIER_CLAUSES = 3;

// See the second half of the MAX_QUALIFIER_CLAUSES comment above for why
// this exists. Each pattern matches a WHOLE clause (after displayName has
// already run), not a word within one, so it can't accidentally swallow
// something else that happens to contain one of these words.
const NON_COUNTING_QUALIFIER_PATTERNS = [
  /^canned in (water|oil|juice|syrup)$/i, // "Fish, tuna, light, canned in water, ..."
  /^packed in (water|oil|juice|syrup)$/i,
  /^drained solids$/i, // "..., drained solids" -- canned-goods measurement convention
  /^solids and liquids?$/i, // the undrained counterpart of the above
  /^meat and skin$/i, // poultry cut standardization, not a lab variant
  /^meat only$/i,
  /^mature seeds$/i, // "Beans, kidney, red, mature seeds" -- legume-database convention, not a lab cut
];

function countedClauses(name) {
  return name
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && !NON_COUNTING_QUALIFIER_PATTERNS.some((p) => p.test(c)));
}

/**
 * FIX ROUND 4: `NON_COUNTING_QUALIFIER_PATTERNS` rescued canned tuna, but
 * a staples check against the round-3 seed (querying for milk/egg/tuna/
 * etc AND a second, picky-eater-focused list -- chicken nuggets, mac and
 * cheese, pizza, ...) found more real foods still deleted by the clause
 * cap for the same underlying reason: USDA wrote them with several
 * genuinely-distinguishing clauses (a fry cut, a crust type, an
 * enrichment note) that aren't lab-speak and aren't a packaging idiom
 * either, so neither fix 1 nor the packaging exception helps. Widening
 * `MAX_QUALIFIER_CLAUSES` itself was measured and rejected in fix round 3
 * (cap 4 -> 3392 rows, cap 5 -> 4153, both mostly more lab-cut
 * granularity, not more staples) and that measurement still holds.
 *
 * `STAPLE_PATTERNS` is the alternative: a hand-curated, hand-editable
 * table -- same shape and philosophy as CATEGORY_AISLE and BRAND_NAMES --
 * of foods a family actually buys, decided by a person, that bypass the
 * qualifier-clause cap outright no matter how many real clauses USDA
 * wrote. Every entry names the specific reason it's here. Most entries
 * only need the cap bypass, because their USDA category is already
 * correctly mapped; `categoryOverride` is for the one exception
 * (pizza) whose blocker is category EXCLUSION, not the clause cap --
 * USDA files generic frozen supermarket pizza under category 21 (Fast
 * Foods) alongside actual restaurant/branded rows, and category 21 is
 * correctly excluded for those; `categoryOverride` supplies the
 * {category, aisle} an excluded category has none of, scoped to just
 * this one description shape so it doesn't reopen category 21 broadly.
 *
 * @type {Array<{test: (description: string) => boolean, categoryOverride?: {category: string, aisle: string}}>}
 */
export const STAPLE_PATTERNS = [
  {
    // Near-universal safe food for picky eaters; missing entirely
    // otherwise (only brown rice survived the cap). "regular, raw,
    // enriched" are all real distinguishing info (grain length/processing/
    // fortification), not lab-speak -- 6 displayName clauses, nowhere
    // close to the cap without a bypass.
    test: (d) => /^Rice, white, long-grain, regular, raw\b/i.test(d),
  },
  {
    // Also a top-tier picky-eater safe food; missing entirely otherwise.
    // Matches every real cut (steak, wedge, shoestring, crinkle,
    // cottage-cut, ...) USDA publishes under this prefix -- multiple
    // real grocery SKUs, not lab variants of one food.
    test: (d) => /^Potatoes, french fried\b/i.test(d),
  },
  {
    // The only two non-branded, non-restaurant chicken nugget rows in
    // SR Legacy (fdc 172111, 172112) -- every other "nugget" match in the
    // raw data is a restaurant chain (McDonald's, Wendy's, Denny's, all
    // category 21, correctly excluded) or an unrelated food (salmon
    // nuggets, an ice cream bar). Confirmed present in the source, not
    // invented: without this entry the seed's only "nugget" matches are
    // that ice cream bar and the salmon nuggets.
    test: (d) => /^Chicken, nuggets\b/i.test(d),
  },
  {
    // Generic frozen supermarket pizza -- "Pizza, cheese topping, regular
    // crust, frozen, cooked" and its meat/pepperoni/meat-and-vegetable,
    // thin/rising/thick-crust siblings. USDA files these under category
    // 21 (Fast Foods) next to McDONALD'S/PIZZA HUT rows, but these
    // specific ones are the generic supermarket-freezer-aisle product,
    // not a restaurant purchase or a brand -- see categoryOverride above.
    test: (d) => /^Pizza, [a-z ]+ topping, [a-z ]+ crust, frozen, cooked$/i.test(d),
    categoryOverride: { category: 'snack', aisle: 'frozen_meals' },
  },
];

function findStaplePattern(description) {
  return STAPLE_PATTERNS.find((p) => p.test(description)) ?? null;
}

// FIX ROUND 3 (fix 3, CRITICAL): words that mean the food has been
// concentrated or dehydrated, so its per-100g nutrition is not comparable
// to the fresh/raw version -- dried whole egg is ~4x the calories of a
// fresh egg by weight, because most of the weight (water) is gone. This is
// the deliberately NARROWER list from fix 1's NOT-droppable set: fix 1 also
// treats drained/undrained/unsalted/salted/(un)sweetened/"low sodium"/
// "reduced fat"/"fat free"/light/lite as not-droppable (they change the
// name, correctly), but none of those multiply the per-100g macros the way
// drying or concentrating does, so they don't need a say in which
// collision candidate wins -- only these do.
const PROCESSED_STATE_WORDS = new Set(['dried', 'dehydrated', 'powder', 'canned', 'frozen', 'condensed', 'evaporated', 'concentrate']);

function hasProcessedStateWord(description) {
  const words = normalizeName(description).split(' ');
  return words.some((w) => PROCESSED_STATE_WORDS.has(w));
}

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
 * @param {Array<{categoryId: string, test: (description: string) => boolean, aisle: string}>} [args.aisleOverrides]
 *   Fix 4: refines categoryAisle's per-category aisle for a food whose
 *   description matches an override's test, e.g. routing "Egg, whole, raw"
 *   to the `eggs` iOS aisle instead of category 1's default `dairy`. See
 *   AISLE_OVERRIDES in food-aisle-map.mjs for the real ones and why only
 *   two categories get one. Optional and defaults to none, so existing
 *   callers/tests that don't pass it see no change in behavior.
 * @returns {{rows: object[], dropped: Array<{fdc_id: string, description: string, reason: string}>}}
 */
export function buildSeed({ foods, nutrients, categoryAisle, excluded, aisleOverrides = [] }) {
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

    // Checked by description prefix, independent of category id -- see
    // ALCOHOLIC_BEVERAGE_PREFIX_RE above for why category alone can't
    // catch these (USDA files some alcoholic beverages under plain
    // Beverages, category 14, not Alcoholic Beverages, category 28).
    if (isAlcoholicBeverage(description)) {
      dropped.push({ fdc_id, description, reason: 'alcoholic-beverage: not appropriate for a child-nutrition catalog regardless of category id' });
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

    // Fix 2: name is computed here, before the clause-count check, so the
    // cap counts displayName's OUTPUT rather than the raw description's
    // commas -- see MAX_QUALIFIER_CLAUSES above for why that distinction
    // is what put tuna, milk, beans and salmon back in the catalog.
    const name = displayName(description);

    // Fix 7: displayName can return "" for a description that is empty or
    // entirely punctuation once trimmed. No real USDA row does this today,
    // but nothing downstream is prepared to handle a blank name, so drop
    // it with a reason rather than let one through.
    if (name === '') {
      dropped.push({ fdc_id, description, reason: 'empty display name after stripping punctuation-only description' });
      continue;
    }

    // FIX ROUND 4: a hand-curated staple bypasses the qualifier-clause
    // cap outright -- see STAPLE_PATTERNS for why (canned tuna's
    // NON_COUNTING_QUALIFIER_PATTERNS trick doesn't generalize to every
    // real multi-clause staple, and widening the cap costs far more
    // lab-cut noise than it buys in staples, per fix round 3's own
    // measurement).
    const staplePattern = findStaplePattern(description);

    if (!staplePattern) {
      const clauseCount = countedClauses(name).length;
      if (clauseCount > MAX_QUALIFIER_CLAUSES) {
        dropped.push({ fdc_id, description, reason: `too many qualifier clauses (${clauseCount} > ${MAX_QUALIFIER_CLAUSES} on "${name}") -- too narrow a lab variant for a family catalog` });
        continue;
      }
    }

    // A staple's categoryOverride (pizza only, so far) also bypasses
    // category exclusion -- USDA files it under an excluded category
    // (Fast Foods) for reasons that don't apply to this specific,
    // hand-picked description shape, and supplies the {category, aisle}
    // an excluded category has none of. Every other staple has no
    // categoryOverride and goes through the normal excluded/mapped checks
    // below unchanged, since their USDA categories are already fine.
    let mapping;
    if (staplePattern?.categoryOverride) {
      mapping = staplePattern.categoryOverride;
    } else {
      if (excluded.has(categoryId)) {
        dropped.push({ fdc_id, description, reason: `excluded category (food_category_id=${categoryId})` });
        continue;
      }

      const categoryMapping = categoryAisle[categoryId];
      if (!categoryMapping) {
        dropped.push({ fdc_id, description, reason: `unmapped category (food_category_id=${categoryId})` });
        continue;
      }

      // Fix 4: an override (matched on the raw description, since that's
      // what carries the signal -- "Egg, whole, raw" -- displayName's
      // output for the same row is just "Egg, whole") replaces the
      // category's default aisle; `category` (the six-value FoodCategory
      // union) is untouched either way, per the brief.
      let aisle = categoryMapping.aisle;
      for (const override of aisleOverrides) {
        if (override.categoryId === categoryId && override.test(description)) {
          aisle = override.aisle;
          break;
        }
      }
      mapping = { category: categoryMapping.category, aisle };
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

    const name_normalized = normalizeName(name);
    const richness = Object.values(nutrientValues).filter((v) => typeof v === 'number').length;

    candidates.push({ fdc_id, description, name, name_normalized, mapping, nutrientValues, richness });
  }

  // Resolve name_normalized collisions. grocery_product_catalog_name_uq is
  // UNIQUE on name_normalized alone (see US-793's migration), so this has
  // to happen here, before anything is ever inserted.
  //
  // Three-rank tie-break, in order:
  //   1. Nutrient completeness (richness) -- keep whichever candidate has
  //      the more complete nutrient profile; a catalog is more useful with
  //      more filled in, and a sparser duplicate is usually the
  //      lower-quality sample of the pair.
  //   2. FIX ROUND 3 (fix 3, CRITICAL): processed state -- among
  //      equally-rich candidates, a description with no PROCESSED_STATE_WORDS
  //      match (or an explicitly raw/fresh one) beats one that does. Without
  //      this rank, richness alone left the seed shipping "Egg, whole" at
  //      592 kcal/100g: "Egg, whole, dried" (17 chars) and "Egg, whole,
  //      raw, fresh" (22 chars) have essentially the same nutrient
  //      completeness (both are well-sampled USDA rows), so the OLD
  //      richness-then-length order fell straight to length and the
  //      shorter, dried row won every time. This rank sits between
  //      richness and length specifically to catch that case before length
  //      ever gets a vote.
  //   3. Description length -- keep the shorter original description (the
  //      plainer food), only once richness and processed-state both tie.
  //
  // DO NOT "fix" rank 1 back to shorter-description-only. This exact
  // question came up during an earlier review: the task brief's prose said
  // "keep the shorter description," but its own verbatim fixture requires
  // keeping fdc 1 ("Lemons, raw, without peel", 25 chars, 2 nutrient facts)
  // over fdc 5 ("Lemons, raw", 11 chars, 1 nutrient fact) once both reduce
  // to displayName "Lemons" -- the shorter one loses. Nutrient-completeness-
  // first is not a workaround to pass that test; it's the better rule on
  // its own terms (a row with full macros is worth more to the catalog
  // than a row with a shorter name) and it happens to resolve the brief's
  // internal contradiction correctly.
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
      const aProcessed = hasProcessedStateWord(a.description) ? 1 : 0;
      const bProcessed = hasProcessedStateWord(b.description) ? 1 : 0;
      if (aProcessed !== bProcessed) return aProcessed - bProcessed; // not-processed (0) beats processed (1)
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
  const { CATEGORY_AISLE, EXCLUDED_CATEGORIES, AISLE_OVERRIDES } = await import('./food-aisle-map.mjs');

  console.log(`Reading USDA CSVs from ${usdaDir} ...`);
  const { foods, nutrients } = loadFoodsAndNutrients(usdaDir);
  console.log(`Loaded ${foods.length} food.csv rows and ${nutrients.length} food_nutrient.csv rows.`);

  const { rows, dropped } = buildSeed({
    foods,
    nutrients,
    categoryAisle: CATEGORY_AISLE,
    excluded: EXCLUDED_CATEGORIES,
    aisleOverrides: AISLE_OVERRIDES,
  });

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
