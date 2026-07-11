/**
 * Unit tests for the RAG answer agent decision logic (US-491).
 * Run with: `deno test functions/_shared/support-answer-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  retrievalConfident,
  decideAnswer,
  knowledgeUsed,
  replySubject,
  MIN_SIMILARITY,
  type KnowledgeMatch,
} from './support-answer-logic.ts';

const match = (similarity: number, id = 'k1'): KnowledgeMatch => ({
  id,
  title: `entry ${id}`,
  content: 'body',
  similarity,
});

Deno.test('retrievalConfident: needs a top match above the threshold', () => {
  assertEquals(retrievalConfident([]), false);
  assertEquals(retrievalConfident([match(MIN_SIMILARITY - 0.01)]), false);
  assertEquals(retrievalConfident([match(MIN_SIMILARITY)]), true);
  assertEquals(retrievalConfident([match(0.9)]), true);
});

Deno.test('decideAnswer: draft only when retrieval strong AND model confident', () => {
  assertEquals(decideAnswer([match(0.9)], 'high'), 'draft');
  assertEquals(decideAnswer([match(0.9)], 'medium'), 'draft');
  assertEquals(decideAnswer([match(0.9)], 'low'), 'escalate');
  assertEquals(decideAnswer([match(0.5)], 'high'), 'escalate');
  assertEquals(decideAnswer([], 'high'), 'escalate');
});

Deno.test('knowledgeUsed: id/title/rounded similarity', () => {
  assertEquals(knowledgeUsed([match(0.87654, 'a'), match(0.8, 'b')]), [
    { id: 'a', title: 'entry a', similarity: 0.877 },
    { id: 'b', title: 'entry b', similarity: 0.8 },
  ]);
});

Deno.test('replySubject: adds Re: once', () => {
  assertEquals(replySubject('How do I add a kid?'), 'Re: How do I add a kid?');
  assertEquals(replySubject('Re: existing thread'), 'Re: existing thread');
  assertEquals(replySubject('  RE: trimmed  '), 'RE: trimmed');
});
