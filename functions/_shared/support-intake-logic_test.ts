/**
 * Unit tests for support intake helpers (US-489).
 * Run with: `deno test functions/_shared/support-intake-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ticketReference,
  rateLimitWindowStart,
  isRateLimited,
  INTAKE_MAX_PER_WINDOW,
} from './support-intake-logic.ts';

Deno.test('ticketReference: uppercase, dash-free, 8 chars', () => {
  assertEquals(ticketReference('3f2504e0-4f89-41d3-9a0c-0305e82c3301'), 'T-3F2504E0');
});

Deno.test('rateLimitWindowStart: subtracts the window', () => {
  assertEquals(
    rateLimitWindowStart(new Date('2026-07-10T12:00:00Z'), 60),
    '2026-07-10T11:00:00.000Z',
  );
});

Deno.test('isRateLimited: blocks at or above the cap', () => {
  assertEquals(isRateLimited(0), false);
  assertEquals(isRateLimited(INTAKE_MAX_PER_WINDOW - 1), false);
  assertEquals(isRateLimited(INTAKE_MAX_PER_WINDOW), true);
  assertEquals(isRateLimited(INTAKE_MAX_PER_WINDOW + 3), true);
});
