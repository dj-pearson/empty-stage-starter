/**
 * US-671: the ledger as a domain slice, read-only and dark.
 *
 * Two tables land here. `inventory_movements` is the append-only log and
 * `item_stock` is the balance the server keeps current with a trigger. Nothing
 * in this file writes either one; appends arrive in US-672.
 *
 * WHY BOTH, WHEN ONE IS DERIVED FROM THE OTHER.
 *
 * `item_stock` is the balance, and it is complete: one row per item, covering
 * the item's whole history. The movements load is WINDOWED (see
 * MOVEMENT_WINDOW_DAYS), because a ledger grows without bound and a client that
 * paged all of it would eventually spend its whole load budget on history a
 * parent never looks at. So folding the loaded movements gives the balance of
 * the window, not of the item, and the two must not be confused:
 *
 *   itemStock   the balance. What a pantry number renders from.
 *   movements   recent history. Provenance, and the optimistic overlay US-672
 *               needs so an append shows up before the trigger answers.
 *
 * `foldWindow` exists to make that distinction checkable rather than a comment.
 *
 * Being append-only is what makes the realtime merge trivial: there is no
 * last-write-wins to get right, because a movement is never updated. An event
 * that arrives out of order still lands on the same balance, since addition
 * commutes and the fold dedupes by id. `item_stock` is the opposite: a row
 * that IS updated in place, so it merges by item_id, upserting.
 *
 * Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { registerSubscription, unregisterSubscription } from "@/hooks/useRealtimeSubscription";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { fromCanonical } from "@/lib/canonicalUnits";
import { foldMovements, balanceOf, type LedgerState } from "@/lib/inventoryLedger";
import type { ComparableItem, StockRow } from "@/lib/stockComparison";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "./AuthContext";

export type InventoryMovement = Database["public"]["Tables"]["inventory_movements"]["Row"];
export type ItemStock = Database["public"]["Tables"]["item_stock"]["Row"];

/**
 * The feature flag that decides where a pantry number comes from. Off means
 * `foods.quantity`, exactly as today; the ledger still loads and is still
 * compared, it just does not render.
 */
export const LEDGER_READS_FLAG = "kitchen_loop_ledger_reads";

/**
 * How much history the movements slice carries. Wide enough that "why does it
 * say I have 3?" is answerable for anything a parent remembers doing, narrow
 * enough that the slice and its write-through cache stay bounded.
 */
export const MOVEMENT_WINDOW_DAYS = 90;

/** Belt to the window's braces, for a household that shops like a restaurant. */
export const MOVEMENT_LIMIT = 1000;

interface RealtimePayload<T> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: T;
}

/**
 * Coerce one raw row into a movement, or null if it is not usable.
 *
 * `delta` and `on_hand_canonical` are Postgres NUMERIC, and NUMERIC does not
 * arrive as a JS number on every path: PostgREST sends it unquoted, but a
 * realtime payload can carry it as a STRING. This codebase has met that before
 * -- normalizeGroceryItemFromDB coerces quantity and its test pins `"2" -> 2`.
 *
 * Rejecting a string here would not throw, which is what makes it worth a
 * function of its own: `foldMovements` requires a real number, so a
 * string-typed delta would be dropped from the balance silently, and the
 * pantry would just be quietly wrong by one purchase.
 */
function toFiniteNumber(value: unknown): number | null {
  // Not a bare Number() call, because Number(null), Number('') and Number([])
  // are all 0. An absent delta would then be accepted as a zero-delta movement
  // -- a row the server cannot even store, since inventory_movements carries
  // CHECK (delta <> 0) -- and the balance would look fine while a purchase was
  // missing from it. Only a real number or a non-empty numeric string counts.
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMovementRow(row: unknown): InventoryMovement | null {
  const r = row as Partial<InventoryMovement> | null;
  if (!r) return null;
  if (typeof r.id !== "string" || r.id.length === 0) return null;
  if (typeof r.item_id !== "string" || r.item_id.length === 0) return null;
  if (typeof r.canonical_unit !== "string") return null;
  const delta = toFiniteNumber(r.delta);
  if (delta === null) return null;
  return { ...(r as InventoryMovement), delta };
}

/** The same coercion for item_stock's NUMERIC balance. */
function normalizeStockRow(row: unknown): ItemStock | null {
  const r = row as Partial<ItemStock> | null;
  if (!r) return null;
  if (typeof r.item_id !== "string" || r.item_id.length === 0) return null;
  const onHand = toFiniteNumber(r.on_hand_canonical);
  if (onHand === null) return null;
  return { ...(r as ItemStock), on_hand_canonical: onHand };
}

/** Load-path helpers, so the fetch and the realtime merge normalize identically. */
export function parseMovementRows(rows: unknown[]): InventoryMovement[] {
  return (rows ?? []).map(normalizeMovementRow).filter((m): m is InventoryMovement => m !== null);
}

export function parseStockRows(rows: unknown[]): ItemStock[] {
  return (rows ?? []).map(normalizeStockRow).filter((s): s is ItemStock => s !== null);
}

/**
 * Merge a realtime movements payload.
 *
 * Append-only means there is exactly one interesting case, INSERT, and it is
 * idempotent on the id. An UPDATE can still arrive: `reversed_by_id` is the one
 * mutable column, written by rpc_reverse_movements_by_ref, so a row is replaced
 * in place when it shows up. A DELETE cannot legitimately happen (the privilege
 * is revoked and no policy exists), and dropping the row is the honest response
 * if one ever does.
 */
export function applyMovementRealtime(
  prev: InventoryMovement[],
  payload: RealtimePayload<Record<string, unknown>>,
): InventoryMovement[] {
  if (payload.eventType === "DELETE") {
    const id = (payload.old as { id?: string })?.id;
    return id ? prev.filter((m) => m.id !== id) : prev;
  }
  const row = normalizeMovementRow(payload.new);
  if (!row) return prev;
  const idx = prev.findIndex((m) => m.id === row.id);
  if (idx === -1) return [...prev, row];
  const next = prev.slice();
  next[idx] = row;
  return next;
}

/** Merge a realtime item_stock payload. Keyed by item_id, which is its PK. */
export function applyItemStockRealtime(
  prev: ItemStock[],
  payload: RealtimePayload<Record<string, unknown>>,
): ItemStock[] {
  if (payload.eventType === "DELETE") {
    const itemId = (payload.old as { item_id?: string })?.item_id;
    return itemId ? prev.filter((s) => s.item_id !== itemId) : prev;
  }
  const row = normalizeStockRow(payload.new);
  if (!row) return prev;
  const next = prev.slice();
  const idx = next.findIndex((s) => s.item_id === row.item_id);
  if (idx === -1) next.push(row);
  else next[idx] = row;
  return next;
}

interface InventoryContextType {
  movements: InventoryMovement[];
  setMovements: React.Dispatch<React.SetStateAction<InventoryMovement[]>>;
  itemStock: ItemStock[];
  setItemStock: React.Dispatch<React.SetStateAction<ItemStock[]>>;
  /** True when pantry numbers should render from the ledger. */
  ledgerReadsEnabled: boolean;
  /**
   * The number to put on screen for an item, in its own display unit.
   *
   * With the flag off this is `foods.quantity`, unchanged. With it on this is
   * the ledger balance converted to the display unit, falling back to
   * `foods.quantity` when there is no balance yet or it cannot be expressed in
   * that unit. A stale number beats a wrong one, and beats a blank.
   */
  pantryQuantityOf: (item: ComparableItem) => number;
  /** Ledger balance in display units, or null when it cannot be rendered. */
  ledgerQuantityOf: (item: ComparableItem) => number | null;
  /** The loaded movements folded into balances. The WINDOW's balance, not the item's. */
  foldWindow: LedgerState;
  /** item_stock shaped for the US-671 comparison. */
  stockRows: StockRow[];
  refreshInventory: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

function movementWindowStart(now: Date = new Date()): string {
  const start = new Date(now);
  start.setDate(start.getDate() - MOVEMENT_WINDOW_DAYS);
  return start.toISOString();
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [itemStock, setItemStock] = useState<ItemStock[]>([]);
  const { userId, householdId } = useAuth();
  const ledgerReadsEnabled = useFeatureFlag(LEDGER_READS_FLAG, false);

  // Realtime. Two channels rather than one, so a household switch tears down
  // and rebuilds each independently and the channel names stay diagnosable.
  useEffect(() => {
    if (!userId || !householdId) return;

    const movementsChannelName = `inventory_movements:${householdId}`;
    const movementsChannel = supabase
      .channel(movementsChannelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_movements",
          filter: `household_id=eq.${householdId}`,
        },
        (payload: RealtimePayload<Record<string, unknown>>) => {
          setMovements((prev) => applyMovementRealtime(prev, payload));
        },
      )
      .subscribe();
    registerSubscription(movementsChannelName, "inventory_movements");

    const stockChannelName = `item_stock:${householdId}`;
    const stockChannel = supabase
      .channel(stockChannelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "item_stock",
          filter: `household_id=eq.${householdId}`,
        },
        (payload: RealtimePayload<Record<string, unknown>>) => {
          setItemStock((prev) => applyItemStockRealtime(prev, payload));
        },
      )
      .subscribe();
    registerSubscription(stockChannelName, "item_stock");

    return () => {
      unregisterSubscription(movementsChannelName);
      unregisterSubscription(stockChannelName);
      supabase.removeChannel(movementsChannel);
      supabase.removeChannel(stockChannel);
    };
  }, [userId, householdId]);

  const refreshInventory = useCallback(async () => {
    if (!userId || !householdId) return;
    try {
      const [movementsRes, stockRes] = await Promise.all([
        supabase
          .from("inventory_movements")
          .select("*")
          .eq("household_id", householdId)
          .gte("occurred_at", movementWindowStart())
          .order("occurred_at", { ascending: true })
          .limit(MOVEMENT_LIMIT),
        supabase.from("item_stock").select("*").eq("household_id", householdId),
      ]);
      if (movementsRes.data) setMovements(parseMovementRows(movementsRes.data as unknown[]));
      if (stockRes.data) setItemStock(parseStockRows(stockRes.data as unknown[]));
    } catch (error) {
      logger.error("Error refreshing inventory:", error);
    }
  }, [userId, householdId]);

  const foldWindow = useMemo(() => foldMovements(movements), [movements]);

  const stockByItem = useMemo(() => {
    const map = new Map<string, ItemStock>();
    for (const row of itemStock) {
      if (row && typeof row.item_id === "string") map.set(row.item_id, row);
    }
    return map;
  }, [itemStock]);

  const stockRows = useMemo<StockRow[]>(
    () =>
      itemStock.map((row) => ({
        item_id: row.item_id,
        on_hand_canonical: row.on_hand_canonical,
        canonical_unit: row.canonical_unit,
        mirror_unconvertible: row.mirror_unconvertible,
      })),
    [itemStock],
  );

  const ledgerQuantityOf = useCallback(
    (item: ComparableItem): number | null => {
      if (!item || typeof item.id !== "string") return null;
      const row = stockByItem.get(item.id);
      if (!row) return null;
      return fromCanonical(row.on_hand_canonical, row.canonical_unit, item.unit, item);
    },
    [stockByItem],
  );

  const pantryQuantityOf = useCallback(
    (item: ComparableItem): number => {
      const legacy =
        typeof item?.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 0;
      if (!ledgerReadsEnabled) return legacy;
      const fromLedger = ledgerQuantityOf(item);
      return fromLedger === null ? legacy : fromLedger;
    },
    [ledgerReadsEnabled, ledgerQuantityOf],
  );

  const value = useMemo(
    () => ({
      movements,
      setMovements,
      itemStock,
      setItemStock,
      ledgerReadsEnabled,
      pantryQuantityOf,
      ledgerQuantityOf,
      foldWindow,
      stockRows,
      refreshInventory,
    }),
    [
      movements,
      itemStock,
      ledgerReadsEnabled,
      pantryQuantityOf,
      ledgerQuantityOf,
      foldWindow,
      stockRows,
      refreshInventory,
    ],
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) throw new Error("useInventory must be used within InventoryProvider");
  return context;
}

/** Re-exported so callers can fold a movement list without importing two modules. */
export { balanceOf };
