/**
 * Unit tests for Sentry triage logic (US-506).
 * Run with: `deno test functions/_shared/sentry-triage-logic_test.ts`
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  sentryFingerprint,
  isCrashRateSpike,
  crashSpikeThreshold,
  buildIssueTitle,
  buildIssueBody,
} from './sentry-triage-logic.ts';

Deno.test('sentryFingerprint: prefers fingerprint, then culprit, then title', () => {
  assertEquals(sentryFingerprint({ fingerprint: ['A', 'B'], culprit: 'c', title: 't' }), 'a:b');
  assertEquals(sentryFingerprint({ culprit: 'Foo.bar', title: 't' }), 'foo.bar');
  assertEquals(sentryFingerprint({ title: 'Boom Happened' }), 'boom happened');
  assertEquals(sentryFingerprint({}), 'unknown');
});

Deno.test('isCrashRateSpike: at/over threshold', () => {
  assertEquals(isCrashRateSpike(150, 100), true);
  assertEquals(isCrashRateSpike(100, 100), true);
  assertEquals(isCrashRateSpike(99, 100), false);
  assertEquals(isCrashRateSpike(null, 100), false);
});

Deno.test('crashSpikeThreshold: from config or default 100', () => {
  assertEquals(crashSpikeThreshold({ crash_spike_threshold: 50 }), 50);
  assertEquals(crashSpikeThreshold({}), 100);
  assertEquals(crashSpikeThreshold(null), 100);
  assertEquals(crashSpikeThreshold({ crash_spike_threshold: -5 }), 100);
});

Deno.test('buildIssueTitle: prefixed + truncated', () => {
  assert(buildIssueTitle({ title: 'TypeError: x is undefined' }).startsWith('[sentry] TypeError'));
});

Deno.test('buildIssueBody: includes stack, release, route, count, assessment', () => {
  const body = buildIssueBody(
    { release: 'ios/v1.2.3', route: '/planner', count: 42, stack: 'at foo()\nat bar()' },
    { severity: 'high', user_impact: 'blocks plan creation' },
  );
  assert(body.includes('ios/v1.2.3'));
  assert(body.includes('/planner'));
  assert(body.includes('42'));
  assert(body.includes('at foo()'));
  assert(body.includes('high'));
  assert(body.includes('blocks plan creation'));
});
