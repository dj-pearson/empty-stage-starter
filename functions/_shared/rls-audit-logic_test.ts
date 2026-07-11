/**
 * Unit tests for the RLS-audit analysis (US-511).
 * Run with: `deno test functions/_shared/rls-audit-logic_test.ts`
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  analyzeRls,
  escalationTier,
  toSnapshot,
  diffSnapshots,
  type TableRls,
} from './rls-audit-logic.ts';

const table = (over: Partial<TableRls>): TableRls => ({
  schemaname: 'public',
  tablename: 'foo',
  rls_enabled: true,
  has_user_data: true,
  policies: [{ policyname: 'own', cmd: 'ALL', qual: 'auth.uid() = user_id', with_check: null, roles: ['authenticated'] }],
  ...over,
});

Deno.test('clean owner-scoped table produces no findings', () => {
  assertEquals(analyzeRls([table({})]), []);
});

Deno.test('RLS disabled on user-data table -> tier-3', () => {
  const f = analyzeRls([table({ tablename: 'foods', rls_enabled: false, has_user_data: true })]);
  assertEquals(f.length, 1);
  assertEquals(f[0].type, 'rls_disabled');
  assertEquals(f[0].table, 'public.foods');
  assert(f[0].userData);
  assertEquals(escalationTier(f), 3);
});

Deno.test('RLS disabled on non-user table -> tier-2', () => {
  const f = analyzeRls([table({ tablename: 'reference', rls_enabled: false, has_user_data: false })]);
  assertEquals(f[0].type, 'rls_disabled');
  assertEquals(f[0].userData, false);
  assertEquals(escalationTier(f), 2);
});

Deno.test('RLS enabled but no policies -> no_policies (tier-2)', () => {
  const f = analyzeRls([table({ tablename: 'locked', rls_enabled: true, policies: [] })]);
  assertEquals(f.length, 1);
  assertEquals(f[0].type, 'no_policies');
  assertEquals(escalationTier(f), 2);
});

Deno.test('USING (true) SELECT on user-data table -> overly_permissive', () => {
  const f = analyzeRls([
    table({
      tablename: 'kids',
      has_user_data: true,
      policies: [{ policyname: 'read_all', cmd: 'SELECT', qual: 'true', with_check: null, roles: ['authenticated'] }],
    }),
  ]);
  assertEquals(f.length, 1);
  assertEquals(f[0].type, 'overly_permissive');
  assertEquals(f[0].policies, ['read_all']);
});

Deno.test('USING (true) on a non-user table is allowed (public reference data)', () => {
  const f = analyzeRls([
    table({
      tablename: 'app_config',
      has_user_data: false,
      policies: [{ policyname: 'read_all', cmd: 'SELECT', qual: 'true', with_check: null, roles: ['anon'] }],
    }),
  ]);
  assertEquals(f, []);
});

Deno.test('INSERT USING(true) is not treated as a read leak', () => {
  const f = analyzeRls([
    table({
      tablename: 'events',
      has_user_data: true,
      policies: [
        { policyname: 'own_read', cmd: 'SELECT', qual: 'auth.uid() = user_id', with_check: null, roles: ['authenticated'] },
        { policyname: 'anyone_insert', cmd: 'INSERT', qual: null, with_check: 'true', roles: ['authenticated'] },
      ],
    }),
  ]);
  assertEquals(f, []);
});

Deno.test('escalationTier is null when clean', () => {
  assertEquals(escalationTier([]), null);
});

Deno.test('snapshot + diff highlights new tables and policies', () => {
  const prevTables = [table({ tablename: 'a' })];
  const curTables = [
    table({ tablename: 'a' }),
    table({ tablename: 'b', policies: [{ policyname: 'p1', cmd: 'ALL', qual: 'auth.uid() = user_id', with_check: null, roles: ['authenticated'] }] }),
  ];
  const diff = diffSnapshots(toSnapshot(prevTables), toSnapshot(curTables));
  assertEquals(diff.newTables, ['public.b']);
  assertEquals(diff.newPolicies, ['public.b::p1']);
  assertEquals(diff.removedTables, []);
});

Deno.test('diff against null snapshot treats everything as new', () => {
  const cur = toSnapshot([table({ tablename: 'a' })]);
  const diff = diffSnapshots(null, cur);
  assertEquals(diff.newTables, ['public.a']);
  assert(diff.newPolicies.length > 0);
});

Deno.test('removed tables/policies are reported', () => {
  const prev = toSnapshot([table({ tablename: 'a' }), table({ tablename: 'gone' })]);
  const cur = toSnapshot([table({ tablename: 'a' })]);
  const diff = diffSnapshots(prev, cur);
  assertEquals(diff.removedTables, ['public.gone']);
});
