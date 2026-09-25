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
  /** Soft tint surface (section header). */
  bgLight: string;
  /** Kept for old callers; the tokens carry their own dark values now. */
  bgDark: string;
  /** The category colour as text; reads on card, background and the tint. */
  text: string;
  border: string;
  /** Solid fill: the dot and the icon tile. */
  dot: string;
  /** Text or an icon drawn on `dot`. */
  iconOnDot: string;
  pillActive: string;
  pillInactive: string;
  badgeBg: string;
  badgeText: string;
}

/**
 * Item 24: every class here is a semantic category token (--cat-* in
 * src/index.css, mapped in tailwind.config.ts), light and dark in one class,
 * so there is no raw palette class left to drift out of contrast. Written out
 * in full because Tailwind only generates classes it can read literally.
 */
export const CATEGORY_CONFIG: Record<FoodCategory, CategoryConfig> = {
  protein: {
    value: "protein",
    labelKey: "pantry.item.category.protein",
    label: "Protein",
    icon: Beef,
    bgLight: "bg-cat-protein-soft",
    bgDark: "",
    text: "text-cat-protein",
    border: "border-cat-protein/30",
    dot: "bg-cat-protein",
    iconOnDot: "text-cat-protein-foreground",
    pillActive: "bg-cat-protein text-cat-protein-foreground border-cat-protein",
    pillInactive: "bg-cat-protein-soft text-cat-protein border-cat-protein/30",
    badgeBg: "bg-cat-protein-soft",
    badgeText: "text-cat-protein",
  },
  carb: {
    value: "carb",
    labelKey: "pantry.item.category.carb",
    label: "Carbs",
    icon: Wheat,
    bgLight: "bg-cat-carb-soft",
    bgDark: "",
    text: "text-cat-carb",
    border: "border-cat-carb/30",
    dot: "bg-cat-carb",
    iconOnDot: "text-cat-carb-foreground",
    pillActive: "bg-cat-carb text-cat-carb-foreground border-cat-carb",
    pillInactive: "bg-cat-carb-soft text-cat-carb border-cat-carb/30",
    badgeBg: "bg-cat-carb-soft",
    badgeText: "text-cat-carb",
  },
  dairy: {
    value: "dairy",
    labelKey: "pantry.item.category.dairy",
    label: "Dairy",
    icon: Milk,
    bgLight: "bg-cat-dairy-soft",
    bgDark: "",
    text: "text-cat-dairy",
    border: "border-cat-dairy/30",
    dot: "bg-cat-dairy",
    iconOnDot: "text-cat-dairy-foreground",
    pillActive: "bg-cat-dairy text-cat-dairy-foreground border-cat-dairy",
    pillInactive: "bg-cat-dairy-soft text-cat-dairy border-cat-dairy/30",
    badgeBg: "bg-cat-dairy-soft",
    badgeText: "text-cat-dairy",
  },
  fruit: {
    value: "fruit",
    labelKey: "pantry.item.category.fruit",
    label: "Fruit",
    icon: Apple,
    bgLight: "bg-cat-fruit-soft",
    bgDark: "",
    text: "text-cat-fruit",
    border: "border-cat-fruit/30",
    dot: "bg-cat-fruit",
    iconOnDot: "text-cat-fruit-foreground",
    pillActive: "bg-cat-fruit text-cat-fruit-foreground border-cat-fruit",
    pillInactive: "bg-cat-fruit-soft text-cat-fruit border-cat-fruit/30",
    badgeBg: "bg-cat-fruit-soft",
    badgeText: "text-cat-fruit",
  },
  vegetable: {
    value: "vegetable",
    labelKey: "pantry.item.category.vegetable",
    label: "Veggies",
    icon: Leaf,
    bgLight: "bg-cat-vegetable-soft",
    bgDark: "",
    text: "text-cat-vegetable",
    border: "border-cat-vegetable/30",
    dot: "bg-cat-vegetable",
    iconOnDot: "text-cat-vegetable-foreground",
    pillActive: "bg-cat-vegetable text-cat-vegetable-foreground border-cat-vegetable",
    pillInactive: "bg-cat-vegetable-soft text-cat-vegetable border-cat-vegetable/30",
    badgeBg: "bg-cat-vegetable-soft",
    badgeText: "text-cat-vegetable",
  },
  snack: {
    value: "snack",
    labelKey: "pantry.item.category.snack",
    label: "Snacks",
    icon: Cookie,
    bgLight: "bg-cat-snack-soft",
    bgDark: "",
    text: "text-cat-snack",
    border: "border-cat-snack/30",
    dot: "bg-cat-snack",
    iconOnDot: "text-cat-snack-foreground",
    pillActive: "bg-cat-snack text-cat-snack-foreground border-cat-snack",
    pillInactive: "bg-cat-snack-soft text-cat-snack border-cat-snack/30",
    badgeBg: "bg-cat-snack-soft",
    badgeText: "text-cat-snack",
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

/** Config for a category the app does not know: the slate "other" token. */
export const OTHER_CATEGORY_CONFIG: CategoryConfig = {
  value: "other",
  labelKey: "pantry.item.category.other",
  label: "Other",
  icon: Package,
  bgLight: "bg-cat-other-soft",
  bgDark: "",
  text: "text-cat-other",
  border: "border-cat-other/30",
  dot: "bg-cat-other",
  iconOnDot: "text-cat-other-foreground",
  pillActive: "bg-cat-other text-cat-other-foreground border-cat-other",
  pillInactive: "bg-cat-other-soft text-cat-other border-cat-other/30",
  badgeBg: "bg-cat-other-soft",
  badgeText: "text-cat-other",
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
