/**
 * How a recipe collection looks: its icon and its color tone.
 *
 * The stored `icon` and `color` strings on recipe_collections are unchanged
 * (older iOS builds read and write the same keys), so this file only maps
 * those keys onto lucide icons and semantic design tokens. Nothing here is a
 * raw palette class: "green" renders as the safe-food token, "red" as
 * destructive, and so on, so dark mode and the high-contrast theme follow.
 *
 * Every collection component (selector, manage, add-to, create) imports from
 * here instead of keeping its own copy of the maps.
 */
import type { LucideIcon } from "lucide-react";
import { Clock, Folder, Heart, Pizza, Sparkles, Star, Users, Zap } from "lucide-react";

export const COLLECTION_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  star: Star,
  heart: Heart,
  zap: Zap,
  pizza: Pizza,
  clock: Clock,
  users: Users,
  sparkles: Sparkles,
};

export interface CollectionIconOption {
  value: string;
  icon: LucideIcon;
  /** i18n key under recipes.collections.icon.* */
  labelKey: string;
  label: string;
}

export const COLLECTION_ICON_OPTIONS: CollectionIconOption[] = [
  { value: "folder", icon: Folder, labelKey: "folder", label: "Folder" },
  { value: "star", icon: Star, labelKey: "star", label: "Favorites" },
  { value: "heart", icon: Heart, labelKey: "heart", label: "Love" },
  { value: "zap", icon: Zap, labelKey: "zap", label: "Quick" },
  { value: "pizza", icon: Pizza, labelKey: "pizza", label: "Pizza" },
  { value: "clock", icon: Clock, labelKey: "clock", label: "Weeknight" },
  { value: "users", icon: Users, labelKey: "users", label: "Family" },
  { value: "sparkles", icon: Sparkles, labelKey: "sparkles", label: "Special" },
];

export interface CollectionTone {
  /** Icon/text color. */
  text: string;
  /** Soft fill for a swatch or selected chip. */
  soft: string;
  /** Solid swatch fill. */
  swatch: string;
  /** English label; rendered through t('recipes.collections.color.<key>'). */
  label: string;
}

/**
 * Stored color key -> semantic token. The keys are what the database holds and
 * must stay as they are. The labels describe what the token looks like now,
 * which is why "primary" reads "Primary" rather than the old "Blue" (the brand
 * primary is not blue) and "purple" reads "Leaf" (it maps to secondary).
 */
export const COLLECTION_TONES: Record<string, CollectionTone> = {
  primary: { text: "text-primary", soft: "bg-primary/10", swatch: "bg-primary", label: "Primary" },
  green: { text: "text-safe-food", soft: "bg-safe-food/10", swatch: "bg-safe-food", label: "Green" },
  red: { text: "text-destructive", soft: "bg-destructive/10", swatch: "bg-destructive", label: "Red" },
  yellow: { text: "text-warning", soft: "bg-warning/15", swatch: "bg-warning", label: "Yellow" },
  purple: { text: "text-secondary", soft: "bg-secondary/10", swatch: "bg-secondary", label: "Leaf" },
  pink: { text: "text-accent", soft: "bg-accent/10", swatch: "bg-accent", label: "Pink" },
  orange: { text: "text-try-bite", soft: "bg-try-bite/10", swatch: "bg-try-bite", label: "Orange" },
  gray: { text: "text-muted-foreground", soft: "bg-muted", swatch: "bg-muted-foreground", label: "Gray" },
};

export const COLLECTION_TONE_KEYS = Object.keys(COLLECTION_TONES);

export const DEFAULT_COLLECTION_ICON = "folder";
export const DEFAULT_COLLECTION_COLOR = "primary";

export function collectionIcon(key: string | null | undefined): LucideIcon {
  return (key && COLLECTION_ICONS[key]) || Folder;
}

export function collectionTone(key: string | null | undefined): CollectionTone {
  return (key && COLLECTION_TONES[key]) || COLLECTION_TONES[DEFAULT_COLLECTION_COLOR];
}
