import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * US-799 AC2: the admin CRUD screen writes the canonical catalog.
 *
 * A source check rather than a render test, because what this story is about
 * is which table and which units, and both are visible in the source while
 * neither is visible in the rendered output. A screen that reads the catalog
 * and writes `nutrition` renders identically to one that does neither.
 */

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const MANAGER = 'src/components/admin/NutritionManager.tsx';

/**
 * Just the object the screen sends to Supabase.
 *
 * Whole-file matching cannot answer "is this column written": `calories` is a
 * form-state key and `serving_size_g` is a field of the row type, and both
 * would read as writes. The payload is the only place the question is decided.
 */
function writePayload(src: string): string {
  const start = src.indexOf('const catalogData = {');
  expect(start, 'catalogData literal not found -- did the payload get renamed?').toBeGreaterThan(-1);
  const end = src.indexOf('\n    };', start);
  return src.slice(start, end);
}

describe('NutritionManager writes grocery_product_catalog', () => {
  it('names no table but the catalog', () => {
    const src = read(MANAGER);
    expect(src).not.toMatch(/\bfrom\((['"`])nutrition\1\)/);
    // Every read and write: list, insert, update, delete.
    expect(src.match(/from\("grocery_product_catalog"\)/g) ?? []).toHaveLength(4);
  });

  it('writes the per-100g columns, not the per-serving ones', () => {
    // The mistake this catches is the one that produces a plausible wrong
    // answer rather than an error: a per-serving figure in a per-100g column
    // is a valid number that is four times too small.
    const payload = writePayload(read(MANAGER));
    for (const column of ['calories_kcal_100', 'protein_g_100', 'carbs_g_100', 'fat_g_100']) {
      expect(payload, `${column} should be written`).toContain(`${column}:`);
    }
    // `calories:` etc. were the nutrition table's per-serving names.
    expect(payload).not.toMatch(/(^|\s)calories:/);
    expect(payload).not.toMatch(/(^|\s)protein_g:/);
  });

  it('tells the operator the figures are per 100g', () => {
    // The columns changed meaning. A form that asks for "Calories" over a
    // per-100g column is how the wrong number gets typed in.
    const src = read(MANAGER);
    expect(src).toContain('Calories /100g');
    expect(src).toContain('per 100 g');
  });

  it('does not send serving_size_g, which the database derives', () => {
    // parse_serving_grams refuses to guess at "2 cookies"; a client-side
    // parser would be a second implementation that has to agree with it
    // forever. 20260918000009 makes that unnecessary.
    const payload = writePayload(read(MANAGER));
    expect(payload).not.toMatch(/serving_size_g:/);
    expect(payload).toContain('serving_size_text:');
  });

  it('does not send name_normalized, which the database derives', () => {
    // The iOS matcher joins on this column. A hand-rolled normalizer that
    // collapses whitespace differently writes a row the shipped app cannot
    // find -- see the comment on normalize_product_name in 20260908000000.
    expect(writePayload(read(MANAGER))).not.toMatch(/name_normalized:/);
    // The insert spread is the other half; it adds kind/source/created_by.
    expect(read(MANAGER)).not.toMatch(/name_normalized:\s*[a-zA-Z"']/);
  });

  it('verifies what an admin saves, and says so', () => {
    // US-797 keeps unverified figures out of totals. An admin editing a row
    // IS the verification; without this, an operator can correct a row and
    // watch it go on being ignored.
    const src = read(MANAGER);
    expect(writePayload(src)).toMatch(/verification: "verified"/);
    expect(src).toContain('verified_by');
  });

  it('explains the one write failure an operator can act on', () => {
    // gpc_guard_verification raises insufficient_privilege for a non-admin,
    // and this screen sets verification on every save. "Failed to update"
    // does not tell them the problem is their role.
    const src = read(MANAGER);
    expect(src).toContain('42501');
    expect(src).toMatch(/Only an admin can verify/);
  });
});

describe('the derived columns are derived in one place', () => {
  const MIGRATION = 'supabase/migrations/20260918000009_catalog_fills_derived_columns.sql';

  it('the trigger fires before the NOT NULL check', () => {
    // A BEFORE trigger is the only thing that can fill a NOT NULL column the
    // writer omitted. AFTER would be too late and the insert would fail.
    const sql = read(MIGRATION);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF/);
    expect(sql).toMatch(/ON public\.grocery_product_catalog/);
  });

  it('fills rather than overwrites', () => {
    // The shipped iOS build computes name_normalized itself and matches on
    // the result. Forcing the SQL answer over a client's would change which
    // rows that build can find.
    const sql = read(MIGRATION);
    expect(sql).toMatch(/NEW\.name_normalized IS NULL OR btrim\(NEW\.name_normalized\) = ''/);
    expect(sql).toMatch(/NEW\.serving_size_g IS NULL/);
  });

  it('the default exists so a typed client can omit the column', () => {
    // Without it `supabase gen types` marks name_normalized required on
    // Insert and TypeScript rejects the omission this trigger is for.
    const sql = read(MIGRATION);
    expect(sql).toMatch(/ALTER COLUMN name_normalized SET DEFAULT ''/);
  });

  it('types.ts agrees that the column is optional on insert', () => {
    // The generated file and the schema have to say the same thing, or the
    // Types Drift job reds and this screen stops compiling.
    const types = read('src/integrations/supabase/types.ts');
    const catalog = types.slice(types.indexOf('grocery_product_catalog: {'));
    const insert = catalog.slice(catalog.indexOf('Insert: {'), catalog.indexOf('Update: {'));
    expect(insert).toMatch(/name_normalized\?: string/);
  });
});
