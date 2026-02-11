import {
  Beef,
  Wheat,
  Milk,
  Apple,
  Leaf,
  Cookie,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FoodCategory } from "@/types";

export interface CategoryConfig {
  value: FoodCategory;
  label: string;
  icon: LucideIcon;
  bgLight: string;
  bgDark: string;
  text: string;
  border: string;
  borderLeft: string;
  dot: string;
  pillActive: string;
  badgeBg: string;
  badgeText: string;
}

export const CATEGORY_CONFIG: Record<FoodCategory, CategoryConfig> = {
  protein: {
    value: "protein",
    label: "Protein",
    icon: Beef,
    bgLight: "bg-red-50",
    bgDark: "dark:bg-red-950/20",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
    borderLeft: "border-l-red-500",
    dot: "bg-red-500",
    pillActive: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
    badgeBg: "bg-red-100 dark:bg-red-900/30",
    badgeText: "text-red-700 dark:text-red-400",
  },
  carb: {
    value: "carb",
    label: "Carbs",
    icon: Wheat,
    bgLight: "bg-amber-50",
    bgDark: "dark:bg-amber-950/20",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
    borderLeft: "border-l-amber-500",
    dot: "bg-amber-500",
    pillActive: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
    badgeBg: "bg-amber-100 dark:bg-amber-900/30",
    badgeText: "text-amber-700 dark:text-amber-400",
  },
  dairy: {
    value: "dairy",
    label: "Dairy",
    icon: Milk,
    bgLight: "bg-blue-50",
    bgDark: "dark:bg-blue-950/20",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
    borderLeft: "border-l-blue-500",
    dot: "bg-blue-500",
    pillActive: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
    badgeBg: "bg-blue-100 dark:bg-blue-900/30",
    badgeText: "text-blue-700 dark:text-blue-400",
  },
  fruit: {
    value: "fruit",
    label: "Fruit",
    icon: Apple,
    bgLight: "bg-pink-50",
    bgDark: "dark:bg-pink-950/20",
    text: "text-pink-700 dark:text-pink-400",
    border: "border-pink-200 dark:border-pink-800",
    borderLeft: "border-l-pink-500",
    dot: "bg-pink-500",
    pillActive: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-700",
    badgeBg: "bg-pink-100 dark:bg-pink-900/30",
    badgeText: "text-pink-700 dark:text-pink-400",
  },
  vegetable: {
    value: "vegetable",
    label: "Veggies",
    icon: Leaf,
    bgLight: "bg-emerald-50",
    bgDark: "dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-800",
    borderLeft: "border-l-emerald-500",
    dot: "bg-emerald-500",
    pillActive: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
    badgeBg: "bg-emerald-100 dark:bg-emerald-900/30",
    badgeText: "text-emerald-700 dark:text-emerald-400",
  },
  snack: {
    value: "snack",
    label: "Snacks",
    icon: Cookie,
    bgLight: "bg-purple-50",
    bgDark: "dark:bg-purple-950/20",
    text: "text-purple-700 dark:text-purple-400",
    border: "border-purple-200 dark:border-purple-800",
    borderLeft: "border-l-purple-500",
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

export type SortOption = "name" | "low-stock" | "category" | "recent";
export type ViewMode = "grid" | "list";

export const LOW_STOCK_THRESHOLD = 2;

export function getStockStatus(quantity: number | undefined): "out" | "low" | "ok" {
  const qty = quantity ?? 0;
  if (qty === 0) return "out";
  if (qty <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}
