/**
 * US-659: decide which item a raw string refers to, or say honestly that
 * nobody knows yet.
 *
 * This is the single place resolution happens. Today it happens repeatedly,
 * downstream, silently, in four different matchers, at moments when the parent
 * has no idea a decision is being made for them: moveCheckedToPantry compares
 * lowercased names, GroceryGeneratorService de-duplicates on its own key,
 * ShortfallCalculator goes through IngredientNameMatcher, PantryDedup exists
 * because none of them agree. The design's fix is to resolve ONCE, at the
 * boundary, with the parent present.
 *
 * The rule that matters most: below the confidence threshold it does not
 * guess. It returns a provisional result, and the app asks one quiet question
 * later rather than silently creating a third "chicken breast".
 *
 * Pure by construction. Every lookup table is passed in as context; nothing is
 * fetched here, so it runs identically in a test, in the browser, and inside
 * the recipe-import sheet. Behaviour is pinned by fixtures the Swift mirror
 * reads too (US-660).
 *
 * Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md
 */

import { osaDistance } from '@/lib/editDistance';
import { normalizeItemText } from '@/lib/itemNormalize';

/**
 * Minimum similarity for a fuzzy alias match to be accepted without asking.
 *
 * 0.82 keeps "chiken breast" (a typo) matching "chicken breast" while leaving
 * "chicken thigh" below the line, where it belongs -- those are different
 * purchases. Exported rather than inlined so it is tunable in one place and
 * assertable in tests, per US-659.
 */
export const FUZZY_CONFIDENCE_THRESHOLD = 0.82;

/** Guard against a cycle in merged_into_id rather than looping forever. */
const MAX_MERGE_HOPS = 16;

/** Which rule produced a resolution. Lets callers and tests assert the path,
 *  not just the answer. */
export type MatchedBy =
  | 'barcode'
  | 'alias_exact'
  | 'alias_fuzzy'
  | 'canonical_product'
  | 'none';

/** The item-side fields the resolver reads. A subset of `foods`. */
export interface ResolverItem {
  id: string;
  name: string;
  barcode?: string | null;
  /** Set when this row was merged into a survivor (US-656). */
  merged_into_id?: string | null;
}

/** A row of `item_aliases`. */
export interface ResolverAlias {
  item_id: string;
  normalized_text: string;
  /** 1.0 for barcode or explicit confirmation, lower for fuzzy/AI-suggested. */
  confidence?: number | null;
}

/** A row of the shared `canonical_products` seed. */
export interface ResolverCanonicalProduct {
  barcode?: string | null;
  normalized_name: string;
  category?: string | null;
  default_unit?: string | null;
  default_aisle?: string | null;
}

export interface ResolveInput {
  text: string;
  barcode?: string | null;
  householdId: string;
}

/**
 * Everything the resolver is allowed to look at. Callers scope `items` and
 * `aliases` to the household before passing them; the resolver does not filter,
 * because a resolver that silently ignores rows is a resolver you cannot test.
 */
export interface ResolveContext {
  items: ResolverItem[];
  aliases: ResolverAlias[];
  canonicalProducts?: ResolverCanonicalProduct[];
}

export interface ResolvedItem {
  itemId: string;
  confidence: number;
  matchedBy: Exclude<MatchedBy, 'none' | 'canonical_product'>;
}

export interface ProvisionalItem {
  provisional: true;
  /**
   * What to call the new item, in the parent's words. Deliberately the cleaned
   * ORIGINAL text, not the normalized token soup: nobody wants a pantry row
   * called "breast chicken".
   */
  proposedName: string;
  confidence: number;
  /** 'canonical_product' when the seed recognised it, 'none' when nothing did. */
  matchedBy: 'canonical_product' | 'none';
  /** Defaults for the row about to be created, when the seed knew them. */
  seed?: {
    category?: string | null;
    defaultUnit?: string | null;
    defaultAisle?: string | null;
    barcode?: string | null;
  };
}

export type ResolveResult = ResolvedItem | ProvisionalItem;

/** Narrowing helper so callers do not test for the `provisional` key by hand. */
export function isProvisional(r: ResolveResult): r is ProvisionalItem {
  return (r as ProvisionalItem).provisional === true;
}

/**
 * Similarity in [0,1] from edit distance over the longer string.
 *
 * Uses optimal string alignment (US-692) rather than plain Levenshtein, so a
 * swapped pair of adjacent letters costs one edit instead of two. With the
 * classic metric, whether a typo was forgiven depended on how long the item
 * name happened to be: "braest chicken" scored 0.857 and resolved while the
 * identical mistake in "mikl whole" scored 0.800 and did not.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return Math.max(0, (longest - osaDistance(a, b)) / longest);
}

function normaliseBarcode(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

/**
 * Follow `merged_into_id` to the surviving item.
 *
 * Merging redirects rather than deletes (US-656), so a stale id held by an
 * older client still resolves. Without this, resolution would happily return a
 * row that has been folded into another and the caller would debit the wrong
 * stock.
 */
export function resolveMergeRedirect(itemId: string, items: ResolverItem[]): string {
  const byId = new Map(items.map((i) => [i.id, i]));
  let current = itemId;
  const seen = new Set<string>([current]);
  for (let hop = 0; hop < MAX_MERGE_HOPS; hop++) {
    const next = byId.get(current)?.merged_into_id;
    if (!next || next === current) return current;
    if (seen.has(next)) return current; // cycle: stop where we are
    seen.add(next);
    current = next;
  }
  return current;
}

/**
 * Resolve `input.text` (and optional barcode) to a household item.
 *
 * Order, item-specific evidence first:
 *   1. barcode exact       — the one globally unambiguous identifier
 *   2. alias exact         — this household already confirmed this phrase
 *   3. alias fuzzy         — above FUZZY_CONFIDENCE_THRESHOLD only
 *   4. canonical_products  — the shared seed recognises it, but no row exists
 *                            here yet, so this is a provisional WITH defaults
 *   5. propose new         — provisional with nothing known
 *
 * Steps 4 and 5 both return `provisional`, distinguished by `matchedBy` and by
 * whether a `seed` is attached, because in neither case is there a `foods` row
 * to point at.
 */
export function resolveItem(input: ResolveInput, ctx: ResolveContext): ResolveResult {
  const rawText = String(input?.text ?? '').trim();
  const proposedName = rawText.replace(/\s+/g, ' ');
  const normalized = normalizeItemText(rawText);
  const barcode = normaliseBarcode(input?.barcode);

  const items = ctx?.items ?? [];
  const aliases = ctx?.aliases ?? [];
  const seeds = ctx?.canonicalProducts ?? [];

  const resolved = (itemId: string, confidence: number, matchedBy: ResolvedItem['matchedBy']): ResolvedItem => ({
    itemId: resolveMergeRedirect(itemId, items),
    confidence,
    matchedBy,
  });

  // 1. Barcode exact.
  if (barcode) {
    const hit = items.find((i) => normaliseBarcode(i.barcode) === barcode);
    if (hit) return resolved(hit.id, 1, 'barcode');
  }

  // 2. Household alias, exact on normalized text.
  if (normalized) {
    const hit = aliases.find((a) => a.normalized_text === normalized);
    if (hit) {
      const confidence = typeof hit.confidence === 'number' ? hit.confidence : 1;
      return resolved(hit.item_id, confidence, 'alias_exact');
    }
  }

  // 3. Household alias, fuzzy, above threshold. Best match wins; ties go to the
  //    first, which is stable because the caller controls alias order.
  if (normalized) {
    let best: { alias: ResolverAlias; score: number } | null = null;
    for (const alias of aliases) {
      const score = similarity(normalized, alias.normalized_text);
      if (!best || score > best.score) best = { alias, score };
    }
    if (best && best.score >= FUZZY_CONFIDENCE_THRESHOLD) {
      // An alias recorded at less than full confidence cannot lend more
      // confidence than it has.
      const aliasConfidence =
        typeof best.alias.confidence === 'number' ? best.alias.confidence : 1;
      return resolved(best.alias.item_id, best.score * aliasConfidence, 'alias_fuzzy');
    }
  }

  // 4. Shared seed. Recognised, but this household has no row for it yet.
  const seed =
    (barcode ? seeds.find((s) => normaliseBarcode(s.barcode) === barcode) : undefined) ??
    (normalized ? seeds.find((s) => s.normalized_name === normalized) : undefined);
  if (seed) {
    return {
      provisional: true,
      proposedName: proposedName || seed.normalized_name,
      confidence: 1,
      matchedBy: 'canonical_product',
      seed: {
        category: seed.category ?? null,
        defaultUnit: seed.default_unit ?? null,
        defaultAisle: seed.default_aisle ?? null,
        barcode: seed.barcode ?? (barcode || null),
      },
    };
  }

  // 5. Nothing knows what this is. Propose it and let the parent decide.
  return {
    provisional: true,
    proposedName,
    confidence: 0,
    matchedBy: 'none',
    ...(barcode ? { seed: { barcode } } : {}),
  };
}
