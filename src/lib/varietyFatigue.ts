/**
 * Variety Fatigue scoring (US-298).
 *
 * Pure module. Computes per-recipe and per-ingredient fatigue scores from a
 * household's recent plan_entries with recency-weighted decay so a meal
 * eaten yesterday counts more than the same meal three weeks ago.
 *
 * Two windows feed the threshold matrix:
 *   - short window: 7 days
 *   - long window:  28 days
 *
 * Fatigue tier:
 *   - 'high' when an item hits BOTH thresholds (3+/7d AND 5+/28d) or hits
 *     either threshold heavily (>=5/7d, >=8/28d)
 *   - 'mild' when an item hits at least ONE threshold
 *   - 'none' otherwise
 *
 * The numeric `fatigueScore` is a 0..1 ranking aid for sorting/UI gradients.
 */

export interface FatiguePlanEntry {
  /** plan_entries.recipe_id - required for recipe-level scoring */
  recipeId: string | null;
  /** plan_entries.food_id - required for ingredient-level scoring */
  foodId: string | null;
  /** ISO date 'YYYY-MM-DD' or full ISO timestamp; only the date portion matters. */
  date: string;
}

export type FatigueTier = 'none' | 'mild' | 'high';

export interface FatigueItem {
  /** recipe_id or food_id depending on which scorer produced it */
  id: string;
  name: string;
  shortWindowCount: number;
  longWindowCount: number;
  fatigueScore: number;
  tier: FatigueTier;
}

export interface FatigueResult {
  recipes: FatigueItem[];
  ingredients: FatigueItem[];
  worstTier: FatigueTier;
  /** ISO date 'YYYY-MM-DD' of when this was computed (for snapshot persistence). */
  computedFor: string;
}

export interface FatigueOptions {
  /** ISO date string, defaults to today's local date. */
  asOf?: string;
  /** Short window in days, default 7. */
  shortWindowDays?: number;
  /** Long window in days, default 28. */
  longWindowDays?: number;
  /** Threshold for 'mild' on short window, default 3. */
  shortThresholdMild?: number;
  /** Threshold for 'mild' on long window, default 5. */
  longThresholdMild?: number;
  /** Heavy threshold (single window) that promotes to 'high' on its own, short. Default 5. */
  shortThresholdHigh?: number;
  /** Heavy threshold (single window) that promotes to 'high' on its own, long. Default 8. */
  longThresholdHigh?: number;
  /** Cap items returned per category. Default 5. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateOnly(iso: string): string {
  // Accepts 'YYYY-MM-DD' or full ISO; returns 'YYYY-MM-DD'
  const t = iso.indexOf('T');
  return t > 0 ? iso.slice(0, t) : iso;
}

function localTodayIso(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetween(asOfIso: string, entryIso: string): number {
  // Both 'YYYY-MM-DD'. Treat as UTC-noon to dodge DST.
  const a = new Date(asOfIso + 'T12:00:00Z').getTime();
  const b = new Date(entryIso + 'T12:00:00Z').getTime();
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
}

/**
 * Recency weight for decay. We don't decay within the short window (full
 * weight=1.0 for 0-7d), then decay linearly out to the end of the long
 * window. Past-the-long-window entries get 0.
 */
function decayWeight(daysAgo: number, shortWindow: number, longWindow: number): number {
  if (daysAgo < 0) return 0;
  if (daysAgo <= shortWindow) return 1;
  if (daysAgo <= longWindow) {
    const span = longWindow - shortWindow;
    if (span <= 0) return 0;
    const t = (daysAgo - shortWindow) / span;
    return Math.max(0, 1 - t);
  }
  return 0;
}

function classifyTier(
  shortCount: number,
  longCount: number,
  o: Required<FatigueOptions>
): FatigueTier {
  const hitShort = shortCount >= o.shortThresholdMild;
  const hitLong = longCount >= o.longThresholdMild;
  if (
    (hitShort && hitLong) ||
    shortCount >= o.shortThresholdHigh ||
    longCount >= o.longThresholdHigh
  ) {
    return 'high';
  }
  if (hitShort || hitLong) return 'mild';
  return 'none';
}

interface Bucket {
  shortCount: number;
  longCount: number;
  weighted: number;
}

function fatigueScoreOf(b: Bucket, longWindow: number): number {
  // 0..1: weighted hits / windowSize, soft-capped.
  const raw = b.weighted / Math.max(1, longWindow);
  return Math.max(0, Math.min(1, raw * 2));
}

// ---------------------------------------------------------------------------
// Core scorers
// ---------------------------------------------------------------------------

export interface FatigueInputs {
  planEntries: FatiguePlanEntry[];
  recipeNameById?: Map<string, string>;
  foodNameById?: Map<string, string>;
}

export function computeVarietyFatigue(
  inputs: FatigueInputs,
  options: FatigueOptions = {}
): FatigueResult {
  const o: Required<FatigueOptions> = {
    asOf: options.asOf ?? localTodayIso(),
    shortWindowDays: options.shortWindowDays ?? 7,
    longWindowDays: options.longWindowDays ?? 28,
    shortThresholdMild: options.shortThresholdMild ?? 3,
    longThresholdMild: options.longThresholdMild ?? 5,
    shortThresholdHigh: options.shortThresholdHigh ?? 5,
    longThresholdHigh: options.longThresholdHigh ?? 8,
    limit: options.limit ?? 5,
  };

  const recipeBuckets = new Map<string, Bucket>();
  const foodBuckets = new Map<string, Bucket>();

  for (const entry of inputs.planEntries) {
    if (!entry?.date) continue;
    const dateOnly = toDateOnly(entry.date);
    const days = daysBetween(o.asOf, dateOnly);
    if (days < 0 || days > o.longWindowDays) continue;
    const w = decayWeight(days, o.shortWindowDays, o.longWindowDays);
    if (w <= 0) continue;
    const inShort = days <= o.shortWindowDays;

    if (entry.recipeId) {
      const b = recipeBuckets.get(entry.recipeId) ?? { shortCount: 0, longCount: 0, weighted: 0 };
      if (inShort) b.shortCount += 1;
      b.longCount += 1;
      b.weighted += w;
      recipeBuckets.set(entry.recipeId, b);
    }
    if (entry.foodId) {
      const b = foodBuckets.get(entry.foodId) ?? { shortCount: 0, longCount: 0, weighted: 0 };
      if (inShort) b.shortCount += 1;
      b.longCount += 1;
      b.weighted += w;
      foodBuckets.set(entry.foodId, b);
    }
  }

  const buildItems = (
    map: Map<string, Bucket>,
    nameById: Map<string, string> | undefined
  ): FatigueItem[] => {
    const items: FatigueItem[] = [];
    for (const [id, b] of map.entries()) {
      const tier = classifyTier(b.shortCount, b.longCount, o);
      if (tier === 'none') continue;
      items.push({
        id,
        name: nameById?.get(id) ?? id,
        shortWindowCount: b.shortCount,
        longWindowCount: b.longCount,
        fatigueScore: Math.round(fatigueScoreOf(b, o.longWindowDays) * 100) / 100,
        tier,
      });
    }
    items.sort((a, b) => {
      const tierRank = (t: FatigueTier) => (t === 'high' ? 2 : t === 'mild' ? 1 : 0);
      const tr = tierRank(b.tier) - tierRank(a.tier);
      if (tr !== 0) return tr;
      return b.fatigueScore - a.fatigueScore;
    });
    return items.slice(0, o.limit);
  };

  const recipes = buildItems(recipeBuckets, inputs.recipeNameById);
  const ingredients = buildItems(foodBuckets, inputs.foodNameById);

  let worstTier: FatigueTier = 'none';
  for (const it of recipes.concat(ingredients)) {
    if (it.tier === 'high') {
      worstTier = 'high';
      break;
    }
    if (it.tier === 'mild') worstTier = 'mild';
  }

  return {
    recipes,
    ingredients,
    worstTier,
    computedFor: o.asOf,
  };
}
