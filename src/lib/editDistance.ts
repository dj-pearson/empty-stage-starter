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

/**
 * Optimal string alignment distance (US-692): Levenshtein plus adjacent
 * transposition as a single edit.
 *
 * Why this exists next to `levenshtein` rather than replacing it: swapping two
 * adjacent characters is the most common human typo, and classic Levenshtein
 * charges two edits for it. Because the item resolver scores similarity as
 * distance over string length, that made typo tolerance depend on how long the
 * item name happened to be:
 *
 *   "braest chicken" vs "breast chicken"  →  2/14 → 0.857  resolved
 *   "mikl whole"     vs "milk whole"      →  2/10 → 0.800  did not
 *
 * Same typo, opposite outcome, decided by a property of the word that has
 * nothing to do with whether the parent meant it. Counting the transposition
 * once gives 0.929 and 0.900, and the length dependence goes away.
 *
 * `levenshtein` keeps its exact behaviour because US-514's approval-feedback
 * scoring is calibrated against it, and a payload diff has no notion of a typo.
 *
 * This is OSA rather than unrestricted Damerau-Levenshtein: it does not allow a
 * substring to be edited between two transpositions. That case does not arise
 * in item names, and OSA needs only the two previous rows.
 */
export function osaDistance(a: string, b: string): number {
  const s = a.length > MAX_DIFF_CHARS ? a.slice(0, MAX_DIFF_CHARS) : a;
  const t = b.length > MAX_DIFF_CHARS ? b.slice(0, MAX_DIFF_CHARS) : b;
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  // Three rolling rows: two back is what a transposition reaches for.
  let twoBack = new Array<number>(t.length + 1).fill(0);
  let prev = new Array<number>(t.length + 1);
  let curr = new Array<number>(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let best = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        best = Math.min(best, twoBack[j - 2] + 1);
      }
      curr[j] = best;
    }
    [twoBack, prev, curr] = [prev, curr, twoBack];
  }
  return prev[t.length];
}
