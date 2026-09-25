import type { Database } from "@/integrations/supabase/types";

/**
 * Store layouts, typed from the generated schema instead of the three
 * hand-written `StoreLayout` interfaces the dialogs used to carry (each one a
 * slightly different guess, bridged with `as unknown as`).
 *
 * The table holds two kinds of row (see 20260601000001_store_layouts_ios_reconcile.sql):
 *   - catalog chains: household_id AND user_id null, walk order in the
 *     `aisle_overrides` JSONB (iOS US-275), read-only for everyone;
 *   - custom stores: owned by a household, walk order in the `store_aisles`
 *     child table.
 */
export type StoreLayoutRow = Database["public"]["Tables"]["store_layouts"]["Row"];
export type StoreLayoutInsert = Database["public"]["Tables"]["store_layouts"]["Insert"];
export type StoreAisleRow = Database["public"]["Tables"]["store_aisles"]["Row"];
export type StoreAisleInsert = Database["public"]["Tables"]["store_aisles"]["Insert"];
export type FoodAisleMappingInsert = Database["public"]["Tables"]["food_aisle_mappings"]["Insert"];

/** A store_layouts row with its aisles embedded by one PostgREST select. */
export type StoreLayoutWithAisles = StoreLayoutRow & { store_aisles: StoreAisleRow[] | null };

/**
 * The name to show for a store. The web schema writes `store_name`, iOS writes
 * `name`, and a trigger copies each into the other -- but rows that predate
 * the trigger can still hold only one of them.
 */
export function storeDisplayName(row: Pick<StoreLayoutRow, "name" | "store_name">): string {
  return row.store_name?.trim() || row.name?.trim() || "";
}

/** A shared chain from the catalog, which no household owns or may edit. */
export function isCatalogStore(row: Pick<StoreLayoutRow, "household_id" | "user_id">): boolean {
  return row.household_id === null && row.user_id === null;
}

/** Aisles in walk order: sort_order, then name so equal orders are stable. */
export function sortAislesByWalk<T extends Pick<StoreAisleRow, "sort_order" | "aisle_name">>(
  aisles: ReadonlyArray<T>,
): T[] {
  return [...aisles].sort(
    (a, b) => a.sort_order - b.sort_order || a.aisle_name.localeCompare(b.aisle_name),
  );
}

/** getStorage key for "Not here" on the place-in-aisle prompt, per store. */
export const aislePromptDismissedKey = (storeId: string) => `grocery.aislePrompt.dismissed.${storeId}`;
