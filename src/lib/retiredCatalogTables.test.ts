import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

/**
 * US-799 AC5: nothing new gets wired to a table that is on its way out.
 *
 * The epic leaves one canonical catalog, grocery_product_catalog, and three
 * tables being retired around it. The failure this guards is mundane and
 * expensive: someone writes a feature against `nutrition` because it is still
 * there and still has rows, and the retirement gains another blocker.
 *
 * Existing references are listed, not banned. A retirement is a sequence, and a
 * list that has to shrink is more useful than a rule that cannot be followed
 * today: each entry says what has to happen before it can go.
 */

const ROOT = path.resolve(__dirname, '..', '..');

/** The tables the shared-food-catalog epic retires. */
const RETIRED = {
  nutrition: /\bfrom\((['"`])nutrition\1\)/,
  canonical_products: /\bcanonical_products\b/,
  item_aliases: /\bitem_aliases\b/,
} as const;

/**
 * Where each retired table is still referenced, and what has to happen first.
 *
 * Deleting an entry when the reference goes is the point; adding one needs a
 * reason as good as these.
 */
const KNOWN: Record<string, Record<string, string>> = {
  nutrition: {
    // Edge functions. The story counted these and said eighteen; eighteen
    // files mention the WORD nutrition, and two query the table.
    'supabase/functions/lookup-barcode/index.ts':
      'Reads the barcode cache and writes back to it, and already promotes to the catalog ' +
      'alongside. Migrating the read is US-799 AC2; it cannot stop writing in the same release ' +
      'the table is dropped.',
    'supabase/functions/generate-weekly-report/index.ts':
      'Reads nutrition for the weekly email. The second and last edge-function reader.',
    // Web. The story did not count these at all, and there are three times as
    // many of them as there are edge functions.
    'src/components/AddFoodDialog.tsx':
      'ilike search over nutrition names when adding a food. Wants the catalog, whose ' +
      'name_normalized exists for exactly this.',
    'src/components/CalendarMealPlanner.tsx':
      'Selects the whole nutrition table to offer foods for a meal slot. Unbounded, and the ' +
      'catalog is the right source.',
    'src/components/GSAPCalendarMealPlanner.tsx':
      'The same unbounded select as CalendarMealPlanner; the two planners disagree about ' +
      'nothing here and should move together.',
    'src/components/admin/BarcodeScannerDialog.tsx':
      'Writes a scanned product into nutrition. The catalog already gets the same product via ' +
      'lookup-barcode promotion, so this write is the duplicate to remove.',
    'src/components/admin/NutritionImportDialog.tsx':
      'Bulk import writes rows into nutrition. Must target the catalog before the table goes.',
    'src/components/admin/NutritionManager.tsx':
      'The admin CRUD screen for nutrition: list, update, delete. The last thing to migrate, ' +
      'because it is how an operator fixes a row today.',
  },
  canonical_products: {
    'src/integrations/supabase/types.ts': 'Generated from the schema; it goes when the table goes.',
    'src/lib/itemResolver.ts':
      'Row shapes and a resolver with NO production consumer -- only its own test and ' +
      'kitchenLoopFixtures.test.ts import it. Goes with the table.',
    'src/lib/itemResolver.test.ts': 'Tests the resolver named above, and goes with it.',
  },
  item_aliases: {
    'src/integrations/supabase/types.ts': 'Generated from the schema; it goes when the table goes.',
    'src/lib/itemResolver.ts': 'As above: row shapes in a resolver with no production consumer.',
    'src/lib/itemNormalize.ts': 'Row shape only, no query. Goes with the resolver.',
  },
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = [
  ...sourceFiles(path.join(ROOT, 'src')),
  ...sourceFiles(path.join(ROOT, 'supabase', 'functions')),
].map((f) => ({ rel: path.relative(ROOT, f).split(path.sep).join('/'), body: readFileSync(f, 'utf8') }));

describe('the retired catalog tables gain no new callers', () => {
  for (const [table, pattern] of Object.entries(RETIRED)) {
    it(`nothing new references ${table}`, () => {
      // This file's own KNOWN map mentions every table by name; exclude it
      // from the nutrition and canonical_products sweeps the same way it is
      // listed for item_aliases.
      const offenders = FILES.filter(
        (f) => f.rel !== 'src/lib/retiredCatalogTables.test.ts' && pattern.test(f.body)
      )
        .map((f) => f.rel)
        .filter((rel) => !(rel in (KNOWN[table] ?? {})))
        .sort();

      expect(
        offenders,
        `These reference ${table}, which the shared-food-catalog epic is retiring. Use ` +
          'grocery_product_catalog. If a reference is genuinely unavoidable, add it to KNOWN ' +
          'in this file with what has to happen before it can go.'
      ).toEqual([]);
    });
  }

  it('every listed reference still exists, so the list shrinks as the work lands', () => {
    // A retirement measured by a list that never changes is not a retirement.
    const stale: string[] = [];
    for (const [table, entries] of Object.entries(KNOWN)) {
      for (const rel of Object.keys(entries)) {
        if (rel === 'src/lib/retiredCatalogTables.test.ts') continue;
        const file = FILES.find((f) => f.rel === rel);
        if (!file || !RETIRED[table as keyof typeof RETIRED].test(file.body)) {
          stale.push(`${table}: ${rel}`);
        }
      }
    }
    expect(stale, 'These no longer reference the table; delete the entry.').toEqual([]);
  });

  it('gives a real reason for each one', () => {
    for (const [table, entries] of Object.entries(KNOWN)) {
      for (const [rel, reason] of Object.entries(entries)) {
        expect(reason.length, `${table}/${rel} needs a reason, not a placeholder`).toBeGreaterThan(25);
      }
    }
  });
});
