#!/usr/bin/env node
/**
 * US-794: turn supabase/seed/canonical_foods.json (built by
 * scripts/seed/build-food-seed.mjs, US-793/US-794 task 2) into the migration
 * that loads the USDA generic backbone into public.grocery_product_catalog.
 *
 * This script CONSUMES the seed JSON as-is. It does not re-derive, filter,
 * or re-normalize anything the builder already decided -- if a row looks
 * wrong, fix the builder and regenerate the JSON, not this script.
 *
 * Every column in the seed JSON that is NULL across every single row in the
 * current dataset (barcode, default_unit, default_quantity, brand,
 * package_size, package_unit, metadata, parent_food_id, allergens,
 * serving_size_g, verified_at, verified_by) is left out of the generated
 * INSERT's column list entirely and allowed to take its table default
 * (NULL, since none of them are NOT NULL). This is not just tidiness: a
 * `(VALUES (...), (...), ...) AS v(col, ...)` list infers each column's type
 * from the literals across all rows in that VALUES list, and a column that
 * is NULL in every row of a 500-row batch has nothing to infer a type from
 * -- Postgres falls back to `text`, which then fails to implicitly cast into
 * a numeric/uuid/jsonb/text[] target column. Omitting an all-NULL column
 * sidesteps the problem instead of working around it with per-literal casts
 * scripts/seed/seed-to-migration.mjs would otherwise need to sprinkle
 * everywhere. verified_at/verified_by are additionally owned by the
 * gpc_guard_verification trigger (US-793): on a fresh INSERT with
 * verification='verified' it always overwrites both from `now()`/auth.uid(),
 * so passing them through would be inert even if they were populated.
 *
 * Every column that DOES vary (including ones with some nulls, like
 * fiber_g_100/sugar_g_100/sodium_mg_100) is written with an explicit
 * ::numeric or ::text cast on every literal, including NULL, so the VALUES
 * list's column type is pinned no matter how a given 500-row batch happens
 * to be distributed.
 *
 * IDEMPOTENCY has two guards, not one, because there is no unique index on
 * source_ref (only name_normalized): ON CONFLICT (name_normalized) DO
 * NOTHING stops a second run from duplicating a row an operator hasn't
 * touched, but if an operator renames a seeded row, its name_normalized
 * changes, no conflict fires on a re-run, and a second copy would land with
 * the same source_ref. WHERE NOT EXISTS (... source = 'usda' AND
 * source_ref = v.source_ref) closes that gap. Both guards are cheap and
 * neither is redundant with the other.
 *
 * Usage:
 *   node scripts/seed/seed-to-migration.mjs
 *     [--in supabase/seed/canonical_foods.json]
 *     [--out supabase/migrations/20260907000000_seed_usda_generic_foods.sql]
 *     [--batch-size 500]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_IN = path.join(REPO_ROOT, 'supabase', 'seed', 'canonical_foods.json');
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260907000000_seed_usda_generic_foods.sql'
);
const DEFAULT_BATCH_SIZE = 500;

// Columns included in the generated INSERT, in emitted order, with the SQL
// cast used for every literal in that column (including NULL literals).
// text columns are NOT NULL in this dataset (name, name_normalized,
// default_aisle_section, default_category, kind, source, source_ref,
// verification) but are still cast defensively -- it costs nothing and
// keeps this table the single place column shape lives.
const TEXT_COLUMNS = [
  'name',
  'name_normalized',
  'default_aisle_section',
  'default_category',
  'kind',
  'source',
  'source_ref',
  'verification',
];
const NUMERIC_COLUMNS = [
  'calories_kcal_100',
  'protein_g_100',
  'carbs_g_100',
  'fat_g_100',
  'fiber_g_100',
  'sugar_g_100',
  'sodium_mg_100',
];
// times_added is not read from the JSON row -- it is always written as the
// literal 0 below. The row default is 1, which would have every seeded row
// claiming a household added it once; that's false for a USDA import, and
// US-798's frequency promotion counts distinct households rather than this
// column, so being honest here costs nothing.
const COLUMNS = [...TEXT_COLUMNS, ...NUMERIC_COLUMNS, 'times_added'];

/**
 * Escape a string for a single-quoted SQL literal: double any single quote.
 * Throws on any non-ASCII character -- the seed JSON is documented as
 * ASCII-only (Task 2), and a migration is not the place to discover that
 * silently changed.
 * @param {string} s
 * @returns {string}
 */
export function escapeSqlString(s) {
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i);
    if (cp > 127) {
      throw new Error(`non-ASCII character (U+${cp.toString(16).padStart(4, '0')}) in: ${s}`);
    }
  }
  return s.replace(/'/g, "''");
}

/**
 * @param {string | null} s
 * @returns {string} a `'...'::text` or `NULL::text` literal
 */
export function textLiteral(s) {
  if (s === null || s === undefined) return 'NULL::text';
  return `'${escapeSqlString(String(s))}'::text`;
}

/**
 * @param {number | null} n
 * @returns {string} a numeric literal or `NULL::numeric` literal
 */
export function numericLiteral(n) {
  if (n === null || n === undefined) return 'NULL::numeric';
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(`expected a finite number, got: ${JSON.stringify(n)}`);
  }
  return `${n}::numeric`;
}

/**
 * Build the VALUES row for one seed row, in COLUMNS order.
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
export function buildRowValues(row) {
  const parts = [
    ...TEXT_COLUMNS.map((col) => textLiteral(/** @type {string|null} */ (row[col]))),
    ...NUMERIC_COLUMNS.map((col) => numericLiteral(/** @type {number|null} */ (row[col]))),
    '0', // times_added, always 0 for a seeded row -- see the comment on COLUMNS above.
  ];
  return `(${parts.join(', ')})`;
}

/**
 * Split rows into fixed-size batches, in order.
 * @param {unknown[]} rows
 * @param {number} batchSize
 * @returns {unknown[][]}
 */
export function batchRows(rows, batchSize) {
  const batches = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    batches.push(rows.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Build one INSERT statement covering a single batch of rows.
 * @param {Record<string, unknown>[]} batch
 * @returns {string}
 */
export function buildInsertStatement(batch) {
  const valuesList = batch.map(buildRowValues).join(',\n  ');
  const colList = COLUMNS.join(', ');
  return `INSERT INTO public.grocery_product_catalog (${colList})
SELECT ${colList}
FROM (VALUES
  ${valuesList}
) AS v(${colList})
WHERE NOT EXISTS (
  SELECT 1 FROM public.grocery_product_catalog g
   WHERE g.source = 'usda' AND g.source_ref = v.source_ref
)
ON CONFLICT (name_normalized) DO NOTHING;`;
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {number} batchSize
 * @returns {string} the full migration file contents
 */
export function buildMigration(rows, batchSize = DEFAULT_BATCH_SIZE) {
  const batches = batchRows(rows, batchSize);
  const statements = batches.map(buildInsertStatement).join('\n\n');
  return `-- US-794: load the USDA generic backbone into the shared catalog.
--
-- Generated by scripts/seed/seed-to-migration.mjs from
-- supabase/seed/canonical_foods.json (US-793/US-794 task 2). Do not hand-edit
-- this file -- fix the builder or the seed JSON and regenerate instead.
--
-- ${rows.length} rows, in ${batches.length} batch(es) of up to ${batchSize}.
--
-- DO NOTHING, not DO UPDATE: this satisfies the story's requirement that
-- seeding never overwrites a row an operator has since edited, and it makes
-- re-running the migration trivially idempotent for the common case (an
-- untouched name_normalized). A correction to seeded data ships as a new
-- migration, which is the right shape for versioned data.
--
-- verification is set directly to 'verified' here. This is safe specifically
-- in a migration: gpc_guard_verification() (US-793,
-- supabase/migrations/20260906000000_canonical_food_catalog.sql) treats a
-- null auth.uid() as a trusted server context, and a migration runs as one.
-- The trigger stamps verified_at/verified_by itself on the INSERT; this
-- migration never sets either column.
--
-- IDEMPOTENCY has two guards -- see the header comment in
-- scripts/seed/seed-to-migration.mjs for why ON CONFLICT (name_normalized)
-- DO NOTHING alone is not enough to satisfy the story's source_ref
-- idempotency requirement.
${statements}
`;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name, fallback) => {
    const idx = args.indexOf(`--${name}`);
    return idx === -1 ? fallback : args[idx + 1];
  };

  const inPath = path.resolve(getArg('in', DEFAULT_IN));
  const outPath = path.resolve(getArg('out', DEFAULT_OUT));
  const batchSize = Number(getArg('batch-size', String(DEFAULT_BATCH_SIZE)));

  const rows = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`expected a non-empty array of rows in ${inPath}`);
  }

  const sql = buildMigration(rows, batchSize);
  fs.writeFileSync(outPath, sql, 'utf8');
  console.log(`wrote ${rows.length} rows (${Math.ceil(rows.length / batchSize)} batches) to ${outPath}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
