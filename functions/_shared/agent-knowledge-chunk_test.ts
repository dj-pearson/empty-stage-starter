/**
 * Unit tests for the knowledge-base chunker (US-481).
 *
 * Run with: `deno test functions/_shared/agent-knowledge-chunk_test.ts`
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { chunkContent } from './agent-knowledge-chunk.ts';

Deno.test('chunkContent: empty / whitespace-only yields no chunks', () => {
  assertEquals(chunkContent(''), []);
  assertEquals(chunkContent('   \n\t  '), []);
});

Deno.test('chunkContent: short content is a single normalized chunk', () => {
  assertEquals(chunkContent('Hello   world\n\nhow are you'), ['Hello world how are you']);
});

Deno.test('chunkContent: long content splits into multiple chunks under maxChars', () => {
  const content = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
  const chunks = chunkContent(content, { maxChars: 100, overlap: 20 });
  assert(chunks.length > 1, 'expected multiple chunks');
  for (const c of chunks) {
    assert(c.length <= 100, `chunk exceeded maxChars: ${c.length}`);
    assert(c.length > 0, 'empty chunk emitted');
  }
});

Deno.test('chunkContent: never splits inside a word', () => {
  const content = Array.from({ length: 200 }, (_, i) => `token${i}`).join(' ');
  const chunks = chunkContent(content, { maxChars: 50, overlap: 10 });
  for (const c of chunks) {
    // Every whitespace-delimited piece must be an intact "token<n>".
    for (const piece of c.split(' ')) {
      assert(/^token\d+$/.test(piece), `split a word: "${piece}"`);
    }
  }
});

Deno.test('chunkContent: consecutive chunks overlap for context', () => {
  const content = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
  const chunks = chunkContent(content, { maxChars: 60, overlap: 20 });
  assert(chunks.length >= 2);
  // The start of chunk 2 should repeat some tail words of chunk 1.
  const firstWords = new Set(chunks[0].split(' '));
  const secondStart = chunks[1].split(' ').slice(0, 3);
  assert(secondStart.some((w) => firstWords.has(w)), 'expected overlap between chunks');
});

Deno.test('chunkContent: covers all words across chunks (no data loss)', () => {
  const words = Array.from({ length: 150 }, (_, i) => `x${i}`);
  const chunks = chunkContent(words.join(' '), { maxChars: 80, overlap: 15 });
  const seen = new Set(chunks.flatMap((c) => c.split(' ')));
  for (const w of words) assert(seen.has(w), `word missing from all chunks: ${w}`);
});
