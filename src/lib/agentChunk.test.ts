import { describe, it, expect } from 'vitest';

/** US-481: unit tests for the RAG text chunker (pure, shared with Deno). */
import { chunkText } from '../../supabase/functions/_shared/chunk';

describe('chunkText', () => {
  it('returns [] for empty/whitespace input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('returns a single chunk when shorter than size', () => {
    expect(chunkText('hello world', { size: 100 })).toEqual(['hello world']);
  });

  it('splits long text into overlapping windows that cover all content', () => {
    const text = 'abcdefghij'.repeat(30); // 300 chars
    const chunks = chunkText(text, { size: 100, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk is within the size bound.
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
    // Concatenating with overlap removed reconstructs the original length-wise:
    // step = 80, so starts at 0, 80, 160, 240 → 4 chunks.
    expect(chunks.length).toBe(4);
    expect(chunks[0]).toBe(text.slice(0, 100));
    expect(chunks[1]).toBe(text.slice(80, 180));
  });

  it('clamps overlap below size so it always advances', () => {
    const text = 'x'.repeat(50);
    // overlap >= size would be an infinite loop if not clamped.
    const chunks = chunkText(text, { size: 10, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.length <= 10)).toBe(true);
  });

  it('covers the tail of the text', () => {
    const text = Array.from({ length: 250 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('');
    const chunks = chunkText(text, { size: 100, overlap: 10 });
    const last = chunks[chunks.length - 1];
    expect(text.endsWith(last)).toBe(true);
  });
});
