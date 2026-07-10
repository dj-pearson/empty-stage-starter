/**
 * Unit tests for content calendar logic (US-502).
 * Run with: `deno test functions/_shared/content-calendar-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  normalizeTopic,
  dedupeProposals,
  seedKeywords,
  type ContentProposal,
} from './content-calendar-logic.ts';

const p = (topic: string, content_type: 'blog' | 'social' = 'blog'): ContentProposal => ({
  topic,
  content_type,
  keywords: [],
  rationale: '',
});

Deno.test('normalizeTopic: punctuation/case-insensitive', () => {
  assertEquals(normalizeTopic('Food Chaining 101!'), 'food chaining 101');
  assertEquals(normalizeTopic('food   chaining 101'), 'food chaining 101');
});

Deno.test('dedupeProposals: drops existing + intra-batch duplicates', () => {
  const existing = new Set([normalizeTopic('ARFID meal ideas')]);
  const out = dedupeProposals(
    [p('ARFID meal ideas'), p('Food chaining 101'), p('Food Chaining 101'), p('New topic')],
    existing,
  );
  assertEquals(out.map((x) => x.topic), ['Food chaining 101', 'New topic']);
});

Deno.test('dedupeProposals: empty topics dropped', () => {
  assertEquals(dedupeProposals([p('   ')], new Set()).length, 0);
});

Deno.test('seedKeywords: reads string array from autonomy_policy', () => {
  assertEquals(seedKeywords({ content_keywords: ['arfid', 'picky eating', 5] }), ['arfid', 'picky eating']);
  assertEquals(seedKeywords({}), []);
  assertEquals(seedKeywords(null), []);
});
