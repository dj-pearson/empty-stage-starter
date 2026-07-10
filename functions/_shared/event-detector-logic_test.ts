/**
 * Unit tests for the lifecycle event detector logic (US-496).
 * Run with: `deno test functions/_shared/event-detector-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  missingOnceEvents,
  inactivityEventsToEmit,
  daysSince,
  type PriorEvent,
} from './event-detector-logic.ts';

const NOW = new Date('2026-07-10T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

Deno.test('daysSince', () => {
  assertEquals(Math.round(daysSince(daysAgo(10), NOW)), 10);
});

Deno.test('missingOnceEvents: filters to once-only not already present', () => {
  assertEquals(
    missingOnceEvents(['signup', 'first_kid_added', 'inactive_7d'], new Set(['signup'])),
    ['first_kid_added'], // signup present; inactive_7d is not once-only
  );
});

Deno.test('inactivity: 40 days inactive, no prior -> all three', () => {
  assertEquals(inactivityEventsToEmit(daysAgo(40), NOW, []), [
    'inactive_7d',
    'inactive_14d',
    'inactive_30d',
  ]);
});

Deno.test('inactivity: under 7 days -> none', () => {
  assertEquals(inactivityEventsToEmit(daysAgo(3), NOW, []), []);
});

Deno.test('inactivity: 20 days inactive -> 7d + 14d only', () => {
  assertEquals(inactivityEventsToEmit(daysAgo(20), NOW, []), ['inactive_7d', 'inactive_14d']);
});

Deno.test('inactivity: prior event AFTER last-active suppresses re-fire', () => {
  const prior: PriorEvent[] = [{ event_type: 'inactive_7d', created_at: daysAgo(2) }];
  // last active 20 days ago; the 7d event already fired 2 days ago (since active) -> suppressed
  assertEquals(inactivityEventsToEmit(daysAgo(20), NOW, prior), ['inactive_14d']);
});

Deno.test('inactivity: prior event BEFORE last-active re-arms (fires again)', () => {
  // The user lapsed, got a 7d event 100 days ago, then became active 20 days ago,
  // then lapsed again — the old event is before last-active, so 7d re-fires.
  const prior: PriorEvent[] = [{ event_type: 'inactive_7d', created_at: daysAgo(100) }];
  assertEquals(inactivityEventsToEmit(daysAgo(20), NOW, prior), ['inactive_7d', 'inactive_14d']);
});
