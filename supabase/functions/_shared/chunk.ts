/**
 * Agentic OS — pure text chunker for RAG ingestion (US-481)
 *
 * Dependency-free so it is shared by the Deno agent-knowledge-ingest function
 * and the Node/Vitest unit tests. Splits long content into overlapping windows
 * (~1000 chars) so embeddings stay focused while preserving cross-boundary
 * context.
 */

export interface ChunkOptions {
  size?: number;
  overlap?: number;
}

const DEFAULT_SIZE = 1000;
const DEFAULT_OVERLAP = 100;

/**
 * Split `text` into overlapping chunks. Returns [] for empty input and a
 * single chunk when the text is shorter than `size`. `overlap` is clamped
 * below `size` so the window always advances (no infinite loop).
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const size = opts.size && opts.size > 0 ? opts.size : DEFAULT_SIZE;
  const rawOverlap = opts.overlap ?? DEFAULT_OVERLAP;
  const overlap = Math.max(0, Math.min(rawOverlap, size - 1));
  const step = size - overlap;

  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= size) return [trimmed];

  const chunks: string[] = [];
  for (let start = 0; start < trimmed.length; start += step) {
    const chunk = trimmed.slice(start, start + size).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (start + size >= trimmed.length) break;
  }
  return chunks;
}
