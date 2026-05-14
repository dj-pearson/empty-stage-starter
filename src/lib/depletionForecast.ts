/**
 * Predictive pantry depletion forecasting (US-299).
 *
 * Pure module. Given a per-product restock timeline (the `add_history`
 * JSONB array stored on `user_product_preferences`, US-276) and the
 * current pantry quantity, compute when the item is likely to run out and
 * how much confidence we have in that estimate.
 *
 * Why velocity-based instead of threshold-based:
 * --------------------------------------------
 * The pre-existing `detect_restock_needs` RPC is threshold-based — it
 * fires "you have <= 2 of X" regardless of how fast the household goes
 * through X. A family that eats eggs daily vs once a month hits the
 * threshold for the same reason, but their actual run-out date is
 * weeks apart. Velocity respects the actual consumption rate so the
 * forecast can say "runs out Thursday" instead of just "low stock".
 *
 * Schema reality check:
 * --------------------
 * The shipped schema (`user_product_preferences.add_history`) stores
 * only timestamps — not per-restock quantity. So our velocity model
 * computes daily consumption as the inverse of the median
 * inter-restock interval (`dailyConsumption = median(1 / daysBetween)`).
 * This assumes "1 restock unit per cycle"; when per-cycle quantities
 * become available the formula generalises to
 * `median(qtyAdded / daysBetween)` with no API change.
 */

export type ForecastConfidence = 'cold-start' | 'low' | 'medium' | 'high';

export interface DepletionForecast {
  /** Calendar date the pantry stock is projected to reach zero. */
  runOutDate: Date;
  /** runOutDate - now, in whole days (rounded down; never negative). */
  daysToDepletion: number;
  /** How much weight callers should give this forecast. */
  confidence: ForecastConfidence;
  /** Inferred daily consumption used to make the forecast. Surfaced for
   *  tooling/UI ("at this pace") and for telemetry / unit tests. */
  dailyConsumption: number;
  /** Number of inter-restock cycles the velocity was derived from.
   *  0 for cold-start, 1 when only one cycle is computable, etc. */
  cycleCount: number;
}

export interface ForecastOptions {
  /** Override "now" for tests + UI snapshots. */
  asOf?: Date;
  /** Daily consumption to fall back on when cold-start. Typically the
   *  category-level household median (or platform median). Defaults to
   *  1/14 (one unit every two weeks) — a conservative-leaning default
   *  so cold-start items don't burst-add to the grocery list. */
  coldStartDailyConsumption?: number;
  /** "Seasonal" foods (e.g. watermelon) are forecast-unfit outside
   *  their active window. When true, the function returns confidence
   *  'low' regardless of cycle count so callers can suppress auto-add
   *  per AC. Defaults to false. */
  seasonalOutOfWindow?: boolean;
  /** Minimum cycle count to reach 'high' confidence. AC default = 5. */
  highConfidenceMinCycles?: number;
  /** Max stddev/median ratio that still qualifies for 'high'. AC=0.3. */
  highConfidenceMaxCv?: number;
}

const DEFAULTS = {
  coldStartDailyConsumption: 1 / 14,
  highConfidenceMinCycles: 5,
  highConfidenceMaxCv: 0.3,
} as const;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Public helper: coerce a string|number|Date into a Date, or return
 *  null when the input is unparseable. Reject null/undefined explicitly
 *  because `new Date(null)` silently returns the Unix epoch — that
 *  would poison the cadence median when a JSONB column contains a
 *  null entry. */
export function toDate(input: string | number | Date | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'number' && !Number.isFinite(input)) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Forecast the run-out date for a single pantry food.
 *
 * @param restockHistory  Ordered or unordered list of restock timestamps
 *                        (newest or oldest first — the function sorts).
 *                        Must contain at least 2 entries to compute a
 *                        cycle; fewer → cold-start fallback.
 * @param currentPantryQty  Whatever unit the household uses on the food
 *                          row (servings, ounces, count). Treated as
 *                          opaque — the forecast scales linearly with
 *                          this number.
 * @param opts  See `ForecastOptions`. The `asOf` / cold-start /
 *              seasonal-clamp escape hatches live here.
 */
export function forecastRunOutDate(
  restockHistory: ReadonlyArray<string | number | Date>,
  currentPantryQty: number,
  opts: ForecastOptions = {}
): DepletionForecast {
  const asOf = opts.asOf ?? new Date();
  const coldStart = opts.coldStartDailyConsumption ?? DEFAULTS.coldStartDailyConsumption;
  const minCyclesForHigh = opts.highConfidenceMinCycles ?? DEFAULTS.highConfidenceMinCycles;
  const maxCv = opts.highConfidenceMaxCv ?? DEFAULTS.highConfidenceMaxCv;

  // Parse + sort ascending. Filter out invalid timestamps so a stray
  // null in the JSONB array doesn't poison the median.
  const sortedDates: Date[] = [];
  for (const raw of restockHistory) {
    const d = toDate(raw);
    if (d) sortedDates.push(d);
  }
  sortedDates.sort((a, b) => a.getTime() - b.getTime());

  // Compute inter-restock intervals in days. We use only the most recent
  // 5 cycles per AC ("median over last 5 restock cycles").
  const intervalsDesc: number[] = [];
  for (let i = sortedDates.length - 1; i > 0 && intervalsDesc.length < 5; i--) {
    const deltaMs = sortedDates[i].getTime() - sortedDates[i - 1].getTime();
    const days = deltaMs / MS_PER_DAY;
    if (days > 0) intervalsDesc.push(days);
  }
  const cycleCount = intervalsDesc.length;

  // Cold-start: fewer than 2 cycles. Fall back to the category-level
  // mean the caller supplies (or our conservative default).
  if (cycleCount < 2) {
    const dailyConsumption = coldStart > 0 ? coldStart : DEFAULTS.coldStartDailyConsumption;
    const days = currentPantryQty > 0 ? currentPantryQty / dailyConsumption : 0;
    return {
      runOutDate: addDays(asOf, days),
      daysToDepletion: Math.max(0, Math.floor(days)),
      confidence: cycleCount === 0 && currentPantryQty <= 0 ? 'cold-start' :
                  opts.seasonalOutOfWindow ? 'low' : 'cold-start',
      dailyConsumption,
      cycleCount,
    };
  }

  // Velocity model: median over the cycle window, inverted to "units per
  // day". When per-cycle quantities become available, replace 1 with the
  // qtyAdded for that cycle and the rest of the formula stays the same.
  const perDayRates = intervalsDesc.map((days) => 1 / days);
  const dailyConsumption = median(perDayRates);

  // Confidence:
  //   high: >=5 cycles AND coefficient of variation < 0.3
  //   medium: 3-4 cycles
  //   low: 2 cycles
  // Seasonal clamp downgrades to 'low' regardless.
  let confidence: ForecastConfidence;
  if (opts.seasonalOutOfWindow) {
    confidence = 'low';
  } else if (cycleCount >= minCyclesForHigh && cv(perDayRates) < maxCv) {
    confidence = 'high';
  } else if (cycleCount >= 3) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  const daysToDepletion = currentPantryQty > 0 && dailyConsumption > 0
    ? Math.max(0, Math.floor(currentPantryQty / dailyConsumption))
    : 0;

  return {
    runOutDate: addDays(asOf, daysToDepletion),
    daysToDepletion,
    confidence,
    dailyConsumption,
    cycleCount,
  };
}

/** Median of a non-empty array. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Coefficient of variation: stddev / mean. Used as the spread metric
 *  for confidence tiering — stable cadences produce a low CV. */
function cv(values: number[]): number {
  if (values.length === 0) return Infinity;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return Infinity;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return std / mean;
}

function addDays(base: Date, days: number): Date {
  const out = new Date(base);
  out.setTime(out.getTime() + days * MS_PER_DAY);
  return out;
}

/**
 * UI-friendly bucket for the chip color in SmartRestockSuggestions.
 * Mirrors the AC's color coding (red <=2 days, amber 3-7, gray 8+).
 */
export type UrgencyBucket = 'critical' | 'soon' | 'later';

export function urgencyBucket(daysToDepletion: number): UrgencyBucket {
  if (daysToDepletion <= 2) return 'critical';
  if (daysToDepletion <= 7) return 'soon';
  return 'later';
}

/**
 * Short human label for the chip. AC examples: "Runs out Thu",
 * "Runs out in 3 days", "Runs out next week". We render the weekday
 * name for 3..7 day forecasts so it lands as a concrete moment in the
 * user's head, and fall back to "in N days" / "next week" outside that
 * range.
 */
export function chipLabel(daysToDepletion: number, asOf: Date = new Date()): string {
  if (daysToDepletion <= 0) return 'Out today';
  if (daysToDepletion === 1) return 'Out tomorrow';
  if (daysToDepletion === 2) return 'Out in 2 days';
  if (daysToDepletion <= 7) {
    const target = new Date(asOf);
    target.setDate(target.getDate() + daysToDepletion);
    const weekday = target.toLocaleDateString(undefined, { weekday: 'short' });
    return `Runs out ${weekday}`;
  }
  if (daysToDepletion <= 14) return 'Runs out next week';
  return `Runs out in ${daysToDepletion} days`;
}
