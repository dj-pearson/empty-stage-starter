/**
 * Shared look for recipe cards and list rows: difficulty, stars, favorite,
 * image overlays and the stock line. Semantic tokens only.
 *
 * `variant="destructive"` is reserved for allergens. A missing ingredient is a
 * shopping errand, not a danger, so the stock line is a muted outline.
 */
import type { TFunction } from "i18next";
import type { Recipe } from "@/types";

export type DifficultyLevel = "easy" | "medium" | "hard";

export const DIFFICULTY_TONE: Record<DifficultyLevel, string> = {
  easy: "border-safe-food/30 bg-safe-food/10 text-safe-food",
  medium: "border-warning/40 bg-warning/15 text-foreground",
  hard: "border-destructive/30 bg-destructive/10 text-destructive",
};

const DIFFICULTY_DEFAULT: Record<DifficultyLevel, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export function isDifficulty(value: unknown): value is DifficultyLevel {
  return value === "easy" || value === "medium" || value === "hard";
}

export function difficultyLabel(t: TFunction, level: DifficultyLevel): string {
  return t(`recipes.difficulty.${level}`, { defaultValue: DIFFICULTY_DEFAULT[level] });
}

/** Rating star. */
export const STAR_CLASS = "fill-warning text-warning";

/** Favorite heart; always paired with an aria-label where it renders. */
export const FAVORITE_CLASS = "fill-primary text-primary";

/** Chips laid over a recipe photo. */
export const IMAGE_OVERLAY_CLASS = "bg-background/85 text-foreground backdrop-blur-sm";

/** "N to buy" line: muted outline plus a Package icon. Never destructive. */
export const STOCK_CLASS = "border-border bg-transparent text-muted-foreground";

/** Minutes for a recipe: total_time_minutes, else prep + cook. */
export function recipeTotalMinutes(
  recipe: Pick<Recipe, "total_time_minutes" | "prepTime" | "cookTime">,
): number {
  if (recipe.total_time_minutes && recipe.total_time_minutes > 0) return recipe.total_time_minutes;
  const prep = parseInt(recipe.prepTime || "0", 10);
  const cook = parseInt(recipe.cookTime || "0", 10);
  return (Number.isFinite(prep) ? prep : 0) + (Number.isFinite(cook) ? cook : 0);
}

const minuteFormatters = new Map<string, Intl.NumberFormat>();

/** "25 min" in the active locale. */
export function formatMinutes(minutes: number, locale?: string): string {
  const key = locale ?? "";
  let fmt = minuteFormatters.get(key);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(locale || undefined, {
        style: "unit",
        unit: "minute",
        unitDisplay: "short",
      });
    } catch {
      fmt = new Intl.NumberFormat(undefined, { style: "unit", unit: "minute", unitDisplay: "short" });
    }
    minuteFormatters.set(key, fmt);
  }
  return fmt.format(minutes);
}
