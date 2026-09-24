/**
 * Item 16: which unchecked grocery row each receipt line pays for.
 *
 * Receipts abbreviate and decorate ("ORG WHL MILK 1GAL", "BANANAS LB"), and a
 * list says what a parent typed ("milk", "banana"). So this matches on tokens
 * rather than whole strings: noise words and sizes are dropped, plurals are
 * folded, and a token of four letters or more matches another it is a prefix
 * of ("banan" / "bananas"). A line and a row match when every token of one is
 * found in the other.
 *
 * Each row is paid for by at most one line and each line pays for at most one
 * row, assigned best score first, then in receipt order. Nothing here is final:
 * the review sheet shows every pairing and lets the parent change it.
 */

import type { GroceryItem } from '@/types';

/** Words that say how a thing was sold, not what it is. */
const NOISE = new Set([
  'org',
  'organic',
  'fresh',
  'lb',
  'lbs',
  'oz',
  'ct',
  'ea',
  'each',
  'pk',
  'pack',
  'gal',
  'gallon',
  'qt',
  'pt',
  'kg',
  'g',
  'ml',
  'l',
  'the',
  'of',
  'and',
  'with',
]);

function singular(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && /(ches|shes|xes|oes)$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/** The words of a name that identify the food, lowercased and singular. */
export function receiptTokens(name: string | null | undefined): string[] {
  const words = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // "1gal", "12oz", "2" and friends are sizes, not food.
    .filter((w) => !/^\d/.test(w))
    .filter((w) => !NOISE.has(w))
    .map(singular);
  return [...new Set(words)];
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** Every token of `inner` has a partner in `outer`. */
function covered(inner: readonly string[], outer: readonly string[]): boolean {
  return inner.length > 0 && inner.every((t) => outer.some((o) => tokenMatches(t, o)));
}

/**
 * 3 for the same words, 2 when one side's words are all in the other, 0 when
 * they do not match. Exported for the tests.
 */
export function receiptMatchScore(lineName: string, rowName: string): number {
  const a = receiptTokens(lineName);
  const b = receiptTokens(rowName);
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length === b.length && covered(a, b) && covered(b, a)) return 3;
  if (covered(a, b) || covered(b, a)) return 2;
  return 0;
}

export interface ReceiptLineRef {
  uid: string;
  parsedName: string;
}

/**
 * Pair receipt lines with unchecked rows. Returns line uid -> grocery row id
 * for the lines that found one. Checked rows are ignored: they are already in
 * the cart, and a receipt line cannot check them off again.
 */
export function matchReceiptLinesToList(
  lines: readonly ReceiptLineRef[],
  rows: readonly GroceryItem[],
): Map<string, string> {
  const open = rows.filter((r) => !r.checked);
  const candidates: { uid: string; rowId: string; score: number; line: number; row: number }[] = [];
  lines.forEach((line, li) => {
    open.forEach((row, ri) => {
      const score = receiptMatchScore(line.parsedName, row.name);
      if (score > 0) candidates.push({ uid: line.uid, rowId: row.id, score, line: li, row: ri });
    });
  });
  candidates.sort((x, y) => y.score - x.score || x.line - y.line || x.row - y.row);
  const byLine = new Map<string, string>();
  const takenRows = new Set<string>();
  for (const c of candidates) {
    if (byLine.has(c.uid) || takenRows.has(c.rowId)) continue;
    byLine.set(c.uid, c.rowId);
    takenRows.add(c.rowId);
  }
  return byLine;
}
