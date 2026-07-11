/**
 * Unit tests for CSAT logic (US-495).
 * Run with: `deno test functions/_shared/csat-logic_test.ts`
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  signCsatToken,
  verifyCsatToken,
  scoreEscalates,
  isValidScore,
  ratingLinks,
  buildCsatEmail,
} from './csat-logic.ts';

const SECRET = 'test-secret';
const TICKET = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

Deno.test('token round-trips', async () => {
  const token = await signCsatToken(TICKET, SECRET);
  assertEquals(await verifyCsatToken(token, SECRET), TICKET);
});

Deno.test('token rejects a wrong secret', async () => {
  const token = await signCsatToken(TICKET, SECRET);
  assertEquals(await verifyCsatToken(token, 'other-secret'), null);
});

Deno.test('token rejects tampering', async () => {
  const token = await signCsatToken(TICKET, SECRET);
  const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
  assertEquals(await verifyCsatToken(tampered, SECRET), null);
  assertEquals(await verifyCsatToken('garbage', SECRET), null);
});

Deno.test('scoreEscalates: 1 and 2 only', () => {
  assertEquals(scoreEscalates(1), true);
  assertEquals(scoreEscalates(2), true);
  assertEquals(scoreEscalates(3), false);
  assertEquals(scoreEscalates(5), false);
});

Deno.test('isValidScore: integers 1..5', () => {
  assertEquals(isValidScore(1), true);
  assertEquals(isValidScore(5), true);
  assertEquals(isValidScore(0), false);
  assertEquals(isValidScore(6), false);
  assertEquals(isValidScore(3.5), false);
});

Deno.test('ratingLinks: five links with score + token', () => {
  const links = ratingLinks('https://tryeatpal.com/', 'tok');
  assertEquals(links.length, 5);
  assertEquals(links[0].score, 1);
  assert(links[4].url.includes('score=5'));
  assert(links[0].url.includes('t=tok'));
});

Deno.test('buildCsatEmail: five buttons + subject', () => {
  const email = buildCsatEmail('Billing question', ratingLinks('https://x.co', 'tok'));
  assert(email.subject.includes('Billing question'));
  assert((email.html.match(/<a /g) ?? []).length === 5);
});
