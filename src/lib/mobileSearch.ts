/**
 * Lightweight, dependency-free fuzzy/token search used by the mobile (Expo)
 * screens. Lives under `src/` so it is covered by the Vitest suite and the
 * `tsc -b` typecheck gate, but has **no** web-only dependencies (no React, no
 * DOM, no lucide) so Metro can safely bundle it into the native app via the
 * `@/lib/mobileSearch` alias.
 *
 * Replaces the naive `.toLowerCase().includes()` matching that was duplicated
 * across the mobile Recipes / Pantry / planner screens. Key wins over the old
 * approach:
 *  - token order independent — "chicken rice" matches "Rice with chicken"
 *  - diacritic insensitive — "jalapeno" matches "Jalapeño"
 *  - relevance ranked — exact / prefix / word-boundary hits sort above buried
 *    substring hits, and stronger fields (a recipe name) outweigh weaker ones.
 */

/** Lowercase, strip accents/diacritics, collapse whitespace. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Split a query/field into normalized whitespace-separated tokens. */
export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

export interface SearchField {
  value: string | null | undefined;
  /** Higher weight = this field contributes more to the score. Default 1. */
  weight?: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Score how well a single already-normalized field satisfies one token. */
function fieldTokenScore(text: string, token: string): number {
  if (!text) return 0;
  if (text === token) return 10;
  if (text.startsWith(token)) return 6;
  if (new RegExp(`\\b${escapeRegExp(token)}`).test(text)) return 4;
  if (text.includes(token)) return 2;
  return 0;
}

/**
 * Score a set of weighted fields against a query. Every query token must hit at
 * least one field, otherwise the match fails and 0 is returned. An empty query
 * returns 1 (neutral — "matches everything"). Higher scores are better matches.
 */
export function matchScore(query: string, fields: SearchField[]): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 1;

  const normFields = fields
    .map((f) => ({ text: normalizeText(f.value ?? ''), weight: f.weight ?? 1 }))
    .filter((f) => f.text.length > 0);
  if (normFields.length === 0) return 0;

  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const field of normFields) {
      best = Math.max(best, fieldTokenScore(field.text, token) * field.weight);
    }
    if (best === 0) return 0; // a required token matched nothing → overall miss
    total += best;
  }

  // Bonus when the full query appears contiguously in any field (phrase match).
  const phrase = normalizeText(query);
  for (const field of normFields) {
    if (field.text.includes(phrase)) {
      total += 2 * field.weight;
      break;
    }
  }
  return total;
}

/**
 * Filter and relevance-rank a list by `query` using a per-item field extractor.
 * With an empty query the original order is preserved (stable, no-op). Ties in
 * score keep the input order (stable sort by original index).
 */
export function searchRank<T>(
  items: T[],
  query: string,
  getFields: (item: T) => SearchField[]
): T[] {
  if (!query.trim()) return items;
  const scored: Array<{ item: T; score: number; idx: number }> = [];
  items.forEach((item, idx) => {
    const score = matchScore(query, getFields(item));
    if (score > 0) scored.push({ item, score, idx });
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.map((s) => s.item);
}
