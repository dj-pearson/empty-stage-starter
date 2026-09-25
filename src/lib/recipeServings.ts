/**
 * Recipe serving counts, parsed once so every screen scales the same way.
 *
 * `recipe.servings` is free text from the builder or an import: "4",
 * "Serves 4", "4-6 servings", "makes 12". parseInt("Serves 4") is NaN, and
 * that NaN used to reach the scaled quantities and the nutrition divisor.
 */

export const DEFAULT_SERVINGS = 4;
export const MIN_TARGET_SERVINGS = 1;
export const MAX_TARGET_SERVINGS = 24;

/**
 * The first positive number in `value`, rounded to a whole serving. A range
 * ("4-6") takes its lower end. Anything without a usable number gives
 * `fallback`.
 */
export function parseBaseServings(
  value: string | number | null | undefined,
  fallback: number = DEFAULT_SERVINGS,
): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : fallback;
  }
  if (!value) return fallback;
  const match = String(value).match(/\d+(?:[.,]\d+)?/);
  if (!match) return fallback;
  const n = parseFloat(match[0].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.round(n));
}

/** Keep a target serving count inside the stepper's range. */
export function clampTargetServings(n: number): number {
  if (!Number.isFinite(n)) return MIN_TARGET_SERVINGS;
  return Math.min(MAX_TARGET_SERVINGS, Math.max(MIN_TARGET_SERVINGS, Math.round(n)));
}

/** Multiplier from the recipe's own yield to the target. Never NaN or 0. */
export function servingScale(target: number, base: number): number {
  if (!Number.isFinite(target) || !Number.isFinite(base) || base <= 0 || target <= 0) return 1;
  return target / base;
}
