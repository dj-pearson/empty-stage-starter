/**
 * Pure text-chunking for the knowledge-base ingest function (US-481).
 *
 * Separated from the edge function so the chunking is unit-testable without a
 * database, network, or embedding API. Content is split into ~1000-char chunks
 * with a small overlap so a passage that straddles a boundary still appears
 * whole in at least one chunk (better retrieval recall).
 *
 * Chunking is word-aware: it never splits inside a word, and it never emits an
 * empty chunk. Short content returns a single chunk.
 */

export interface ChunkOptions {
  /** Target maximum characters per chunk. */
  maxChars?: number;
  /** Characters of trailing context repeated at the start of the next chunk. */
  overlap?: number;
}

const DEFAULT_MAX_CHARS = 1000;
const DEFAULT_OVERLAP = 150;

/**
 * Split `content` into overlapping, word-aware chunks.
 *
 * - Content at or below `maxChars` returns a single trimmed chunk.
 * - Otherwise each chunk grows word by word up to `maxChars`, then the next
 *   chunk starts `overlap` characters back (snapped to a word boundary).
 */
export function chunkContent(content: string, options: ChunkOptions = {}): string[] {
  const maxChars = Math.max(1, options.maxChars ?? DEFAULT_MAX_CHARS);
  const overlap = Math.max(0, Math.min(options.overlap ?? DEFAULT_OVERLAP, maxChars - 1));

  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= maxChars) return [normalized];

  const words = normalized.split(' ');
  const chunks: string[] = [];
  let current = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = current.length === 0 ? word : `${current} ${word}`;

    if (candidate.length > maxChars && current.length > 0) {
      chunks.push(current);
      // Start the next chunk with the tail of this one for context overlap.
      current = overlap > 0 ? tailWords(current, overlap) : '';
      current = current.length === 0 ? word : `${current} ${word}`;
    } else {
      current = candidate;
    }
  }

  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks;
}

/** Return the trailing words of `text` totaling at most `maxChars` characters. */
function tailWords(text: string, maxChars: number): string {
  const words = text.split(' ');
  let tail = '';
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = tail.length === 0 ? words[i] : `${words[i]} ${tail}`;
    if (candidate.length > maxChars) break;
    tail = candidate;
  }
  return tail;
}
