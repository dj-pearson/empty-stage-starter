/**
 * Unit tests for social writer logic (US-504).
 * Run with: `deno test functions/_shared/social-writer-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  networksUnderCap,
  tallyNetworks,
  SOCIAL_NETWORKS,
  PER_NETWORK_DAILY_CAP,
} from './social-writer-logic.ts';

Deno.test('tallyNetworks: counts per network across approvals', () => {
  assertEquals(
    tallyNetworks([['instagram', 'pinterest'], ['instagram']]),
    { instagram: 2, pinterest: 1 },
  );
  assertEquals(tallyNetworks([]), {});
});

Deno.test('networksUnderCap: excludes networks at/over the cap', () => {
  assertEquals(networksUnderCap(SOCIAL_NETWORKS, {}), ['instagram', 'pinterest']);
  assertEquals(networksUnderCap(SOCIAL_NETWORKS, { instagram: 1 }), ['pinterest']);
  assertEquals(networksUnderCap(SOCIAL_NETWORKS, { instagram: 1, pinterest: 1 }), []);
});

Deno.test('networksUnderCap: respects a custom cap', () => {
  assertEquals(networksUnderCap(SOCIAL_NETWORKS, { instagram: 1 }, 2), ['instagram', 'pinterest']);
});

Deno.test('cap constant is 1', () => {
  assertEquals(PER_NETWORK_DAILY_CAP, 1);
});
