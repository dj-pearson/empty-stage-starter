/**
 * Aisle walk order for the grocery list, with no React in it.
 *
 * STORE_WALK_ORDER is ported from `storeWalkOrder` in
 * ios/EatPal/EatPal/Models/GroceryAisle.swift and keyed by the same raw values
 * as AISLE_DISPLAY_NAMES, so both clients walk a store the same way. Group
 * names on the page are display strings ("Meat & Deli"), raw values
 * ("meat_deli") or a custom store's own aisle names, so every lookup goes
 * through a normalised key.
 */
import type { Json } from "@/integrations/supabase/types";
import { AISLE_DISPLAY_NAMES } from "@/lib/effectiveFood";
import type { StoreAisleRow } from "@/lib/storeLayouts";
import { sortAislesByWalk } from "@/lib/storeLayouts";

export const STORE_WALK_ORDER: Readonly<Record<string, number>> = {
  produce: 10,
  bakery: 20,
  bread: 25,
  meat_deli: 30,
  seafood: 35,
  dairy: 40,
  eggs: 45,
  refrigerated: 50,
  frozen_meals: 60,
  frozen_veg: 65,
  frozen_treats: 70,
  breakfast: 80,
  pasta: 90,
  rice_grains: 95,
  canned: 100,
  dry_soups: 105,
  baking: 110,
  condiments: 115,
  snacks: 120,
  crackers: 125,
  candy: 130,
  ethnic_mexican: 140,
  ethnic_asian: 145,
  ethnic_european: 150,
  beverages: 160,
  alcohol: 165,
  household: 180,
  paper_goods: 185,
  cleaning: 190,
  personal_care: 195,
  baby: 200,
  pet: 205,
  other: 999,
};

/** The group name the page uses for items with no aisle. Always sorts last. */
export const UNCATEGORIZED = "Uncategorized";

/** Case-, space- and punctuation-insensitive key: "Meat & Deli" -> "meatdeli". */
export function normalizeAisleName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Display name (normalised) -> raw value, e.g. "canned goods" -> "canned". */
export const AISLE_DISPLAY_TO_RAW: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(AISLE_DISPLAY_NAMES).map(([raw, display]) => [normalizeAisleName(display), raw]),
);

const RAW_BY_NORMALIZED: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(STORE_WALK_ORDER).map((raw) => [normalizeAisleName(raw), raw]),
);

/** Resolve a display string or raw value to a GroceryAisle raw value. */
export function aisleRawValue(name: string): string | null {
  const key = normalizeAisleName(name);
  return RAW_BY_NORMALIZED[key] ?? AISLE_DISPLAY_TO_RAW[key] ?? null;
}

export function isUncategorized(name: string | null | undefined): boolean {
  return !name || normalizeAisleName(name) === normalizeAisleName(UNCATEGORIZED);
}

/**
 * What the sort needs to know about the list's store.
 *   custom  -> a household's store: its store_aisles rows, walked by sort_order.
 *   catalog -> a shared chain: aisle_overrides on top of the universal order.
 * A null context means "Typical store", the universal order alone.
 */
export type WalkOrderContext =
  | {
      kind: "custom";
      storeId: string;
      aisles: ReadonlyArray<Pick<StoreAisleRow, "id" | "aisle_name" | "aisle_number" | "sort_order">>;
    }
  | { kind: "catalog"; storeId: string; overrides: Readonly<Record<string, number>> };

/** Keep only finite numeric entries from the aisle_overrides JSONB. */
export function parseAisleOverrides(value: Json | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

/** Candidate keys a custom store's aisle name may match for this group name. */
function matchKeys(name: string): string[] {
  const keys = [normalizeAisleName(name)];
  const raw = aisleRawValue(name);
  if (raw) {
    keys.push(normalizeAisleName(raw));
    const display = AISLE_DISPLAY_NAMES[raw];
    if (display) keys.push(normalizeAisleName(display));
  }
  return keys;
}

function findCustomAisle<A extends Pick<StoreAisleRow, "aisle_name">>(
  name: string,
  aisles: ReadonlyArray<A>,
): A | undefined {
  const keys = matchKeys(name);
  return aisles.find((a) => keys.includes(normalizeAisleName(a.aisle_name)));
}

function universalRank(name: string): number | null {
  const raw = aisleRawValue(name);
  return raw ? STORE_WALK_ORDER[raw] : null;
}

/** The primary rank of a group name under ctx, or null when it does not match. */
function rankOf(name: string, ctx: WalkOrderContext | null): number | null {
  if (!ctx) return universalRank(name);
  if (ctx.kind === "catalog") {
    const raw = aisleRawValue(name);
    if (!raw) return null;
    return ctx.overrides[raw] ?? STORE_WALK_ORDER[raw];
  }
  const aisle = findCustomAisle(name, ctx.aisles);
  return aisle ? aisle.sort_order : null;
}

/**
 * Sort group names into the order a shopper walks the store.
 *
 * Matched names come first, by rank. Unmatched names follow, in universal
 * order where they have one (so a half-mapped custom store still walks sensibly),
 * and Uncategorized is always last. Ties break by name.
 */
export function sortAisleGroupNames(names: string[], ctx: WalkOrderContext | null): string[] {
  const decorated = names.map((name) => ({
    name,
    uncategorized: isUncategorized(name),
    rank: rankOf(name, ctx),
    fallback: universalRank(name),
  }));
  decorated.sort((a, b) => {
    if (a.uncategorized !== b.uncategorized) return a.uncategorized ? 1 : -1;
    const aMatched = a.rank !== null;
    const bMatched = b.rank !== null;
    if (aMatched !== bMatched) return aMatched ? -1 : 1;
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank;
    const af = a.fallback ?? Number.POSITIVE_INFINITY;
    const bf = b.fallback ?? Number.POSITIVE_INFINITY;
    if (af !== bf) return af < bf ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return decorated.map((d) => d.name);
}

export interface AislePosition {
  /** The store's own aisle number, when a custom store has one. */
  aisleNumber: string | null;
  /** Zero-based position in the store's walk. */
  index: number;
  /** How many aisles the walk has. */
  total: number;
}

/**
 * Where a group sits in the walk, for a "3 of 12" hint. Null for
 * Uncategorized and for names the context cannot place.
 */
export function aislePosition(name: string, ctx: WalkOrderContext | null): AislePosition | null {
  if (isUncategorized(name)) return null;
  if (ctx?.kind === "custom") {
    const walk = sortAislesByWalk(ctx.aisles);
    const aisle = findCustomAisle(name, walk);
    if (!aisle) return null;
    return { aisleNumber: aisle.aisle_number?.trim() || null, index: walk.indexOf(aisle), total: walk.length };
  }
  const raw = aisleRawValue(name);
  if (!raw) return null;
  const order = (r: string) =>
    ctx?.kind === "catalog" ? (ctx.overrides[r] ?? STORE_WALK_ORDER[r]) : STORE_WALK_ORDER[r];
  const walk = Object.keys(STORE_WALK_ORDER).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  return { aisleNumber: null, index: walk.indexOf(raw), total: walk.length };
}

/**
 * True when the list's store has its own aisles and this item's aisle is not
 * one of them -- the case where asking "which aisle?" helps. A catalog chain
 * or the typical store can place any known aisle, and a store with no aisles
 * yet has nothing to offer, so both answer false.
 */
export function isUnplaced(aisle: string | null | undefined, ctx: WalkOrderContext | null): boolean {
  if (!ctx || ctx.kind !== "custom" || ctx.aisles.length === 0) return false;
  if (isUncategorized(aisle)) return true;
  return !findCustomAisle(aisle ?? "", ctx.aisles);
}

/**
 * The universal aisles in walk order, as display names, for seeding a new
 * custom store. "Other" is left out: it is a catch-all, not a place.
 */
export function typicalStoreAisleNames(): string[] {
  return Object.keys(STORE_WALK_ORDER)
    .filter((raw) => raw !== "other")
    .sort((a, b) => STORE_WALK_ORDER[a] - STORE_WALK_ORDER[b])
    .map((raw) => AISLE_DISPLAY_NAMES[raw] ?? raw);
}
