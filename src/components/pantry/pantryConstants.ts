import {
  Beef,
  Wheat,
  Milk,
  Apple,
  Leaf,
  Cookie,
  Package,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FoodCategory } from "@/types";

/**
 * Every category the pantry can display. `FoodCategory` is what the app
 * writes, but the column is free text in the database and the iOS app, a CSV
 * import or a catalog row can hand us anything, so a renderer that indexes
 * CATEGORY_CONFIG directly crashes the whole page on one odd row. Unknown
 * values display as "other".
 */
export type PantryCategoryKey = FoodCategory | "other";

export interface CategoryConfig {
  value: PantryCategoryKey;
  label: string;
  /** i18n key for `label`; render with t(labelKey, label). */
  labelKey: string;
  icon: LucideIcon;
  bgLight: string;
  bgDark: string;
  text: string;
  border: string;
  dot: string;
  pillActive: string;
  badgeBg: string;
  badgeText: string;
}

export const CATEGORY_CONFIG: Record<FoodCategory, CategoryConfig> = {
  protein: {
    value: "protein",
    labelKey: "pantry.item.category.protein",
    label: "Protein",
    icon: Beef,
    bgLight: "bg-red-50",
    bgDark: "dark:bg-red-950/20",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
    pillActive: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
    badgeBg: "bg-red-100 dark:bg-red-900/30",
    badgeText: "text-red-700 dark:text-red-400",
  },
  carb: {
    value: "carb",
    labelKey: "pantry.item.category.carb",
    label: "Carbs",
    icon: Wheat,
    bgLight: "bg-yellow-50",
    bgDark: "dark:bg-yellow-950/20",
    text: "text-yellow-700 dark:text-yellow-400",
    border: "border-yellow-200 dark:border-yellow-800",
    dot: "bg-yellow-500",
    pillActive: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700",
    badgeBg: "bg-yellow-100 dark:bg-yellow-900/30",
    badgeText: "text-yellow-700 dark:text-yellow-400",
  },
  dairy: {
    value: "dairy",
    labelKey: "pantry.item.category.dairy",
    label: "Dairy",
    icon: Milk,
    bgLight: "bg-blue-50",
    bgDark: "dark:bg-blue-950/20",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
    dot: "bg-blue-500",
    pillActive: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
    badgeBg: "bg-blue-100 dark:bg-blue-900/30",
    badgeText: "text-blue-700 dark:text-blue-400",
  },
  fruit: {
    value: "fruit",
    labelKey: "pantry.item.category.fruit",
    label: "Fruit",
    icon: Apple,
    bgLight: "bg-pink-50",
    bgDark: "dark:bg-pink-950/20",
    text: "text-pink-700 dark:text-pink-400",
    border: "border-pink-200 dark:border-pink-800",
    dot: "bg-pink-500",
    pillActive: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-700",
    badgeBg: "bg-pink-100 dark:bg-pink-900/30",
    badgeText: "text-pink-700 dark:text-pink-400",
  },
  vegetable: {
    value: "vegetable",
    labelKey: "pantry.item.category.vegetable",
    label: "Veggies",
    icon: Leaf,
    bgLight: "bg-emerald-50",
    bgDark: "dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
    pillActive: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
    badgeBg: "bg-emerald-100 dark:bg-emerald-900/30",
    badgeText: "text-emerald-700 dark:text-emerald-400",
  },
  snack: {
    value: "snack",
    labelKey: "pantry.item.category.snack",
    label: "Snacks",
    icon: Cookie,
    bgLight: "bg-purple-50",
    bgDark: "dark:bg-purple-950/20",
    text: "text-purple-700 dark:text-purple-400",
    border: "border-purple-200 dark:border-purple-800",
    dot: "bg-purple-500",
    pillActive: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700",
    badgeBg: "bg-purple-100 dark:bg-purple-900/30",
    badgeText: "text-purple-700 dark:text-purple-400",
  },
};

export const CATEGORY_ORDER: FoodCategory[] = [
  "protein",
  "carb",
  "dairy",
  "fruit",
  "vegetable",
  "snack",
];

/** Neutral config for a category the app does not know. Tokens only. */
export const OTHER_CATEGORY_CONFIG: CategoryConfig = {
  value: "other",
  labelKey: "pantry.item.category.other",
  label: "Other",
  icon: Package,
  bgLight: "bg-muted",
  bgDark: "",
  text: "text-muted-foreground",
  border: "border-border",
  dot: "bg-muted-foreground",
  pillActive: "bg-muted text-foreground border-border",
  badgeBg: "bg-muted",
  badgeText: "text-muted-foreground",
};

/** CATEGORY_ORDER with "other" last, for grouped views. */
export const PANTRY_DISPLAY_ORDER: PantryCategoryKey[] = [...CATEGORY_ORDER, "other"];

const isKnownCategory = (c: string): c is FoodCategory =>
  Object.prototype.hasOwnProperty.call(CATEGORY_CONFIG, c);

/** Map any stored category string onto one the pantry can display. */
export function toDisplayCategory(c: string | null | undefined): PantryCategoryKey {
  return typeof c === "string" && isKnownCategory(c) ? c : "other";
}

/** Safe lookup: never undefined, whatever the row holds. */
export function getCategoryConfig(c: string | null | undefined): CategoryConfig {
  const key = toDisplayCategory(c);
  return key === "other" ? OTHER_CATEGORY_CONFIG : CATEGORY_CONFIG[key];
}

export type SortOption = "name" | "low-stock" | "category" | "recent";
export type ViewMode = "grid" | "list";

export const LOW_STOCK_THRESHOLD = 2;

export function getStockStatus(quantity: number | undefined): "out" | "low" | "ok" {
  const qty = quantity ?? 0;
  // `<= 0`, not `=== 0`. The mobile pantry has its own copy of this logic in
  // src/lib/foodFilters.ts (foodStock), which has always used `<= 0`, so a
  // negative quantity read as "low" here and "out" there. The UI cannot
  // produce one -- both platforms clamp their decrement at zero -- but nothing
  // stops the iOS app, a bulk import or a direct edit, and there is no CHECK
  // constraint on the column. src/lib/foodFilters.test.ts pins the two
  // implementations to the same answers.
  if (qty <= 0) return "out";
  if (qty <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}

/**
 * Stock colours, as tokens. Low is a warning, out is destructive; `text` is
 * for the quantity figure and stays readable on the card surface.
 */
export const STOCK_TONE: Record<"low" | "out", { chip: string; surface: string; text: string; icon: string }> = {
  low: {
    chip: "border-warning/40 bg-warning/10 text-foreground",
    surface: "bg-warning/5",
    text: "text-foreground",
    icon: "text-warning",
  },
  out: {
    chip: "border-destructive/40 bg-destructive/10 text-foreground",
    surface: "bg-muted/40",
    text: "text-destructive",
    icon: "text-destructive",
  },
};

const round2 = (q: number): number => Math.round(q * 100) / 100;

/**
 * One step down on a stepper. Quantities can be fractional (half a bag), so
 * `q - 1` on 0.5 went to -0.5. Anything at or below one unit goes to zero.
 */
export function stepDown(q: number): number {
  return q > 1 ? round2(q - 1) : 0;
}

/** True when the next step down empties the item (0 < q <= 1). */
export function isLastUnit(q: number): boolean {
  return q > 0 && q <= 1;
}

/**
 * Parse a typed quantity. Returns null for anything that is not a finite,
 * non-negative number; otherwise the value rounded to two decimals.
 */
export function parseQuantityInput(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return round2(n);
}
