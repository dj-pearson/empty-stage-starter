/**
 * US-662: find the rows in a household's catalog that are the same thing
 * written down more than once, and propose collapsing them.
 *
 * This is the cleanup half of the canonical-item work. The resolver stops NEW
 * duplicates being created; this finds the ones already there. PantryDedup
 * existing in the iOS tree is the evidence that they are.
 *
 * It proposes and never acts. Merging is destructive-feeling to a parent even
 * though `merged_into_id` only redirects, so every group goes in front of them
 * with the evidence attached (US-664). There is deliberately no "merge all".
 *
 * Pure: takes the rows, returns proposals, performs no writes and no lookups.
 *
 * Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md
 */

import { normalizeItemText } from '@/lib/itemNormalize';

/** The item-side fields this reads. A subset of `foods`. */
export interface MergeCandidateItem {
  id: string;
  name: string;
  barcode?: string | null;
  household_id?: string | null;
  user_id?: string | null;
  created_at?: string | null;
  /** Already merged into a survivor; never a candidate again. */
  merged_into_id?: string | null;
}

export type MergeEvidence = 'shared_barcode' | 'identical_normalized_text' | 'alias_overlap';

export interface MergeGroup {
  survivor: MergeCandidateItem;
  duplicates: MergeCandidateItem[];
  /** Why these were grouped, strongest first. Shown to the parent verbatim. */
  evidence: MergeEvidence[];
  /** 0..1. Groups are returned in descending order of this. */
  confidence: number;
}

export interface ProposeMergesOptions {
  /**
   * item_id -> number of inventory_movements rows. Drives survivor choice:
   * the row with the most history is the one other tables already point at,
   * so keeping it moves the fewest references.
   */
  movementCounts?: Record<string, number>;
  /** item_id -> normalized alias texts, for the alias-overlap signal. */
  aliasesByItem?: Record<string, string[]>;
}

const CONFIDENCE: Record<MergeEvidence, number> = {
  shared_barcode: 1,
  identical_normalized_text: 0.9,
  alias_overlap: 0.75,
};

function scopeOf(item: MergeCandidateItem): string {
  return item.household_id ?? `user:${item.user_id ?? 'unknown'}`;
}

function barcodeOf(item: MergeCandidateItem): string | null {
  const b = (item.barcode ?? '').trim();
  return b === '' ? null : b;
}

/**
 * Survivor choice: most movement history, then oldest created_at, then lowest
 * id so the result is deterministic for a caller that supplied neither.
 */
function pickSurvivor(
  group: MergeCandidateItem[],
  movementCounts: Record<string, number>
): MergeCandidateItem {
  return [...group].sort((a, b) => {
    const ma = movementCounts[a.id] ?? 0;
    const mb = movementCounts[b.id] ?? 0;
    if (ma !== mb) return mb - ma;
    const ca = a.created_at ?? '';
    const cb = b.created_at ?? '';
    if (ca !== cb) {
      if (!ca) return 1;
      if (!cb) return -1;
      return ca < cb ? -1 : 1;
    }
    return a.id < b.id ? -1 : 1;
  })[0];
}

/**
 * Split a candidate group so that no group holds two different non-null
 * barcodes. A barcode is the one globally unambiguous identifier an item can
 * carry, so two different ones mean two different products no matter how alike
 * the names read. Rows without a barcode join the single barcoded subgroup when
 * there is exactly one, and otherwise stay together on their own.
 */
function splitByBarcode(group: MergeCandidateItem[]): MergeCandidateItem[][] {
  const byBarcode = new Map<string, MergeCandidateItem[]>();
  const unbarcoded: MergeCandidateItem[] = [];
  for (const item of group) {
    const b = barcodeOf(item);
    if (b === null) unbarcoded.push(item);
    else {
      if (!byBarcode.has(b)) byBarcode.set(b, []);
      byBarcode.get(b)!.push(item);
    }
  }
  if (byBarcode.size === 0) return unbarcoded.length ? [unbarcoded] : [];
  if (byBarcode.size === 1) {
    const only = [...byBarcode.values()][0];
    return [[...only, ...unbarcoded]];
  }
  // Two or more distinct barcodes: each is its own product, and the
  // unbarcoded rows cannot be attributed to either, so they are left alone.
  const out = [...byBarcode.values()];
  if (unbarcoded.length > 1) out.push(unbarcoded);
  return out;
}

/**
 * Propose merge groups for a set of catalog rows.
 *
 * Grouping runs per household, never across, and only over rows that are not
 * already merged. Three signals, strongest first:
 *
 *   shared_barcode             two rows carry the same barcode
 *   identical_normalized_text  two rows reduce to the same normalized name
 *   alias_overlap              two rows have a confirmed alias phrase in common
 *
 * Returned in descending confidence so the review surface shows the obvious
 * ones first and a parent can stop when they stop being obvious.
 */
export function proposeMerges(
  items: MergeCandidateItem[],
  options: ProposeMergesOptions = {}
): MergeGroup[] {
  const movementCounts = options.movementCounts ?? {};
  const aliasesByItem = options.aliasesByItem ?? {};

  const live = (items ?? []).filter((i) => i && i.id && !i.merged_into_id);

  // scope -> key -> rows, one map per signal.
  const byBarcode = new Map<string, MergeCandidateItem[]>();
  const byName = new Map<string, MergeCandidateItem[]>();
  const byAlias = new Map<string, MergeCandidateItem[]>();

  for (const item of live) {
    const scope = scopeOf(item);

    const barcode = barcodeOf(item);
    if (barcode) {
      const k = `${scope}|${barcode}`;
      if (!byBarcode.has(k)) byBarcode.set(k, []);
      byBarcode.get(k)!.push(item);
    }

    const normalized = normalizeItemText(item.name ?? '');
    if (normalized) {
      const k = `${scope}|${normalized}`;
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k)!.push(item);
    }

    for (const alias of aliasesByItem[item.id] ?? []) {
      const k = `${scope}|${alias}`;
      if (!byAlias.has(k)) byAlias.set(k, []);
      byAlias.get(k)!.push(item);
    }
  }

  /** Groups already emitted, keyed by their sorted member ids. */
  const emitted = new Map<string, MergeGroup>();

  const emit = (rows: MergeCandidateItem[], evidence: MergeEvidence) => {
    for (const subgroup of splitByBarcode(rows)) {
      const unique = [...new Map(subgroup.map((i) => [i.id, i])).values()];
      if (unique.length < 2) continue;
      const key = unique.map((i) => i.id).sort().join('|');
      const existing = emitted.get(key);
      if (existing) {
        // Same set of rows found by another signal: record the extra evidence
        // and keep the strongest confidence.
        if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
        existing.confidence = Math.max(existing.confidence, CONFIDENCE[evidence]);
        existing.evidence.sort((a, b) => CONFIDENCE[b] - CONFIDENCE[a]);
        continue;
      }
      const survivor = pickSurvivor(unique, movementCounts);
      emitted.set(key, {
        survivor,
        duplicates: unique.filter((i) => i.id !== survivor.id),
        evidence: [evidence],
        confidence: CONFIDENCE[evidence],
      });
    }
  };

  for (const rows of byBarcode.values()) emit(rows, 'shared_barcode');
  for (const rows of byName.values()) emit(rows, 'identical_normalized_text');
  for (const rows of byAlias.values()) emit(rows, 'alias_overlap');

  return [...emitted.values()].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    // Stable tiebreak so the review surface does not reshuffle between loads.
    return a.survivor.id < b.survivor.id ? -1 : 1;
  });
}
