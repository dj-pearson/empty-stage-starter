/**
 * Safe Food Insurance — risk scoring (US-610).
 *
 * Pure module. Watches the foods a child actually relies on and notices when
 * one starts to slip, while there is still time to build a backup.
 *
 * Losing a safe food is the most damaging thing that happens to an ARFID
 * family: the plate shrinks, and it rarely grows back on its own. The slip is
 * almost never sudden — acceptance drifts down over weeks, refusals creep up,
 * and the food is often being served more, not less, because it is the one
 * thing that "works". By the time a parent notices, the food is gone.
 *
 * Three rules keep this from crying wolf, which would be worse than silence:
 *
 *   - A food is only ever scored against ITS OWN baseline. Comparing one
 *     child's chicken nuggets to a population average says nothing.
 *   - Nothing is flagged without a minimum number of observations in BOTH
 *     windows. One bad night must never flag a staple; that is exactly the
 *     alarm that teaches parents to ignore the app.
 *   - Over-serving alone never raises a flag. Serving a safe food often is
 *     normal; it only sharpens a decline that is already visible in the
 *     outcomes. That reading comes from the existing `computeVarietyFatigue`
 *     rather than a second frequency counter that would drift from it.
 *
 * Nothing here reads the clock or touches Supabase — `asOf` is injected, so
 * every threshold below is directly unit-testable.
 */

import { computeVarietyFatigue, type FatigueTier } from './varietyFatigue';

/** Recent window, in days: "how is this food going right now". */
export const RECENT_WINDOW_DAYS = 14;
/** Baseline window, in days, immediately preceding the recent window. */
export const BASELINE_WINDOW_DAYS = 28;
/** Observations needed in EACH window before a food can be flagged at all. */
export const MIN_OBSERVATIONS = 4;
/** Consecutive clean recent servings that clear a flag. */
export const RECOVERY_STREAK = 3;

/** Acceptance drop (in rate points) that counts as a declining trend. */
export const DECLINE_THRESHOLD = 0.2;
/** Refusal-rate rise over baseline that counts as a rising refusal rate. */
export const REFUSAL_RISE_THRESHOLD = 0.15;

/** Score at or above which a food is called at risk. */
export const AT_RISK_SCORE = 0.55;
/** Score at or above which a food is worth watching. */
export const WATCH_SCORE = 0.25;

export type SafeFoodRiskLevel = 'none' | 'watch' | 'at_risk';

/**
 * Why a food scored the way it did, as data. US-611 turns these into copy;
 * keeping them structured means the wording can change without touching the
 * rules, and a locale file can carry the translation.
 */
export type SafeFoodSignal =
  | { kind: 'declining_acceptance'; baselineRate: number; recentRate: number }
  | { kind: 'rising_refusals'; baselineRate: number; recentRate: number }
  | { kind: 'over_served'; tier: FatigueTier; shortWindowCount: number; longWindowCount: number }
  | { kind: 'recovering'; cleanServings: number };

export interface SafeFoodRisk {
  foodId: string;
  foodName: string;
  level: SafeFoodRiskLevel;
  /** 0..1, for ordering. Not a probability and not shown to parents as one. */
  score: number;
  signals: SafeFoodSignal[];
  recentAcceptanceRate: number;
  baselineAcceptanceRate: number;
  recentRefusalRate: number;
  baselineRefusalRate: number;
  observations: { recent: number; baseline: number };
  /** True when the windows are too thin to say anything. Never flagged. */
  insufficientData: boolean;
}

/** A logged outcome, from either `plan_entries.result` or `food_attempts`. */
export interface SafeFoodObservation {
  foodId: string | null;
  /** ISO 'YYYY-MM-DD' or a full ISO timestamp; only the date part is used. */
  date: string | null;
  /**
   * The raw label as stored. Recognized: 'ate'/'success' (accepted),
   * 'tasted'/'partial' (partial), 'refused'/'tantrum' (refused). Anything
   * else is ignored rather than guessed at.
   */
  result: string | null;
}

export interface SafeFoodInput {
  /** Only foods marked safe are scored; the rest are passed through untouched. */
  foods: { id: string; name: string; isSafe: boolean }[];
  observations: SafeFoodObservation[];
  /**
   * Plan entries for the over-serving read. Passed straight to
   * `computeVarietyFatigue` so both features agree on what "too often" means.
   */
  planEntries?: { recipeId: string | null; foodId: string | null; date: string }[];
  /** ISO 'YYYY-MM-DD' treated as today. */
  asOf: string;
  /** Test/tuning overrides. Production callers should leave these alone. */
  options?: Partial<{
    recentWindowDays: number;
    baselineWindowDays: number;
    minObservations: number;
  }>;
}

type Outcome = 'accepted' | 'partial' | 'refused';

function classifyOutcome(result: string | null): Outcome | null {
  switch (result) {
    case 'ate':
    case 'success':
      return 'accepted';
    case 'tasted':
    case 'partial':
      return 'partial';
    case 'refused':
    case 'tantrum':
      return 'refused';
    default:
      return null;
  }
}

function dayOf(value: string): string {
  const t = value.indexOf('T');
  return t > 0 ? value.slice(0, t) : value;
}

/** Whole days between two 'YYYY-MM-DD' dates, via UTC noon to dodge DST. */
function daysBetween(asOf: string, day: string): number {
  const a = Date.parse(`${asOf}T12:00:00Z`);
  const b = Date.parse(`${day}T12:00:00Z`);
  return Math.floor((a - b) / 86_400_000);
}

interface WindowTally {
  accepted: number;
  partial: number;
  refused: number;
}

function emptyTally(): WindowTally {
  return { accepted: 0, partial: 0, refused: 0 };
}

function total(tally: WindowTally): number {
  return tally.accepted + tally.partial + tally.refused;
}

/**
 * Acceptance rate with partials at half credit. A tasted bite is neither a
 * win nor a refusal, and scoring it as either is what makes a trend line lie.
 */
function acceptanceRate(tally: WindowTally): number {
  const n = total(tally);
  return n === 0 ? 0 : (tally.accepted + tally.partial * 0.5) / n;
}

function refusalRate(tally: WindowTally): number {
  const n = total(tally);
  return n === 0 ? 0 : tally.refused / n;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Score every safe food's risk of slipping.
 *
 * Returns one row per safe food — including the calm ones — so a caller can
 * show a whole-pantry view without re-deriving which foods were considered.
 * Rows are ordered worst-first.
 */
export function scoreSafeFoodRisk(input: SafeFoodInput): SafeFoodRisk[] {
  const recentDays = input.options?.recentWindowDays ?? RECENT_WINDOW_DAYS;
  const baselineDays = input.options?.baselineWindowDays ?? BASELINE_WINDOW_DAYS;
  const minObservations = input.options?.minObservations ?? MIN_OBSERVATIONS;
  const baselineEnd = recentDays + baselineDays;

  const safeFoods = input.foods.filter((f) => f.isSafe);
  if (safeFoods.length === 0) return [];
  const safeIds = new Set(safeFoods.map((f) => f.id));

  const recent = new Map<string, WindowTally>();
  const baseline = new Map<string, WindowTally>();
  // Most-recent-first per food, for the recovery check.
  const recentByFood = new Map<string, { daysAgo: number; outcome: Outcome }[]>();

  for (const observation of input.observations) {
    const { foodId, date, result } = observation;
    if (!foodId || !date || !safeIds.has(foodId)) continue;
    const outcome = classifyOutcome(result);
    if (!outcome) continue;

    const daysAgo = daysBetween(input.asOf, dayOf(date));
    // Future-dated plan entries are plans, not outcomes.
    if (daysAgo < 0 || daysAgo > baselineEnd) continue;

    const bucket = daysAgo <= recentDays ? recent : baseline;
    const tally = bucket.get(foodId) ?? emptyTally();
    tally[outcome] += 1;
    bucket.set(foodId, tally);

    if (daysAgo <= recentDays) {
      const log = recentByFood.get(foodId) ?? [];
      log.push({ daysAgo, outcome });
      recentByFood.set(foodId, log);
    }
  }

  // One shared reading of "served too often" (US-298), not a second counter.
  const fatigue = input.planEntries
    ? computeVarietyFatigue(
        { planEntries: input.planEntries },
        { asOf: input.asOf, limit: Number.MAX_SAFE_INTEGER }
      )
    : null;
  const fatigueByFood = new Map(fatigue?.ingredients.map((item) => [item.id, item]) ?? []);

  const rows = safeFoods.map((food) => {
    const recentTally = recent.get(food.id) ?? emptyTally();
    const baselineTally = baseline.get(food.id) ?? emptyTally();
    const recentCount = total(recentTally);
    const baselineCount = total(baselineTally);

    const recentAcceptance = acceptanceRate(recentTally);
    const baselineAcceptance = acceptanceRate(baselineTally);
    const recentRefusal = refusalRate(recentTally);
    const baselineRefusal = refusalRate(baselineTally);

    const row: SafeFoodRisk = {
      foodId: food.id,
      foodName: food.name,
      level: 'none',
      score: 0,
      signals: [],
      recentAcceptanceRate: round2(recentAcceptance),
      baselineAcceptanceRate: round2(baselineAcceptance),
      recentRefusalRate: round2(recentRefusal),
      baselineRefusalRate: round2(baselineRefusal),
      observations: { recent: recentCount, baseline: baselineCount },
      insufficientData: recentCount < minObservations || baselineCount < minObservations,
    };

    // Too little history to say anything. Silence beats a guess.
    if (row.insufficientData) return row;

    // A food that has been going fine lately is not slipping, whatever the
    // fortnight average says — a rough patch followed by a clean run is a
    // recovery, and re-flagging it would punish the family for the recovery.
    const lastFew = [...(recentByFood.get(food.id) ?? [])]
      .sort((a, b) => a.daysAgo - b.daysAgo)
      .slice(0, RECOVERY_STREAK);
    const recovered =
      lastFew.length >= RECOVERY_STREAK && lastFew.every((e) => e.outcome === 'accepted');
    if (recovered) {
      row.signals.push({ kind: 'recovering', cleanServings: lastFew.length });
      return row;
    }

    const acceptanceDrop = baselineAcceptance - recentAcceptance;
    const refusalRise = recentRefusal - baselineRefusal;

    if (acceptanceDrop >= DECLINE_THRESHOLD) {
      row.signals.push({
        kind: 'declining_acceptance',
        baselineRate: round2(baselineAcceptance),
        recentRate: round2(recentAcceptance),
      });
    }
    if (refusalRise >= REFUSAL_RISE_THRESHOLD) {
      row.signals.push({
        kind: 'rising_refusals',
        baselineRate: round2(baselineRefusal),
        recentRate: round2(recentRefusal),
      });
    }

    const fatigueItem = fatigueByFood.get(food.id);
    if (fatigueItem && fatigueItem.tier !== 'none') {
      row.signals.push({
        kind: 'over_served',
        tier: fatigueItem.tier,
        shortWindowCount: fatigueItem.shortWindowCount,
        longWindowCount: fatigueItem.longWindowCount,
      });
    }

    // Over-serving is an aggravator, never a trigger: a food served nightly
    // and eaten every time is not at risk, it is dinner.
    const hasPrimarySignal = row.signals.some(
      (s) => s.kind === 'declining_acceptance' || s.kind === 'rising_refusals'
    );
    if (!hasPrimarySignal) {
      row.signals = row.signals.filter((s) => s.kind !== 'over_served');
      return row;
    }

    const declineComponent = clamp01(acceptanceDrop / 0.4) * 0.5;
    const refusalComponent = clamp01(refusalRise / 0.3) * 0.35;
    const overServedComponent =
      (fatigueItem?.tier === 'high' ? 1 : fatigueItem?.tier === 'mild' ? 0.5 : 0) * 0.15;

    row.score = round2(clamp01(declineComponent + refusalComponent + overServedComponent));
    row.level =
      row.score >= AT_RISK_SCORE ? 'at_risk' : row.score >= WATCH_SCORE ? 'watch' : 'none';
    return row;
  });

  const levelRank = (level: SafeFoodRiskLevel) =>
    level === 'at_risk' ? 2 : level === 'watch' ? 1 : 0;
  rows.sort((a, b) => {
    const byLevel = levelRank(b.level) - levelRank(a.level);
    if (byLevel !== 0) return byLevel;
    if (b.score !== a.score) return b.score - a.score;
    return a.foodName.localeCompare(b.foodName);
  });

  return rows;
}

/** The rows worth showing a parent — everything above 'none', worst first. */
export function selectSlippingSafeFoods(rows: SafeFoodRisk[]): SafeFoodRisk[] {
  return rows.filter((row) => row.level !== 'none');
}
