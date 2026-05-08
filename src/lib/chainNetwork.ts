/**
 * Picky-Eater Win Network client (US-296).
 *
 * Cross-user anonymized aggregation of food-chain transitions. Two surfaces:
 *
 *   - `contributeChainNetworkSuccess(...)`: fire-and-forget contribution
 *      called when a food_attempt with outcome=success closes a known
 *      food_chain_suggestion (source_food_id -> target_food_id). The
 *      attempt's UUID is reused as the idempotency key so the same win
 *      can't be counted twice even if the user re-saves.
 *
 *   - `fetchTopChainNetworkTargets(...)`: returns aggregated targets that
 *      other families have chained to from a given source food, subject
 *      to a k-anonymity floor (>=5 contributions, enforced server-side).
 *
 * The server normalizes food names via `normalize_chain_food_name`; the
 * client mirrors that normalization for display purposes only.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export type PickinessBucket = 'low' | 'medium' | 'high' | 'unknown';
export type ChainOutcome = 'success' | 'partial' | 'refused';

export interface ChainNetworkTarget {
  targetFoodKey: string;
  pickinessBucket: PickinessBucket;
  successCount: number;
  partialCount: number;
  refusedCount: number;
  totalCount: number;
  successRate: number;
  lastObservedAt: string;
}

export interface ContributeArgs {
  contributionKey: string;
  sourceFoodName: string;
  targetFoodName: string;
  pickinessBucket: PickinessBucket;
  outcome: ChainOutcome;
}

/**
 * Map a kid's `pickiness_level` (free-text-ish in the schema) to the four
 * server-recognized buckets. We bucket aggressively to keep aggregation
 * fast and groups large.
 */
export function bucketPickiness(level: string | null | undefined): PickinessBucket {
  if (!level) return 'unknown';
  const lc = level.toString().trim().toLowerCase();
  if (lc === '' || lc === 'unknown') return 'unknown';
  if (
    lc === 'low' ||
    lc.includes('mild') ||
    lc.includes('not picky') ||
    lc.includes('flexible') ||
    lc.includes('adventurous')
  ) {
    return 'low';
  }
  if (
    lc === 'high' ||
    lc.includes('very picky') ||
    lc.includes('severe') ||
    lc.includes('extreme') ||
    lc.includes('arfid')
  ) {
    return 'high';
  }
  if (
    lc === 'medium' ||
    lc.includes('moderate') ||
    lc.includes('somewhat') ||
    lc.includes('typical')
  ) {
    return 'medium';
  }
  // numeric heuristic e.g. "7/10" -> use the FIRST number, not the concat
  const m = lc.match(/\d+/);
  if (m) {
    const num = parseInt(m[0], 10);
    if (!Number.isNaN(num)) {
      if (num <= 3) return 'low';
      if (num >= 7) return 'high';
      return 'medium';
    }
  }
  return 'unknown';
}

/**
 * Mirror of the server's `normalize_chain_food_name`. Useful when the UI
 * needs to show a normalized key (e.g. for grouping or for "you contributed
 * to this transition" hints).
 */
export function normalizeChainFoodName(name: string | null | undefined): string {
  if (!name) return '';
  let s = name.toLowerCase().trim();
  s = s.replace(/^the\s+/, '');
  s = s.replace(/['".,!?()[\]]/g, '');
  s = s.replace(/\s+/g, ' ');
  return s;
}

/**
 * Fire-and-forget contribution. Returns true if the row was newly recorded,
 * false if dedup'd or a soft validation failure (empty source/target etc.).
 * Errors are logged but never thrown - this should never break the user
 * flow that triggered it.
 */
export async function contributeChainNetworkSuccess(args: ContributeArgs): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('contribute_chain_network', {
      p_contribution_key: args.contributionKey,
      p_source_food_name: args.sourceFoodName,
      p_target_food_name: args.targetFoodName,
      p_pickiness_bucket: args.pickinessBucket,
      p_outcome: args.outcome,
    });
    if (error) {
      logger.warn('contribute_chain_network failed', error);
      return false;
    }
    return data === true;
  } catch (err) {
    logger.warn('contribute_chain_network threw', err);
    return false;
  }
}

interface RawTargetRow {
  target_food_key: string;
  pickiness_bucket: PickinessBucket;
  success_count: number;
  partial_count: number;
  refused_count: number;
  total_count: number;
  success_rate: number | string;
  last_observed_at: string;
}

export async function fetchTopChainNetworkTargets(
  sourceFoodName: string,
  pickinessBucket?: PickinessBucket,
  limit = 5
): Promise<ChainNetworkTarget[]> {
  if (!sourceFoodName.trim()) return [];
  try {
    const { data, error } = await supabase.rpc('fetch_chain_network_targets', {
      p_source_food_name: sourceFoodName,
      p_pickiness_bucket: pickinessBucket ?? null,
      p_limit: Math.min(25, Math.max(1, limit)),
    });
    if (error) {
      logger.warn('fetch_chain_network_targets failed', error);
      return [];
    }
    const rows = (data as RawTargetRow[] | null) ?? [];
    return rows.map((r) => ({
      targetFoodKey: r.target_food_key,
      pickinessBucket: r.pickiness_bucket,
      successCount: r.success_count,
      partialCount: r.partial_count,
      refusedCount: r.refused_count,
      totalCount: r.total_count,
      successRate: typeof r.success_rate === 'string' ? Number(r.success_rate) : r.success_rate,
      lastObservedAt: r.last_observed_at,
    }));
  } catch (err) {
    logger.warn('fetch_chain_network_targets threw', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Attempt -> contribution wiring
// ---------------------------------------------------------------------------

interface FoodAttemptForContribution {
  /** food_attempts.id - reused as the contribution key */
  id: string;
  /** food_attempts.food_id */
  food_id: string;
  /** 'success' | 'partial' | 'refused' | other */
  outcome: string;
  /** kid_id, used only to look up pickiness */
  kid_id?: string | null;
}

/**
 * Idempotently contribute every chain-suggestion source -> target where the
 * just-saved attempt's food_id matches a target. Best-effort: errors are
 * swallowed. Pickiness is read from the kid record if available.
 *
 * Returns the number of contributions accepted.
 */
export async function recordContributionsFromAttempt(
  attempt: FoodAttemptForContribution
): Promise<number> {
  if (!attempt?.id || !attempt?.food_id) return 0;
  // Server only counts success/partial/refused; map common variants.
  const rawOutcome = String(attempt.outcome ?? '').toLowerCase();
  let outcome: ChainOutcome | null = null;
  if (rawOutcome === 'success') outcome = 'success';
  else if (rawOutcome === 'partial') outcome = 'partial';
  else if (rawOutcome === 'refused' || rawOutcome === 'tantrum') outcome = 'refused';
  // We only contribute on outcomes that are signal: success/partial.
  if (outcome === null || outcome === 'refused') return 0;

  // Look up pickiness for the kid (best-effort).
  let bucket: PickinessBucket = 'unknown';
  if (attempt.kid_id) {
    const { data: kidRow } = await supabase
      .from('kids')
      .select('pickiness_level')
      .eq('id', attempt.kid_id)
      .maybeSingle();
    bucket = bucketPickiness((kidRow as { pickiness_level?: string } | null)?.pickiness_level);
  }

  // Resolve target food name.
  const { data: targetFoodRow } = await supabase
    .from('foods')
    .select('name')
    .eq('id', attempt.food_id)
    .maybeSingle();
  const targetName = (targetFoodRow as { name?: string } | null)?.name;
  if (!targetName) return 0;

  // Find matching chain suggestions where this food was the target.
  const { data: suggestions, error: suggError } = await supabase
    .from('food_chain_suggestions')
    .select('source_food_id')
    .eq('target_food_id', attempt.food_id);
  if (suggError) {
    logger.warn('food_chain_suggestions lookup failed', suggError);
    return 0;
  }
  const sourceIds = (suggestions ?? [])
    .map((s: { source_food_id?: string }) => s.source_food_id)
    .filter((x): x is string => typeof x === 'string');
  if (sourceIds.length === 0) return 0;

  // Resolve source food names in one query.
  const { data: sourceRows } = await supabase.from('foods').select('id, name').in('id', sourceIds);
  const nameById = new Map<string, string>();
  for (const row of (sourceRows ?? []) as Array<{ id: string; name: string }>) {
    if (row?.id && row?.name) nameById.set(row.id, row.name);
  }

  let accepted = 0;
  for (const sourceId of sourceIds) {
    const sourceName = nameById.get(sourceId);
    if (!sourceName) continue;
    // Combine attempt id with source food id so multiple sources from one
    // attempt produce stable, distinct contribution keys.
    const contributionKey = deterministicUuid(`${attempt.id}:${sourceId}`);
    const ok = await contributeChainNetworkSuccess({
      contributionKey,
      sourceFoodName: sourceName,
      targetFoodName: targetName,
      pickinessBucket: bucket,
      outcome,
    });
    if (ok) accepted += 1;
  }
  return accepted;
}

/**
 * Build a deterministic v5-ish UUID from a string. We only need stability
 * (so the same input always yields the same UUID), not cryptographic
 * uniqueness; the server's PRIMARY KEY on contribution_key handles dedup.
 */
export function deterministicUuid(input: string): string {
  // FNV-1a hash, expanded to 32 hex chars by repeating with a salt.
  function fnv1a(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  const a = fnv1a(input).toString(16).padStart(8, '0');
  const b = fnv1a(input + ':b')
    .toString(16)
    .padStart(8, '0');
  const c = fnv1a(input + ':c')
    .toString(16)
    .padStart(8, '0');
  const d = fnv1a(input + ':d')
    .toString(16)
    .padStart(8, '0');
  // shape into 8-4-4-4-12 with v4-ish bits set
  return `${a}-${b.slice(0, 4)}-4${b.slice(4, 7)}-8${c.slice(0, 3)}-${c.slice(4)}${d}`;
}
