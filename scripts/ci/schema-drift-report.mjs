#!/usr/bin/env node
/**
 * US-654: assert what production actually looks like before the kitchen-loop
 * ledger is stacked on top of it.
 *
 * The design doc's prerequisite is blunt: a ledger cannot land on a database
 * whose current state cannot be asserted, and the project's own notes record
 * that production is behind its migrations. This script is the gate.
 *
 * It works in two halves, because the honest answer needs both.
 *
 * The repo half always runs. It reads supabase/migrations/*.sql and builds the
 * schema those migrations describe for the tables this epic touches. That half
 * needs no credentials and no network, matching every other script in this
 * directory (check-storage-buckets.mjs, check-migration-safety.sh) which are
 * all static analysis over tracked files.
 *
 * The live half runs only when a snapshot is supplied. It does NOT connect to
 * production on its own -- deliberately. This repo has no `pg` dependency, the
 * database is self-hosted, and the one thing worse than not knowing prod's
 * shape is a CI script holding a service-role credential in order to find out.
 * Instead it prints the exact read-only SQL to run, and diffs the JSON that
 * query returns:
 *
 *   node scripts/ci/schema-drift-report.mjs --emit-sql > introspect.sql
 *   # run introspect.sql against the target, save the JSON result
 *   SCHEMA_SNAPSHOT=./snapshot.json node scripts/ci/schema-drift-report.mjs
 *
 * With no snapshot configured it reports the repo-side expectation and exits 0,
 * so it is safe to run in CI on every commit.
 *
 * Exit codes: 0 = no drift (or nothing to compare), 1 = drift found.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

/**
 * The tables the kitchen-loop epic reads or writes. Drift anywhere else in the
 * database is somebody else's problem; drift here blocks US-655 onward.
 */
const TRACKED_TABLES = [
  'foods',
  'grocery_items',
  'grocery_item_sources',
  'plan_entries',
  'recipes',
  'recipe_ingredients',
  'kid_food_ladder',
  'kids',
  'food_attempts',
];

const args = new Set(process.argv.slice(2));

// ---------------------------------------------------------------------------
// The read-only introspection query.
// ---------------------------------------------------------------------------

const INTROSPECT_SQL = `-- US-654 schema snapshot. Read-only: SELECT only, no DDL, no writes.
-- Run against the target and save the single JSON value as snapshot.json.
select json_build_object(
  'migrations', coalesce((
    select json_agg(version order by version)
    from supabase_migrations.schema_migrations
  ), '[]'::json),
  'columns', coalesce((
    select json_agg(json_build_object(
      'table', table_name,
      'column', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by table_name, column_name)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (${TRACKED_TABLES.map((t) => `'${t}'`).join(', ')})
  ), '[]'::json)
);
`;

if (args.has('--emit-sql')) {
  process.stdout.write(INTROSPECT_SQL);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Repo half: what the migrations on disk describe.
// ---------------------------------------------------------------------------

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const migrationFiles = tracked
  .filter((f) => f.startsWith('supabase/migrations/') && f.endsWith('.sql'))
  .sort();

/** Migration version = the leading timestamp of the filename. */
const versionOf = (path) => {
  const base = path.split('/').pop() ?? '';
  const match = base.match(/^(\d+)/);
  return match ? match[1] : null;
};

const repoMigrations = migrationFiles.map(versionOf).filter(Boolean);

const read = (f) => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};

/**
 * Columns the migrations add to the tracked tables.
 *
 * This is a text scan, not a SQL parser, and it is only ever used to describe
 * what the repo expects -- never to assert that production is fine. It catches
 * `create table` bodies and `alter table ... add column`, which is the shape
 * every migration in this repo actually uses.
 */
const repoColumns = new Map(TRACKED_TABLES.map((t) => [t, new Map()]));

const noteColumn = (table, column, origin) => {
  const bucket = repoColumns.get(table);
  if (!bucket || !column) return;
  if (!bucket.has(column)) bucket.set(column, origin);
};

for (const file of migrationFiles) {
  const sql = read(file);
  if (!sql) continue;

  for (const table of TRACKED_TABLES) {
    // alter table public.foods add column [if not exists] merged_into_id uuid ...
    const alters = sql.matchAll(
      new RegExp(
        `alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\.)?${table}\\s+add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?"?([a-z0-9_]+)"?`,
        'gi'
      )
    );
    for (const m of alters) noteColumn(table, m[1].toLowerCase(), file);

    // create table public.foods ( id uuid primary key, name text not null, ... );
    const creates = sql.matchAll(
      new RegExp(
        `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\)\\s*;`,
        'gi'
      )
    );
    for (const create of creates) {
      for (const rawLine of create[1].split('\n')) {
        const line = rawLine.trim().replace(/,$/, '');
        if (!line || line.startsWith('--')) continue;
        // Skip table-level constraints, which are not columns.
        if (
          /^(primary|foreign|unique|check|constraint|exclude|like)\b/i.test(line)
        ) {
          continue;
        }
        const m = line.match(/^"?([a-z0-9_]+)"?\s+\S/i);
        if (m) noteColumn(table, m[1].toLowerCase(), create.input ? file : file);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Live half: compare against a supplied snapshot, if there is one.
// ---------------------------------------------------------------------------

const snapshotPath = process.env.SCHEMA_SNAPSHOT;

const summary = [];
const push = (line) => summary.push(line);

push('US-654 schema drift report');
push('='.repeat(58));
push(`Migrations on disk: ${repoMigrations.length}`);
for (const table of TRACKED_TABLES) {
  const cols = repoColumns.get(table);
  push(`  ${table}: ${cols.size} columns described by migrations`);
}

if (!snapshotPath) {
  push('');
  push('No target configured (SCHEMA_SNAPSHOT unset).');
  push('Repo-side expectation reported above; nothing compared.');
  push('');
  push('To compare against a real database:');
  push('  node scripts/ci/schema-drift-report.mjs --emit-sql > introspect.sql');
  push('  # run introspect.sql read-only against the target, save the JSON');
  push('  SCHEMA_SNAPSHOT=./snapshot.json node scripts/ci/schema-drift-report.mjs');
  process.stdout.write(summary.join('\n') + '\n');
  process.exit(0);
}

if (!existsSync(snapshotPath)) {
  process.stderr.write(
    `SCHEMA_SNAPSHOT points at ${snapshotPath}, which does not exist.\n`
  );
  process.exit(1);
}

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
} catch (err) {
  process.stderr.write(`Could not parse ${snapshotPath}: ${err.message}\n`);
  process.exit(1);
}

const liveMigrations = new Set(
  (snapshot.migrations ?? []).map((v) => String(v))
);
const liveColumns = new Map(TRACKED_TABLES.map((t) => [t, new Set()]));
for (const row of snapshot.columns ?? []) {
  const bucket = liveColumns.get(row.table);
  if (bucket) bucket.add(String(row.column).toLowerCase());
}

const missingOnTarget = repoMigrations.filter((v) => !liveMigrations.has(v));
const unknownToRepo = [...liveMigrations].filter(
  (v) => !repoMigrations.includes(v)
);

let drift = false;

push('');
push('Migration ledger');
push('-'.repeat(58));
if (missingOnTarget.length) {
  drift = true;
  push(`${missingOnTarget.length} migration(s) on disk have NOT been applied:`);
  for (const v of missingOnTarget) {
    const file = migrationFiles.find((f) => versionOf(f) === v);
    push(`  ${v}  ${file ?? ''}`);
  }
} else {
  push('Every migration on disk has been applied.');
}
if (unknownToRepo.length) {
  drift = true;
  push('');
  push(
    `${unknownToRepo.length} migration(s) applied to the target are not in the repo:`
  );
  for (const v of unknownToRepo) push(`  ${v}`);
  push('  (someone applied SQL by hand; the repo cannot reproduce this database)');
}

push('');
push('Column drift on kitchen-loop tables');
push('-'.repeat(58));
let columnDrift = 0;
for (const table of TRACKED_TABLES) {
  const expected = repoColumns.get(table);
  const actual = liveColumns.get(table);
  if (!actual || actual.size === 0) {
    drift = true;
    columnDrift += 1;
    push(`  ${table}: MISSING from the target entirely`);
    continue;
  }
  const missing = [...expected.keys()].filter((c) => !actual.has(c));
  const extra = [...actual].filter((c) => !expected.has(c));
  if (!missing.length && !extra.length) continue;
  columnDrift += 1;
  drift = true;
  push(`  ${table}:`);
  for (const c of missing) {
    push(`    missing on target: ${c}  (added by ${expected.get(c)})`);
  }
  for (const c of extra) {
    push(`    present on target but no migration adds it: ${c}`);
  }
}
if (columnDrift === 0) {
  push('  No column drift on any tracked table.');
}

push('');
push('='.repeat(58));
push(
  drift
    ? 'DRIFT FOUND. Resolve before starting US-655; the ledger cannot be stacked on an unasserted schema.'
    : 'No drift. Safe to proceed with US-655.'
);

process.stdout.write(summary.join('\n') + '\n');
process.exit(drift ? 1 : 0);
