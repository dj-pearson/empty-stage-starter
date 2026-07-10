/**
 * Unit tests for win-back logic (US-500).
 * Run with: `deno test functions/_shared/winback-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  winbackFrequencyBlocked,
  becameActiveSince,
  WINBACK_FREQUENCY_DAYS,
} from './winback-logic.ts';

const NOW = new Date('2026-07-10T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

Deno.test('winbackFrequencyBlocked: within 30 days blocks, older allows', () => {
  assertEquals(winbackFrequencyBlocked(daysAgo(5), NOW), true);
  assertEquals(winbackFrequencyBlocked(daysAgo(WINBACK_FREQUENCY_DAYS - 1), NOW), true);
  assertEquals(winbackFrequencyBlocked(daysAgo(31), NOW), false);
  assertEquals(winbackFrequencyBlocked(daysAgo(WINBACK_FREQUENCY_DAYS), NOW), false); // exactly 30 -> allowed
});

Deno.test('winbackFrequencyBlocked: never sent -> not blocked', () => {
  assertEquals(winbackFrequencyBlocked(null, NOW), false);
});

Deno.test('becameActiveSince: activity after enrollment counts', () => {
  const enrolled = daysAgo(10);
  assertEquals(becameActiveSince(enrolled, [daysAgo(3)]), true); // 3 days ago > enrolled 10 days ago
  assertEquals(becameActiveSince(enrolled, [daysAgo(20), null]), false); // all before enrollment
  assertEquals(becameActiveSince(enrolled, []), false);
});
