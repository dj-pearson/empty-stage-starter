#!/usr/bin/env node
/**
 * Gzipped size budgets for the built JavaScript (US-775).
 *
 * vite.config.ts carries 200+ lines of manual chunking, and every rule in it is
 * annotated with a production breakage it prevents -- Sentry blanking the app
 * through a TDZ, TipTap's CJS interop, recharts and react-redux racing at module
 * init, a vendor-misc catch-all that produced "Cannot set properties of
 * undefined". It is empirically derived scar tissue, one dependency bump from
 * shifting again, and until now nothing measured the result. A chunking change
 * that quietly moved a megabyte into the entry bundle would have shipped
 * looking exactly like a chunking change that helped.
 *
 * Budgets are per named chunk plus a total, because the two catch different
 * things: a per-chunk budget catches one dependency ballooning, and the total
 * catches work being shuffled between chunks without getting smaller.
 *
 * Gzipped, because that is what crosses the wire. Chunk filenames carry a
 * content hash, so budgets key on the stable prefix before it.
 *
 *   node scripts/ci/check-bundle-budget.mjs            # check (CI)
 *   node scripts/ci/check-bundle-budget.mjs --update   # re-measure and rewrite
 *
 * --update is for a deliberate, explained change. Running it to make a red
 * build green is how a budget stops being one.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const ROOT = process.cwd();
const JS_DIR = path.join(ROOT, 'dist', 'assets', 'js');
const BUDGET_FILE = path.join(ROOT, '.ci', 'bundle-budget.json');

/** Headroom applied when (re)generating budgets. */
const HEADROOM = 1.05;

/**
 * Absolute floor on headroom, in bytes.
 *
 * 5% of a 1 kB chunk is 50 bytes, and rounding to the nearest kB gave
 * vendor-supabase (a ~1 kB re-export shim) a budget it sat 47 bytes under.
 * A gate that fails on noise gets --update'd until it means nothing.
 */
const MIN_HEADROOM_BYTES = 2000;

const budgetFor = (bytes) =>
  Math.max(Math.ceil((bytes * HEADROOM) / 1000) * 1000, bytes + MIN_HEADROOM_BYTES);

/**
 * `index-B7dhznvA.js` -> `index`; `vendor-three-core-DV3ss7Cs.js` -> `vendor-three-core`.
 *
 * Strips a trailing `-` plus EXACTLY 8 characters, which is Vite's default
 * content-hash length. Two narrower rules both failed on real filenames:
 *
 *   `-[A-Za-z0-9_-]{8,}$` matched greedily from the FIRST hyphen because the
 *   class contains one, so `vendor-swagger-B_m6f195` collapsed to `vendor`,
 *   failed the `startsWith('vendor-')` filter, and every vendor chunk was
 *   silently dropped -- the generated budget covered the entry chunk alone.
 *
 *   `-[^-]+$` (strip the last segment) broke on `vendor-supabase-Dx3Vi-Xp`,
 *   because Vite hashes are base64url and CONTAIN hyphens. That left the hash
 *   fragment `Dx3Vi` in the key, which would never match again on the next
 *   build and would silently drop that chunk from the budget forever.
 *
 * Both failure modes look identical to a working budget from the outside,
 * which is why chunkKey has its own tests over real filenames.
 */
export function chunkKey(fileName) {
  return fileName.replace(/\.js$/, '').replace(/-[A-Za-z0-9_-]{8}$/, '');
}

function measure() {
  if (!existsSync(JS_DIR)) {
    throw new Error(`check-bundle-budget: ${JS_DIR} not found. Run this after a build.`);
  }
  const files = readdirSync(JS_DIR).filter((f) => f.endsWith('.js'));
  if (files.length === 0) {
    throw new Error('check-bundle-budget: no .js files in dist/assets/js.');
  }

  const sizes = new Map();
  let total = 0;
  for (const file of files) {
    const gz = gzipSync(readFileSync(path.join(JS_DIR, file))).length;
    total += gz;
    const key = chunkKey(file);
    // A key can legitimately map to more than one file (a chunk split further
    // by vite); sum rather than overwrite, or the budget checks a fragment.
    sizes.set(key, (sizes.get(key) ?? 0) + gz);
  }
  return { sizes, total, fileCount: files.length };
}

/** Chunks worth a named budget: the entry, and every deliberately-named vendor chunk. */
function budgetedKeys(sizes) {
  return [...sizes.keys()].filter((k) => k === 'index' || k.startsWith('vendor-')).sort();
}

const { sizes, total, fileCount } = measure();

if (process.argv.includes('--update')) {
  const budgets = {};
  for (const key of budgetedKeys(sizes)) {
    budgets[key] = budgetFor(sizes.get(key));
  }
  const payload = {
    _comment:
      'Gzipped byte budgets for dist/assets/js, enforced by scripts/ci/check-bundle-budget.mjs. Measured values and the reasoning are in .ci/bundle-budget.md. Regenerate with --update only for a deliberate, explained change.',
    _measuredAt: new Date().toISOString().slice(0, 10),
    _headroom: HEADROOM,
    totalJs: budgetFor(total),
    chunks: budgets,
  };
  writeFileSync(BUDGET_FILE, JSON.stringify(payload, null, 2) + '\n');
  console.log(`check-bundle-budget: wrote ${BUDGET_FILE}`);
  console.log(`  total js ${total} gz across ${fileCount} files -> budget ${payload.totalJs}`);
  process.exit(0);
}

if (!existsSync(BUDGET_FILE)) {
  throw new Error(
    `check-bundle-budget: ${BUDGET_FILE} missing. Generate it with --update after a build.`
  );
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
const failures = [];
const missing = [];

for (const [key, limit] of Object.entries(budget.chunks ?? {})) {
  const actual = sizes.get(key);
  if (actual === undefined) {
    // A budgeted chunk that vanished is not a failure -- it usually means a
    // dependency was removed, which is the outcome we want -- but it must be
    // said out loud so the budget file gets cleaned up.
    missing.push(key);
    continue;
  }
  if (actual > limit) failures.push({ key, actual, limit });
}

if (total > budget.totalJs) {
  failures.push({ key: 'TOTAL js', actual: total, limit: budget.totalJs });
}

const kb = (n) => `${(n / 1000).toFixed(1)} kB`;

for (const key of missing) {
  console.log(`check-bundle-budget: note -- budgeted chunk "${key}" is gone. Drop it from ${path.relative(ROOT, BUDGET_FILE)}.`);
}

if (failures.length > 0) {
  console.error('\nBundle budget exceeded (gzipped):\n');
  for (const f of failures) {
    console.error(
      `  ${f.key.padEnd(22)} ${kb(f.actual).padStart(10)}  >  ${kb(f.limit).padStart(10)}  (+${kb(f.actual - f.limit)})`
    );
  }
  console.error(
    '\nEither make it smaller, or re-measure deliberately with --update and say why in the commit.\n'
  );
  process.exit(1);
}

console.log(
  `check-bundle-budget: ${fileCount} files, ${kb(total)} gz total (budget ${kb(budget.totalJs)}); ${Object.keys(budget.chunks ?? {}).length} chunk budgets met.`
);
