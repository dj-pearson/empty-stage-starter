/**
 * Unit tests for support lifecycle logic (US-494).
 * Run with: `deno test functions/_shared/support-status-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canTransition, withTicketToken, parseTicketToken } from './support-status-logic.ts';

Deno.test('canTransition: legal forward transitions', () => {
  assertEquals(canTransition('new', 'triaged'), true);
  assertEquals(canTransition('triaged', 'awaiting_reply'), true);
  assertEquals(canTransition('awaiting_reply', 'awaiting_user'), true);
  assertEquals(canTransition('awaiting_user', 'new'), true); // user replied -> re-triage
  assertEquals(canTransition('resolved', 'new'), true); // reopen
  assertEquals(canTransition('triaged', 'resolved'), true);
});

Deno.test('canTransition: no-op is allowed', () => {
  assertEquals(canTransition('triaged', 'triaged'), true);
});

Deno.test('canTransition: illegal transitions rejected', () => {
  assertEquals(canTransition('new', 'awaiting_user'), false);
  assertEquals(canTransition('resolved', 'awaiting_reply'), false);
  assertEquals(canTransition('awaiting_reply', 'triaged'), false);
  assertEquals(canTransition('bogus', 'new'), false);
});

Deno.test('ticket token: embed once and round-trip', () => {
  const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const s1 = withTicketToken('Re: your question', id);
  assertEquals(s1, 'Re: your question [EPT-3f2504e0-4f89-41d3-9a0c-0305e82c3301]');
  assertEquals(parseTicketToken(s1), id);
  // Idempotent: does not double-append.
  assertEquals(withTicketToken(s1, id), s1);
});

Deno.test('parseTicketToken: none present -> null', () => {
  assertEquals(parseTicketToken('Just a normal subject'), null);
});

Deno.test('parseTicketToken: case-insensitive uuid', () => {
  const id = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';
  assertEquals(parseTicketToken(`Reply [EPT-${id}]`), id.toLowerCase());
});
