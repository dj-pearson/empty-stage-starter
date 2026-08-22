#!/usr/bin/env node
/**
 * Hard gate: every storage bucket the application writes to is created by a
 * migration.
 *
 * A bucket made by clicking in the Supabase dashboard exists in exactly one
 * place -- production. Its `public` flag and its RLS policies cannot be read
 * from the repo, so a follow-up migration has to be written blind, and a fresh
 * environment (staging, disaster recovery, a new self-hosted instance) comes up
 * without it and fails every upload with no obvious cause.
 *
 * That is not hypothetical here. `images`, which the live iOS app writes every
 * kid photo to, was found only by reading the Swift client, and US-635 is
 * blocked on someone reading its policies out of the dashboard by hand. This
 * gate exists so the next one is caught at the commit that introduces it.
 *
 * It also reports, without failing, buckets that public.storage_buckets_config
 * seeds but that no migration ever created -- dead rows today, since nothing
 * queries that table, but a disagreement between two inventories all the same.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Buckets referenced by code but knowingly not yet declared, each tied to the
 * story that will declare it. This list should only ever shrink.
 */
const PENDING = new Map([
  [
    'images',
    'US-635: created in the dashboard; its policies have to be read out of ' +
      'production before a migration can declare it without guessing.',
  ],
]);

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const read = (f) => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};

/** Buckets an INSERT INTO storage.buckets actually creates. */
const declared = new Map();
for (const file of tracked.filter(
  (f) => f.startsWith('supabase/migrations/') && f.endsWith('.sql')
)) {
  const sql = read(file);
  const inserts = sql.matchAll(
    /insert\s+into\s+storage\.buckets\s*\([^)]*\)\s*values\s*([\s\S]*?);/gi
  );
  for (const insert of inserts) {
    for (const row of insert[1].matchAll(/\(\s*'([^']+)'/g)) {
      if (!declared.has(row[1])) declared.set(row[1], file);
    }
  }
}

/**
 * Buckets with a real call site -- something actually reads or writes them.
 * These must exist, or the operation fails in production.
 */
const referenced = new Map();
const note = (bucket, file) => {
  if (!referenced.has(bucket)) referenced.set(bucket, file);
};

/**
 * Buckets that only appear in storage-manager.ts's STORAGE_BUCKETS record.
 * A registry entry nobody calls cannot break anything today, so it is reported
 * rather than failed -- but it is not harmless either: the admin storage screen
 * renders a tab per registry entry, so it presents buckets that may not exist,
 * and storageManager.upload() would happily target one the day someone passes
 * its name.
 */
const registryOnly = new Map();

for (const file of tracked) {
  if (file.startsWith('supabase/migrations/')) continue;
  if (file.startsWith('coolify-migration/')) continue;
  if (file.startsWith('supabase/diagnostics/')) continue;
  if (file.startsWith('scripts/ci/')) continue;
  // Test fixtures name buckets that deliberately do not exist -- this file's
  // own probes among them. A bucket referenced only by a test is not something
  // production depends on, so scanning them turns the gate's fixtures into
  // findings. (Learned the hard way: the commit that added
  // storageBucketScanner.test.ts left this gate red, because the gate was run
  // before the new file was staged and `git ls-files` could not see it.)
  if (/\.(test|spec)\.[jt]sx?$/.test(file)) continue;
  if (/(^|\/)__tests__\//.test(file)) continue;

  if (/\.(ts|tsx|js|jsx|mjs)$/.test(file)) {
    const src = read(file);
    for (const m of src.matchAll(/storage\s*\.\s*from\(\s*['"`]([A-Za-z0-9._-]+)['"`]/g)) {
      note(m[1], file);
    }
    // A literal-only scan also misses the shape the edge functions use: hoist
    // the bucket into a module constant, then call .from(STORAGE_BUCKET). Both
    // blog-image functions do exactly that, which is why 'blog-images' read as
    // registry-only -- "no migration creates it and nothing calls it" -- while
    // agent-blog-writer and update-blog-image were uploading to it on every
    // run. Resolve single-assignment string constants before matching.
    const stringConsts = new Map();
    for (const m of src.matchAll(
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*['"`]([A-Za-z0-9._-]+)['"`]/g
    )) {
      if (!stringConsts.has(m[1])) stringConsts.set(m[1], m[2]);
    }
    for (const m of src.matchAll(/storage\s*\.\s*from\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
      const resolved = stringConsts.get(m[1]);
      if (resolved) note(resolved, file);
    }
    // The web app mostly does not call storage.from() directly: it goes through
    // storage-manager.ts, which resolves the bucket from a typed record and
    // calls .from(config?.name || bucketName). A literal-only scan sees a
    // dynamic expression there and finds nothing, so read the record itself --
    // it is the actual list of buckets the app believes in.
    const registry = src.match(/export\s+const\s+STORAGE_BUCKETS[^=]*=\s*\{([\s\S]*?)\n\};/);
    if (registry) {
      for (const m of registry[1].matchAll(/\bname:\s*['"`]([A-Za-z0-9._-]+)['"`]/g)) {
        if (!registryOnly.has(m[1])) registryOnly.set(m[1], file);
      }
    }
  } else if (file.endsWith('.swift')) {
    const src = read(file);
    // Swift reaches storage through ImageUploadService's bucketName constant
    // rather than inline, so match the constant as well as a direct .from().
    for (const m of src.matchAll(/bucketName\s*=\s*"([A-Za-z0-9._-]+)"/g)) note(m[1], file);
    for (const m of src.matchAll(/storage\s*\n?\s*\.from\(\s*"([A-Za-z0-9._-]+)"/g))
      note(m[1], file);
  }
}

// A registry entry that also has a real call site is a real reference.
for (const [bucket, file] of registryOnly) {
  if (referenced.has(bucket)) registryOnly.delete(bucket);
  else if (declared.has(bucket)) registryOnly.delete(bucket);
  else registryOnly.set(bucket, file);
}

console.log(
  `Storage buckets: ${declared.size} created by migrations, ${referenced.size} with a call site, ` +
    `${registryOnly.size} declared in the registry only.`
);

if (registryOnly.size) {
  console.log(
    `\nNote: ${registryOnly.size} bucket(s) exist only in STORAGE_BUCKETS -- no migration creates` +
      '\nthem and nothing calls them:' +
      `\n  ${[...registryOnly.keys()].join(', ')}` +
      '\n  The admin storage screen renders a tab per registry entry, so it advertises these' +
      '\n  as real. Either create them or drop them from the record (US-643).'
  );
}

const undeclared = [...referenced].filter(([bucket]) => !declared.has(bucket));
const failures = undeclared.filter(([bucket]) => !PENDING.has(bucket));
const pending = undeclared.filter(([bucket]) => PENDING.has(bucket));

for (const [bucket, file] of pending) {
  console.log(`\nKnown gap: '${bucket}' (${file})\n  ${PENDING.get(bucket)}`);
}

// Advisory only, and weaker than it used to claim. This said the admin storage
// screen reads the table; it does not. StorageManagement.tsx:98 calls
// storageManager.getAllBuckets(), which returns the TS record. Nothing in src,
// app, functions or ios queries public.storage_buckets_config at all, so a
// phantom row here is dead data rather than a screen listing a bucket that does
// not exist. Kept because a seed disagreeing with the migrations is still worth
// seeing, and because the day something does read it the disagreement matters.
const configSeed = tracked.find((f) => f.endsWith('20260110000000_storage_analytics_features.sql'));
if (configSeed) {
  const sql = read(configSeed);
  const seed = sql.match(
    /insert\s+into\s+public\.storage_buckets_config[\s\S]*?values([\s\S]*?)on\s+conflict/i
  );
  const advertised = seed ? [...seed[1].matchAll(/\(\s*'([^']+)'/g)].map((m) => m[1]) : [];
  const phantom = advertised.filter((b) => !declared.has(b));
  if (phantom.length) {
    console.log(
      `\nNote: storage_buckets_config advertises ${phantom.length} bucket(s) that no migration creates:` +
        `\n  ${phantom.join(', ')}` +
        '\n  Nothing reads this table today, so these are dead rows rather than a broken screen.'
    );
  }
}

if (!failures.length) {
  console.log('\nEvery bucket the application uses is either declared or a known, tracked gap.');
  process.exit(0);
}

console.error(`\n${failures.length} bucket(s) used by code but created by no migration:\n`);
for (const [bucket, file] of failures) {
  console.error(`  '${bucket}'  first referenced in ${file}`);
}
console.error(
  '\nA dashboard-created bucket exists only in production: its public flag and RLS' +
    '\npolicies cannot be read from the repo, and a fresh environment comes up without' +
    '\nit. Add an INSERT INTO storage.buckets migration (with policies), or add the' +
    '\nbucket to PENDING in this file with the story that will.'
);
process.exit(1);
