/**
 * Dependency-free edit-distance helpers for approval feedback (US-514).
 *
 * Kept separate from agentFeedback.ts (which imports the Supabase client) so the
 * math is unit-testable in isolation.
 */

/** Cap the strings we diff so a huge payload can't stall the browser (O(n*m)). */
export const MAX_DIFF_CHARS = 4000;

/** Classic Levenshtein edit distance, bounded by MAX_DIFF_CHARS per side. */
export function levenshtein(a: string, b: string): number {
  const s = a.length > MAX_DIFF_CHARS ? a.slice(0, MAX_DIFF_CHARS) : a;
  const t = b.length > MAX_DIFF_CHARS ? b.slice(0, MAX_DIFF_CHARS) : b;
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  let prev = new Array<number>(t.length + 1);
  let curr = new Array<number>(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[t.length];
}

/** Edit distance between two payloads, compared as canonical JSON strings. */
export function payloadEditDistance(original: unknown, edited: unknown): number {
  return levenshtein(JSON.stringify(original ?? {}), JSON.stringify(edited ?? {}));
}
