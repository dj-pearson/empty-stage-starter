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
import { matchingFoodAllergen } from '@/lib/allergens';
import { isAllergyUnknown } from '@/lib/kidFit';
import type { Food, Kid } from '@/types';
import { deterministicUuid, isUuid, normalizeChainFoodName } from './chainNetworkKeys';
import { isShareChainOptedIn } from './shareChainPref';

export { deterministicUuid, isUuid, normalizeChainFoodName } from './chainNetworkKeys';

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
  // Stored levels are snake_case ('very_picky'); the phrases below are spaced.
  const lc = level.toString().trim().toLowerCase().replace(/[_-]+/g, ' ');
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
 * Fire-and-forget contribution. Returns true if the row was newly recorded,
 * false if dedup'd or a soft validation failure (empty source/target etc.).
 * Errors are logged but never thrown - this should never break the user
 * flow that triggered it.
 */
export async function contributeChainNetworkSuccess(args: ContributeArgs): Promise<boolean> {
  // p_contribution_key is a UUID column. A readable key like `ladder:<id>`
  // fails the cast server-side and the contribution is silently lost, so every
  // non-UUID key is hashed to a stable UUID first (same input, same key).
  const contributionKey = isUuid(args.contributionKey)
    ? args.contributionKey
    : deterministicUuid(args.contributionKey);
  try {
    const { data, error } = await supabase.rpc('contribute_chain_network', {
      p_contribution_key: contributionKey,
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

export type ChainNetworkFetchResult = { ok: true; rows: ChainNetworkTarget[] } | { ok: false };

/** How long a fetched target list is reused before asking the server again. */
export const CHAIN_NETWORK_CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  at: number;
  result: { ok: true; rows: ChainNetworkTarget[] };
}

const targetCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ChainNetworkFetchResult>>();

/** Test hook: forget every cached and in-flight fetch. */
export function clearChainNetworkTargetsCache(): void {
  targetCache.clear();
  inFlight.clear();
}

function mapRawRow(r: RawTargetRow): ChainNetworkTarget {
  return {
    targetFoodKey: r.target_food_key,
    pickinessBucket: r.pickiness_bucket,
    successCount: r.success_count,
    partialCount: r.partial_count,
    refusedCount: r.refused_count,
    totalCount: r.total_count,
    successRate: typeof r.success_rate === 'string' ? Number(r.success_rate) : r.success_rate,
    lastObservedAt: r.last_observed_at,
  };
}

/**
 * Aggregated targets other families chained to from `sourceFoodName`.
 *
 * `{ ok: false }` means the read failed, which the UI must not confuse with
 * "no data yet". Successful reads are cached for ten minutes per
 * normalized source|bucket|limit, and concurrent calls for the same key
 * share one request.
 */
export async function fetchTopChainNetworkTargets(
  sourceFoodName: string,
  pickinessBucket?: PickinessBucket,
  limit = 5
): Promise<ChainNetworkFetchResult> {
  const source = normalizeChainFoodName(sourceFoodName);
  if (!source) return { ok: true, rows: [] };
  const clamped = Math.min(25, Math.max(1, limit));
  const key = `${source}|${pickinessBucket ?? ''}|${clamped}`;

  const cached = targetCache.get(key);
  if (cached && Date.now() - cached.at < CHAIN_NETWORK_CACHE_TTL_MS) return cached.result;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async (): Promise<ChainNetworkFetchResult> => {
    try {
      const { data, error } = await supabase.rpc('fetch_chain_network_targets', {
        p_source_food_name: sourceFoodName,
        p_pickiness_bucket: pickinessBucket,
        p_limit: clamped,
      });
      if (error) {
        logger.warn('fetch_chain_network_targets failed', error);
        return { ok: false };
      }
      const rows = ((data as RawTargetRow[] | null) ?? []).map(mapRawRow);
      const result = { ok: true as const, rows };
      targetCache.set(key, { at: Date.now(), result });
      return result;
    } catch (err) {
      logger.warn('fetch_chain_network_targets threw', err);
      return { ok: false };
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}

// ---------------------------------------------------------------------------
// Merge, rank and allergen-filter (pure)
// ---------------------------------------------------------------------------

/**
 * Wilson score lower bound (95%) for `success` out of `total`. Ranks 18/20
 * above 4/5: a high rate on a handful of tries is weaker evidence than a
 * slightly lower rate on many.
 */
export function wilsonLowerBound(success: number, total: number, z = 1.96): number {
  if (!(total > 0)) return 0;
  const p = Math.min(1, Math.max(0, success / total));
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return Math.max(0, (centre - margin) / denom);
}

/**
 * Fold rows that share a targetFoodKey into one. The server returns the
 * kid's bucket and the 'unknown' bucket side by side, which would otherwise
 * show the same food twice. Counts are summed, successRate (0-100) is
 * recomputed from the sums, and the result is ranked by Wilson lower bound.
 */
export function mergeNetworkTargetsByFood(
  rows: readonly ChainNetworkTarget[],
  bucket: PickinessBucket
): ChainNetworkTarget[] {
  const byKey = new Map<string, ChainNetworkTarget>();
  for (const r of rows) {
    const key = normalizeChainFoodName(r.targetFoodKey) || r.targetFoodKey;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...r, targetFoodKey: key });
      continue;
    }
    byKey.set(key, {
      targetFoodKey: key,
      // Report the kid's own bucket when either side carries it.
      pickinessBucket: r.pickinessBucket === bucket ? bucket : prev.pickinessBucket,
      successCount: prev.successCount + r.successCount,
      partialCount: prev.partialCount + r.partialCount,
      refusedCount: prev.refusedCount + r.refusedCount,
      totalCount: prev.totalCount + r.totalCount,
      successRate: 0,
      lastObservedAt:
        prev.lastObservedAt > r.lastObservedAt ? prev.lastObservedAt : r.lastObservedAt,
    });
  }
  const merged = [...byKey.values()].map((t) => ({
    ...t,
    successRate: t.totalCount > 0 ? Math.round((t.successCount / t.totalCount) * 1000) / 10 : 0,
  }));
  return merged.sort((a, b) => {
    const diff =
      wilsonLowerBound(b.successCount, b.totalCount) -
      wilsonLowerBound(a.successCount, a.totalCount);
    if (diff !== 0) return diff;
    return a.targetFoodKey.localeCompare(b.targetFoodKey);
  });
}

export interface NetworkFilterResult {
  visible: ChainNetworkTarget[];
  /** Targets removed for this child's allergies (hits and unverifiable names). */
  hiddenCount: number;
  /**
   * The child's allergy list has never been set. Nothing is shown; the UI
   * should link to the kid profile instead.
   */
  allergiesUnknown: boolean;
}

/**
 * Allergen floor for other families' wins. A network target is only a name,
 * so it is resolved to a household food where it can be (tags, families and
 * name are then all checked); otherwise the name alone is checked. Any hit is
 * hidden whatever its severity, and for a child with an allergen an
 * unresolved name is hidden too: unknown is not safe.
 */
export function filterNetworkTargetsForKid(
  targets: readonly ChainNetworkTarget[],
  kid: Pick<Kid, 'allergens'>,
  foods: readonly Pick<Food, 'name' | 'allergens'>[]
): NetworkFilterResult {
  if (isAllergyUnknown(kid)) {
    return { visible: [], hiddenCount: 0, allergiesUnknown: true };
  }
  const kidAllergens = kid.allergens ?? [];
  const kidHasAllergens = kidAllergens.some((a) => typeof a === 'string' && a.trim() !== '');
  const byName = new Map<string, Pick<Food, 'name' | 'allergens'>>();
  for (const f of foods) {
    const key = normalizeChainFoodName(f.name);
    if (key && !byName.has(key)) byName.set(key, f);
  }

  const visible: ChainNetworkTarget[] = [];
  let hiddenCount = 0;
  for (const t of targets) {
    if (!kidHasAllergens) {
      visible.push(t);
      continue;
    }
    const food = byName.get(t.targetFoodKey) ?? byName.get(normalizeChainFoodName(t.targetFoodKey));
    const hit = food
      ? matchingFoodAllergen(kidAllergens, food)
      : matchingFoodAllergen(kidAllergens, { name: t.targetFoodKey, allergens: null });
    if (hit !== null || !food) {
      hiddenCount++;
      continue;
    }
    visible.push(t);
  }
  return { visible, hiddenCount, allergiesUnknown: false };
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
 * "Share my food-chain outcomes anonymously" (US-296). Read from the
 * shareChainPref store, which holds the server row
 * (picky_win_preferences.share_chain_outcomes). Fails closed: until that row
 * has loaded for the signed-in user, nothing is contributed, whatever the
 * device cache says.
 */
function isShareOptedIn(): boolean {
  return isShareChainOptedIn();
}

/**
 * Idempotently contribute every chain-suggestion source -> target where the
 * just-saved attempt's food_id matches a target. Best-effort: errors are
 * swallowed. Pickiness is read from the kid record if available.
 *
 * Returns the number of contributions accepted. Returns 0 when the user
 * has opted out of sharing (US-296 privacy contract).
 */
export interface ContributionContext {
  /**
   * The kid's pickiness_level when the caller already has the kid record.
   * Passing it (even as null) skips the kids lookup.
   */
  pickinessLevel?: string | null;
  /** The attempted food's name when known; skips the foods lookup. */
  foodName?: string;
}

export async function recordContributionsFromAttempt(
  attempt: FoodAttemptForContribution,
  context: ContributionContext = {}
): Promise<number> {
  if (!attempt?.id || !attempt?.food_id) return 0;
  if (!isShareOptedIn()) return 0;
  // Server only counts success/partial/refused; map common variants.
  const rawOutcome = String(attempt.outcome ?? '').toLowerCase();
  let outcome: ChainOutcome | null = null;
  if (rawOutcome === 'success') outcome = 'success';
  else if (rawOutcome === 'partial') outcome = 'partial';
  else if (rawOutcome === 'refused' || rawOutcome === 'tantrum') outcome = 'refused';
  // We only contribute on outcomes that are signal: success/partial.
  if (outcome === null || outcome === 'refused') return 0;

  // Look up pickiness for the kid (best-effort), unless the caller has it.
  let bucket: PickinessBucket = 'unknown';
  if (context.pickinessLevel !== undefined) {
    bucket = bucketPickiness(context.pickinessLevel);
  } else if (attempt.kid_id) {
    const { data: kidRow } = await supabase
      .from('kids')
      .select('pickiness_level')
      .eq('id', attempt.kid_id)
      .maybeSingle();
    bucket = bucketPickiness((kidRow as { pickiness_level?: string } | null)?.pickiness_level);
  }

  // Resolve target food name.
  let targetName = context.foodName?.trim() || undefined;
  if (!targetName) {
    const { data: targetFoodRow } = await supabase
      .from('foods')
      .select('name')
      .eq('id', attempt.food_id)
      .maybeSingle();
    targetName = (targetFoodRow as { name?: string } | null)?.name;
  }
  if (!targetName) return 0;
  const target = targetName;

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
    .map((s: { source_food_id?: string | null }) => s.source_food_id)
    .filter((x): x is string => typeof x === 'string');
  if (sourceIds.length === 0) return 0;

  // Resolve source food names in one query.
  const { data: sourceRows } = await supabase.from('foods').select('id, name').in('id', sourceIds);
  const nameById = new Map<string, string>();
  for (const row of (sourceRows ?? []) as Array<{ id: string; name: string }>) {
    if (row?.id && row?.name) nameById.set(row.id, row.name);
  }

  // Each contribution is independent and idempotent on its key, so they run
  // in parallel rather than one round trip after another.
  const results = await Promise.all(
    sourceIds.map((sourceId) => {
      const sourceName = nameById.get(sourceId);
      if (!sourceName) return Promise.resolve(false);
      // Combine attempt id with source food id so multiple sources from one
      // attempt produce stable, distinct contribution keys.
      return contributeChainNetworkSuccess({
        contributionKey: deterministicUuid(`${attempt.id}:${sourceId}`),
        sourceFoodName: sourceName,
        targetFoodName: target,
        pickinessBucket: bucket,
        outcome,
      });
    })
  );
  return results.filter(Boolean).length;
}
