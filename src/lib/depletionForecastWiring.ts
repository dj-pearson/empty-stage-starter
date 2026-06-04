/**
 * US-299 wiring helpers for `forecastRunOutDate`.
 *
 * The pure forecast utility (./depletionForecast.ts) is data-source-agnostic
 * — it takes a list of restock timestamps and a current pantry quantity.
 * The web client doesn't yet ship the iOS `user_product_preferences.add_history`
 * column over the typed Supabase client, so we derive an equivalent history
 * from data we already have loaded in AppContext: each time a grocery_items
 * row was created with a matching (lowercased) name, we treat that as a
 * restock event.
 *
 * This is intentionally a smaller surface than the iOS add_history (no
 * per-cycle qty) but it's enough to drive the same chip UI the AC requires
 * with zero new DB reads. When the typed client exposes `add_history`
 * later, the chip code just swaps which array it passes to
 * `forecastRunOutDate`.
 */
import type { Food, GroceryItem } from '@/types';
import {
  forecastRunOutDate,
  type DepletionForecast,
  type ForecastOptions,
} from './depletionForecast';

/**
 * Normalise a product name to the same shape iOS uses for catalog lookup
 * (lowercased, trimmed, single-spaced). Exported so tests can lock the
 * contract.
 */
export function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Walk the in-memory grocery_items list and return ascending `created_at`
 * timestamps for every row whose name matches (case-insensitive, whitespace-
 * normalised) the given food name.
 *
 * Rows with a missing/invalid `created_at` are dropped silently — they'd
 * poison the median if treated as Unix epoch.
 */
export function restockHistoryFromGroceryItems(
  foodName: string,
  groceryItems: ReadonlyArray<Pick<GroceryItem, 'name' | 'created_at'>>
): Date[] {
  const target = normalizeProductName(foodName);
  const out: Date[] = [];
  for (const item of groceryItems) {
    if (!item || !item.name) continue;
    if (normalizeProductName(item.name) !== target) continue;
    const raw = item.created_at;
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    out.push(d);
  }
  out.sort((a, b) => a.getTime() - b.getTime());
  return out;
}

/**
 * Coarse "is this food in its seasonal window?" check. We don't have a
 * tags/seasonal column in the typed schema yet, so this looks at the food
 * name for a small list of strongly-seasonal items and the current month.
 * Returns true when the food is OUT OF its active window — i.e. when the
 * forecast should be down-weighted to 'low'.
 *
 * Conservative by design: items not in the list always return false (= in
 * window) so we never falsely suppress a forecast. Pull this into a real
 * `foods.tags` lookup once the column lands.
 */
const SEASONAL_WINDOWS: Array<{ match: RegExp; activeMonths: number[] }> = [
  { match: /watermelon|cantaloupe|honeydew/i, activeMonths: [5, 6, 7, 8] },
  { match: /pumpkin|butternut|acorn squash/i, activeMonths: [9, 10, 11] },
  { match: /strawberr/i, activeMonths: [3, 4, 5, 6] },
  { match: /asparagus/i, activeMonths: [3, 4, 5] },
  { match: /corn on the cob|sweet corn/i, activeMonths: [6, 7, 8] },
];

export function isFoodSeasonalOutOfWindow(
  food: Pick<Food, 'name'>,
  asOf: Date = new Date()
): boolean {
  const month = asOf.getMonth() + 1; // 1..12
  for (const { match, activeMonths } of SEASONAL_WINDOWS) {
    if (match.test(food.name)) return !activeMonths.includes(month);
  }
  return false;
}

/**
 * One-stop convenience: given a food (with current pantry qty) and the
 * complete loaded `groceryItems` array, produce a forecast ready to render.
 * Returns null when the food doesn't carry a `quantity` (we can't forecast
 * what we can't count) — callers should skip the chip in that case.
 */
export function forecastForFood(
  food: Pick<Food, 'id' | 'name' | 'quantity'>,
  groceryItems: ReadonlyArray<Pick<GroceryItem, 'name' | 'created_at'>>,
  opts: ForecastOptions = {}
): DepletionForecast | null {
  if (food.quantity == null) return null;
  const history = restockHistoryFromGroceryItems(food.name, groceryItems);
  const seasonalOutOfWindow =
    opts.seasonalOutOfWindow ?? isFoodSeasonalOutOfWindow(food, opts.asOf);
  return forecastRunOutDate(history, food.quantity, {
    ...opts,
    seasonalOutOfWindow,
  });
}
