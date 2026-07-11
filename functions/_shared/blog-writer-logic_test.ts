/**
 * Unit tests for blog writer logic (US-503).
 * Run with: `deno test functions/_shared/blog-writer-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { slugify, slugWithSuffix, readingTimeMinutes } from './blog-writer-logic.ts';

Deno.test('slugify: lowercases, strips punctuation, dashes spaces', () => {
  assertEquals(slugify('Food Chaining 101: A Parent’s Guide!'), 'food-chaining-101-a-parents-guide');
  assertEquals(slugify('  Multiple   spaces  '), 'multiple-spaces');
});

Deno.test('slugWithSuffix: appends short dash-free suffix', () => {
  assertEquals(slugWithSuffix('food-chaining', '3f2504e0-4f89'), 'food-chaining-3f2504');
  assertEquals(slugWithSuffix('', 'abcdef12'), 'post-abcdef');
});

Deno.test('readingTimeMinutes: ~200 wpm, min 1', () => {
  assertEquals(readingTimeMinutes('<p>one two three</p>'), 1);
  const long = '<p>' + Array.from({ length: 600 }, () => 'word').join(' ') + '</p>';
  assertEquals(readingTimeMinutes(long), 3);
});
