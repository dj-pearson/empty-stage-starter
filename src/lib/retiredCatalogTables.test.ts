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
    // EMPTY. Every reference is gone: three web readers, three web writers and
    // the two edge functions the story did count. `nutrition` itself is still
    // there and still populated, which is AC3's whole point -- the table is
    // retired in a LATER release, after one where both it and the catalog are
    // live, per the deprecation flow in CLAUDE.md.
  },
  canonical_products: {
    // EMPTY, and now permanently so: 20260919000000 dropped the table. It was
    // never seeded by any migration, so nothing was lost. The resolver in
    // src/lib/itemResolver.ts stays -- it is the cross-platform specification
    // the Swift mirror answers to (US-682) and it never queried the table, only
    // mirrored its shape. Its input types are now described as input types.
  },
  item_aliases: {
    // EMPTY for the same reason: dropped by 20260919000000, never written to by
    // anything. A mention here is now a bug rather than a step in a sequence.
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
