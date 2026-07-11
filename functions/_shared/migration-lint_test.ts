/**
 * Unit tests for the migration linter (US-509).
 * Run with: `deno test functions/_shared/migration-lint_test.ts`
 *
 * Covers each forbidden pattern from the CLAUDE.md Migration Rules, plus safe
 * cases (additive) and dollar-quoted function bodies.
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { lintMigrationSql, splitStatements, hasViolations } from './migration-lint.ts';

const rules = (sql: string) => lintMigrationSql(sql).map((v) => v.rule).sort();

Deno.test('DROP TABLE / DROP COLUMN flagged', () => {
  assert(rules('DROP TABLE public.foo;').includes('drop_table'));
  assert(rules('ALTER TABLE public.foo DROP COLUMN bar;').includes('drop_column'));
});

Deno.test('RENAME flagged', () => {
  assert(rules('ALTER TABLE public.foo RENAME COLUMN a TO b;').includes('rename'));
  assert(rules('ALTER TABLE public.foo RENAME TO baz;').includes('rename'));
});

Deno.test('in-place type change flagged', () => {
  assert(rules('ALTER TABLE foo ALTER COLUMN a TYPE uuid USING a::uuid;').includes('type_change'));
});

Deno.test('SET NOT NULL flagged', () => {
  assert(rules('ALTER TABLE foo ALTER COLUMN a SET NOT NULL;').includes('set_not_null'));
});

Deno.test('ADD COLUMN NOT NULL without default flagged; with default safe', () => {
  assert(rules('ALTER TABLE foo ADD COLUMN a text NOT NULL;').includes('add_not_null_no_default'));
  assertEquals(rules('ALTER TABLE foo ADD COLUMN a text NOT NULL DEFAULT \'x\';').includes('add_not_null_no_default'), false);
});

Deno.test('enum change flagged', () => {
  assert(rules('DROP TYPE my_enum;').includes('enum_change'));
  assert(rules("ALTER TYPE my_enum RENAME VALUE 'a' TO 'b';").includes('enum_change'));
});

Deno.test('CHECK on existing table is a review candidate', () => {
  assert(rules("ALTER TABLE foo ADD CONSTRAINT c CHECK (x IN ('a','b'));").includes('check_constraint'));
});

Deno.test('safe additive migration: no violations', () => {
  const sql = `
    CREATE TABLE public.bar (id uuid primary key, name text);
    ALTER TABLE public.foo ADD COLUMN IF NOT EXISTS opt boolean NOT NULL DEFAULT false;
    CREATE INDEX idx ON public.bar(name);
  `;
  assertEquals(hasViolations(lintMigrationSql(sql)), false);
});

Deno.test('CREATE TABLE with a CHECK is not flagged (new table, not ALTER)', () => {
  assertEquals(
    lintMigrationSql("CREATE TABLE foo (status text CHECK (status IN ('a','b')));").length,
    0,
  );
});

Deno.test('dollar-quoted function body: internal semicolons do not break parsing', () => {
  const sql = `
    CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM 1; UPDATE t SET x = 1; RETURN NEW;
    END; $$;
    ALTER TABLE public.foo ADD COLUMN a text;
  `;
  const stmts = splitStatements(sql);
  // The whole function is one statement; the ALTER is another.
  assert(stmts.some((s) => s.includes('CREATE FUNCTION') && s.includes('RETURN NEW')));
  assertEquals(lintMigrationSql(sql).length, 0);
});
