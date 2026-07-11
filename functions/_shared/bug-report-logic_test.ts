/**
 * Unit tests for the bug-report agent logic (US-493).
 * Run with: `deno test functions/_shared/bug-report-logic_test.ts`
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeTitle, isDuplicateFingerprint, buildIssueBody } from './bug-report-logic.ts';

Deno.test('normalizeTitle: punctuation/case/prefix-insensitive fingerprint', () => {
  const a = normalizeTitle('App crashes on login!');
  const b = normalizeTitle('app crashes on login');
  const c = normalizeTitle('[BUG] App   crashes on login.');
  const d = normalizeTitle('Bug: app crashes on login');
  assertEquals(a, 'app crashes on login');
  assertEquals(a, b);
  assertEquals(a, c);
  assertEquals(a, d);
});

Deno.test('normalizeTitle: different problems differ', () => {
  assert(normalizeTitle('Login crash') !== normalizeTitle('Grocery list empty'));
});

Deno.test('isDuplicateFingerprint', () => {
  assertEquals(isDuplicateFingerprint('a b c', ['x y', 'a b c']), true);
  assertEquals(isDuplicateFingerprint('a b c', ['x y']), false);
  assertEquals(isDuplicateFingerprint('a b c', []), false);
});

Deno.test('buildIssueBody: includes all sections + ticket reference', () => {
  const body = buildIssueBody(
    {
      title: 'Crash on login',
      repro_steps: '1. open app\n2. tap login',
      expected: 'dashboard loads',
      actual: 'white screen',
      device_platform: 'iOS 18 / iPhone 14',
      severity: 'high',
    },
    'T-ABC12345',
  );
  assert(body.includes('Steps to reproduce'));
  assert(body.includes('tap login'));
  assert(body.includes('dashboard loads'));
  assert(body.includes('white screen'));
  assert(body.includes('iOS 18'));
  assert(body.includes('**Severity:** high'));
  assert(body.includes('T-ABC12345'));
});

Deno.test('buildIssueBody: omits device section when absent, marks missing fields', () => {
  const body = buildIssueBody(
    { title: 't', repro_steps: '', expected: '', actual: 'boom', severity: 'low' },
    'T-1',
  );
  assert(!body.includes('Device / platform'));
  assert(body.includes('_Not provided_'));
});
