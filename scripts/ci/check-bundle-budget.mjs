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
import { fileURLToPath } from 'node:url';

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

/**
 * Chunks that must never be reachable from the entry by STATIC import.
 *
 * Each is a library one route needs and no other: a rich-text editor, an API
 * doc viewer, a markdown renderer, a PDF writer, a camera barcode scanner.
 * Vite lazy-loads the routes, so the intent is already expressed -- what breaks
 * it is a shared module that no manualChunks rule claims. Rollup files such a
 * module under whichever chunk happens to reach it first, and then anything
 * needing that module statically imports the whole chunk behind it.
 *
 * That is not a hypothetical. Twice in one afternoon:
 *
 *   tslib landed in vendor-markdown. react-remove-scroll needs three of its
 *   helpers and sits behind every Radix dialog, so the ENTRY chunk imported
 *   136 kB gzipped of react-markdown, on every route.
 *
 *   use-sync-external-store landed in vendor-tiptap. Radix's Avatar reads
 *   useSyncExternalStore through it, so avatar-*.js imported 137 kB gzipped of
 *   TipTap and ProseMirror -- onto the marketing home page.
 *
 * Both sat inside their per-chunk budgets the whole time, because a per-chunk
 * budget asks how big a chunk is and never asks who has to download it.
 */
const LAZY_ONLY_CHUNKS = [
  'vendor-tiptap',
  'vendor-swagger',
  'vendor-swagger-deps',
  'vendor-markdown',
];

/** The entry chunk Vite put in the built HTML, e.g. `assets/js/index-8GTr-V14.js`. */
function entryFile() {
  // app-shell.html is the un-prerendered shell (scripts/prerender.mjs keeps it
  // on disk for exactly this kind of question). Fall back to index.html for a
  // build that did not prerender.
  for (const name of ['app-shell.html', 'index.html']) {
    const file = path.join(ROOT, 'dist', name);
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    const match = html.match(/<script[^>]+type="module"[^>]+src="\/assets\/js\/([^"]+)"/);
    if (match) return match[1];
  }
  throw new Error('check-bundle-budget: no module entry script found in dist HTML.');
}

/**
 * Every chunk the browser must have before the entry can run.
 *
 * Static imports only. `from"./x.js"` and a bare `import"./x.js"` are static;
 * `import("./x.js")` is a dynamic import and deliberately does not match,
 * because that one is the whole point of splitting.
 */
export function staticImportsOf(source) {
  const found = new Set();
  for (const m of source.matchAll(/(?:from|import)"(\.\/[^"]+\.js)"/g)) {
    found.add(m[1].slice(2));
  }
  return [...found];
}

function eagerClosure() {
  const seen = new Set();
  const queue = [entryFile()];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    const full = path.join(JS_DIR, file);
    if (!existsSync(full)) continue;
    seen.add(file);
    queue.push(...staticImportsOf(readFileSync(full, 'utf8')));
  }
  let bytes = 0;
  for (const file of seen) bytes += gzipSync(readFileSync(path.join(JS_DIR, file))).length;
  return { files: seen, bytes };
}

/**
 * The CLI body, behind a run-as-script guard.
 *
 * This used to run at module scope, so `import { chunkKey }` from a test
 * EXECUTED the whole check -- measured a dist/ that is not there and called
 * process.exit(1) during collection. src/lib/bundleBudget.test.ts therefore
 * never ran a single assertion, and reported as a failing FILE rather than as
 * a failing test, which is easy to read past (US-787).
 */
function main() {
  const { sizes, total, fileCount } = measure();

  if (process.argv.includes('--update')) {
    const budgets = {};
    for (const key of budgetedKeys(sizes)) {
      budgets[key] = budgetFor(sizes.get(key));
    }
    const eager = eagerClosure();
    const payload = {
      _comment:
        'Gzipped byte budgets for dist/assets/js, enforced by scripts/ci/check-bundle-budget.mjs. Measured values and the reasoning are in .ci/bundle-budget.md. Regenerate with --update only for a deliberate, explained change.',
      _measuredAt: new Date().toISOString().slice(0, 10),
      _headroom: HEADROOM,
      totalJs: budgetFor(total),
      // What the browser must download before the entry runs, as opposed to
      // what the build produced in total. The per-chunk budgets below never
      // moved while two whole vendor libraries were being dragged into this
      // number, which is the reason it exists.
      eagerJs: budgetFor(eager.bytes),
      chunks: budgets,
    };
    writeFileSync(BUDGET_FILE, JSON.stringify(payload, null, 2) + '\n');
    console.log(`check-bundle-budget: wrote ${BUDGET_FILE}`);
    console.log(`  total js ${total} gz across ${fileCount} files -> budget ${payload.totalJs}`);
    console.log(`  eager js ${eager.bytes} gz across ${eager.files.size} chunks -> budget ${payload.eagerJs}`);
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

  const eager = eagerClosure();
  if (typeof budget.eagerJs === 'number' && eager.bytes > budget.eagerJs) {
    failures.push({ key: 'EAGER js', actual: eager.bytes, limit: budget.eagerJs });
  }

  // Reported separately from the byte budget because the diagnosis differs.
  // Over budget means something grew. A lazy-only chunk in the eager set means
  // a shared module was filed under the wrong chunk, and the fix is a
  // manualChunks rule that claims it, not a smaller dependency.
  const leaked = [...eager.files]
    .map((file) => chunkKey(file))
    .filter((key) => LAZY_ONLY_CHUNKS.includes(key));

  const kb = (n) => `${(n / 1000).toFixed(1)} kB`;

  for (const key of missing) {
    console.log(`check-bundle-budget: note -- budgeted chunk "${key}" is gone. Drop it from ${path.relative(ROOT, BUDGET_FILE)}.`);
  }

  if (leaked.length > 0) {
    console.error('\nA route-only chunk is in the entry static import graph:\n');
    for (const key of [...new Set(leaked)].sort()) {
      console.error(`  ${key} is downloaded on every route, not just the one that uses it.`);
    }
    console.error(
      '\nThis is almost never the library itself. It is a small shared module that no\n' +
        'manualChunks rule in vite.config.ts claims -- Rollup filed it under this chunk,\n' +
        'and now everything needing that module pulls the whole chunk behind it. Find the\n' +
        'symbol the entry imports from it, then give the module a rule of its own.\n'
    );
    process.exit(1);
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
  console.log(
    `check-bundle-budget: entry pulls ${eager.files.size} chunks eagerly, ${kb(eager.bytes)} gz${
      typeof budget.eagerJs === 'number' ? ` (budget ${kb(budget.eagerJs)})` : ''
    }; no route-only chunk among them.`
  );

}

// Only when invoked as a script. `process.argv[1]` is the entry path; a test
// that imports this module has a different one.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
