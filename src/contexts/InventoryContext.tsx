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
import {
  buildCorrectionMovement,
  buildPurchaseMovement,
  buildWasteMovement,
  buildAdjustmentMovement,
  partitionMovements,
  resolveGroceryItemId,
  isSkipped,
  type MovementDraft,
  type MovementItem,
  type MovementSkipped,
  type PurchasableGroceryItem,
} from "@/lib/movementBuilders";
import { generateId } from "@/lib/utils";
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
 * The flag that decides whether an action APPENDS to the ledger (US-672).
 *
 * Separate from the reads flag on purpose, because the two stage in opposite
 * order: writes go on first so the ledger accumulates real history, and reads
 * only follow once the US-671 comparison says the balance agrees with
 * foods.quantity. One flag would force them on together and there would be
 * nothing to compare against.
 *
 * It also has to exist at all. These migrations are applied nowhere yet, so an
 * unconditional insert would fail on every pantry edit for every user, and the
 * only thing that would achieve is a Sentry full of the same error.
 */
export const LEDGER_WRITES_FLAG = "kitchen_loop_ledger_writes";

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
  /** True when actions should append to the ledger (US-672). */
  ledgerWritesEnabled: boolean;
  /**
   * Append movements, optimistically and idempotently.
   *
   * A duplicate id is not an error and not a second credit; see the note on
   * the upsert in the implementation.
   */
  appendMovements: (drafts: readonly MovementDraft[]) => Promise<AppendResult>;
  /**
   * A parent edited a pantry number. Records the CHANGE.
   *
   * Returns `recorded: false` with a reason when the edit could not be
   * expressed as a movement, which the caller must treat as "fall back to the
   * legacy write" rather than "the edit is done".
   */
  recordPantryCorrection: (
    item: MovementItem & { quantity?: number | null },
    newQuantity: number,
  ) => Promise<RecordResult>;
  /** A parent threw something out. */
  recordWaste: (item: MovementItem, quantity: number) => Promise<RecordResult>;
  /** Checkout: one purchase movement per checked row. */
  recordPurchases: (
    groceryItems: readonly PurchasableGroceryItem[],
    items: readonly MovementItem[],
  ) => Promise<RecordResult & { skipped: MovementSkipped[] }>;
  /**
   * Undo a checkout: append a correction that negates each purchase.
   *
   * A true reversal (rpc_reverse_movements_by_ref, US-677) does not exist yet.
   * In an append-only ledger a negating correction is the same fact recorded
   * the long way, and it composes with anything else that moved in between.
   */
  recordPurchaseReversal: (
    groceryItems: readonly PurchasableGroceryItem[],
    items: readonly MovementItem[],
  ) => Promise<RecordResult>;
  refreshInventory: () => Promise<void>;
}

export interface AppendResult {
  /** Rows handed to the server. Duplicates are included; they are no-ops. */
  attempted: number;
  /** False when the insert failed and the optimistic rows were rolled back. */
  ok: boolean;
  error: unknown | null;
  /** True when the flag is off, so nothing was attempted at all. */
  disabled?: boolean;
}

export interface RecordResult {
  /** True when at least one movement reached the server. */
  recorded: boolean;
  /** How many movements were accepted. */
  count: number;
  /** Why nothing was recorded, when nothing was. */
  reason: string | null;
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
  // Movements this client appended that the server has not yet answered for.
  // item_stock is maintained by a trigger, so between the insert and the
  // realtime echo the balance on screen would still be the pre-edit one. These
  // ids let the read overlay add them in for that window.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const { userId, householdId } = useAuth();
  const ledgerReadsEnabled = useFeatureFlag(LEDGER_READS_FLAG, false);
  const ledgerWritesEnabled = useFeatureFlag(LEDGER_WRITES_FLAG, false);

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

  /**
   * Append movements.
   *
   * IDEMPOTENT BY UPSERT, and the exact form matters. `ignoreDuplicates: true`
   * compiles to ON CONFLICT DO NOTHING, so re-sending a movement the server
   * already has is a no-op rather than an error or a second credit. The other
   * spelling (`ignoreDuplicates: false`, ON CONFLICT DO UPDATE) would not just
   * be wrong here, it could not work: inventory_movements REVOKEs UPDATE from
   * authenticated precisely so history cannot be rewritten, so the update
   * branch would be refused by the grant.
   *
   * Optimistic, then rolled back on failure. A movement that never reached the
   * server must not keep inflating the local balance, because the next
   * server-authoritative load would silently drop it and the number on screen
   * would change with no action from the parent.
   */
  const appendMovements = useCallback(
    async (drafts: readonly MovementDraft[]): Promise<AppendResult> => {
      const rows = (drafts ?? []).filter(Boolean);
      if (rows.length === 0) return { attempted: 0, ok: true, error: null };
      if (!ledgerWritesEnabled) return { attempted: 0, ok: true, error: null, disabled: true };
      if (!userId || !householdId) {
        return { attempted: 0, ok: false, error: new Error("not authenticated"), disabled: true };
      }

      const optimistic = parseMovementRows(rows as unknown[]);
      const ids = new Set(optimistic.map((m) => m.id));
      // Dedupe against what is already held, so an optimistic row and the
      // realtime echo of the same id cannot both count.
      setMovements((prev) => [...prev.filter((m) => !ids.has(m.id)), ...optimistic]);

      try {
        const { error } = await supabase
          .from("inventory_movements")
          .upsert(rows as never, { onConflict: "id", ignoreDuplicates: true });

        if (error) {
          setMovements((prev) => prev.filter((m) => !ids.has(m.id)));
          logger.error("Error appending inventory movements:", error);
          return { attempted: rows.length, ok: false, error };
        }
        // Accepted, but item_stock has not echoed yet. Count these into the
        // displayed balance until it does.
        setPendingIds((prev) => new Set([...prev, ...ids]));
        return { attempted: rows.length, ok: true, error: null };
      } catch (error) {
        setMovements((prev) => prev.filter((m) => !ids.has(m.id)));
        logger.error("Error appending inventory movements:", error);
        return { attempted: rows.length, ok: false, error };
      }
    },
    [ledgerWritesEnabled, userId, householdId],
  );

  const recordPantryCorrection = useCallback(
    async (
      item: MovementItem & { quantity?: number | null },
      newQuantity: number,
    ): Promise<RecordResult> => {
      if (!ledgerWritesEnabled) return { recorded: false, count: 0, reason: "ledger writes are off" };
      const draft = buildCorrectionMovement({
        id: generateId(),
        householdId: householdId ?? "",
        userId: userId ?? "",
        item,
        currentQuantity: typeof item?.quantity === "number" ? item.quantity : 0,
        newQuantity,
      });
      if (isSkipped(draft)) return { recorded: false, count: 0, reason: draft.reason };
      const result = await appendMovements([draft]);
      return {
        recorded: result.ok && result.attempted > 0,
        count: result.ok ? result.attempted : 0,
        reason: result.ok ? null : "the append failed",
      };
    },
    [ledgerWritesEnabled, householdId, userId, appendMovements],
  );

  const recordWaste = useCallback(
    async (item: MovementItem, quantity: number): Promise<RecordResult> => {
      if (!ledgerWritesEnabled) return { recorded: false, count: 0, reason: "ledger writes are off" };
      const draft = buildWasteMovement({
        id: generateId(),
        householdId: householdId ?? "",
        userId: userId ?? "",
        item,
        quantity,
      });
      if (isSkipped(draft)) return { recorded: false, count: 0, reason: draft.reason };
      const result = await appendMovements([draft]);
      return {
        recorded: result.ok && result.attempted > 0,
        count: result.ok ? result.attempted : 0,
        reason: result.ok ? null : "the append failed",
      };
    },
    [ledgerWritesEnabled, householdId, userId, appendMovements],
  );

  /**
   * Checkout, in one action.
   *
   * Every checked row that resolves to a pantry item becomes a purchase
   * movement. Rows that do not resolve, or whose unit cannot be converted, come
   * back in `skipped` so the caller can keep crediting them the legacy way
   * instead of losing them: a shop that half-recorded would be worse than one
   * that did not record at all.
   */
  const recordPurchases = useCallback(
    async (
      groceryItems: readonly PurchasableGroceryItem[],
      items: readonly MovementItem[],
    ): Promise<RecordResult & { skipped: MovementSkipped[] }> => {
      if (!ledgerWritesEnabled) {
        return { recorded: false, count: 0, reason: "ledger writes are off", skipped: [] };
      }
      const results = (groceryItems ?? []).map((row) => {
        const itemId = resolveGroceryItemId(row, items);
        const item = itemId ? items.find((i) => i.id === itemId) : undefined;
        if (!item) {
          return {
            skipped: true as const,
            reason: `no pantry item matches "${row?.name ?? ""}"`,
            itemId: null,
          };
        }
        return buildPurchaseMovement({
          householdId: householdId ?? "",
          userId: userId ?? "",
          item,
          groceryItem: row,
        });
      });

      const { movements: drafts, skipped } = partitionMovements(results);
      if (drafts.length === 0) {
        return { recorded: false, count: 0, reason: "nothing resolved to a pantry item", skipped };
      }
      const result = await appendMovements(drafts);
      return {
        recorded: result.ok && result.attempted > 0,
        count: result.ok ? result.attempted : 0,
        reason: result.ok ? null : "the append failed",
        skipped,
      };
    },
    [ledgerWritesEnabled, householdId, userId, appendMovements],
  );

  const recordPurchaseReversal = useCallback(
    async (
      groceryItems: readonly PurchasableGroceryItem[],
      items: readonly MovementItem[],
    ): Promise<RecordResult> => {
      if (!ledgerWritesEnabled) return { recorded: false, count: 0, reason: "ledger writes are off" };
      const results = (groceryItems ?? []).map((row) => {
        const itemId = resolveGroceryItemId(row, items);
        const item = itemId ? items.find((i) => i.id === itemId) : undefined;
        if (!item) {
          return { skipped: true as const, reason: `no pantry item matches "${row?.name ?? ""}"`, itemId: null };
        }
        return buildAdjustmentMovement({
          // A fresh id: this is a NEW fact appended after the purchase, not a
          // re-send of it. Reusing the purchase's id would collide with the
          // row it is meant to cancel and undo nothing at all.
          id: generateId(),
          householdId: householdId ?? "",
          userId: userId ?? "",
          item,
          signedQuantity: -Math.abs(typeof row.quantity === "number" ? row.quantity : 1),
          displayUnit: row.unit ?? item.unit,
          refType: "grocery_item",
          refId: row.id,
        });
      });
      const { movements: drafts } = partitionMovements(results);
      if (drafts.length === 0) {
        return { recorded: false, count: 0, reason: "nothing resolved to a pantry item" };
      }
      const result = await appendMovements(drafts);
      return {
        recorded: result.ok && result.attempted > 0,
        count: result.ok ? result.attempted : 0,
        reason: result.ok ? null : "the append failed",
      };
    },
    [ledgerWritesEnabled, householdId, userId, appendMovements],
  );

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

  // Whatever we appended and the server has not yet confirmed into item_stock,
  // summed per item in canonical units.
  const pendingCanonicalByItem = useMemo(() => {
    const map = new Map<string, number>();
    if (pendingIds.size === 0) return map;
    for (const m of movements) {
      if (!pendingIds.has(m.id)) continue;
      map.set(m.item_id, (map.get(m.item_id) ?? 0) + m.delta);
    }
    return map;
  }, [movements, pendingIds]);

  // Any item_stock change means the trigger has answered. Drop the whole
  // pending set rather than trying to match rows to movements: erring toward
  // the SERVER's number is the safe direction. Keeping a pending delta that
  // item_stock has already absorbed would show the edit twice, while dropping
  // one early only means the screen shows the truth a moment sooner.
  useEffect(() => {
    setPendingIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, [itemStock]);

  const ledgerQuantityOf = useCallback(
    (item: ComparableItem): number | null => {
      if (!item || typeof item.id !== "string") return null;
      const row = stockByItem.get(item.id);
      if (!row) return null;
      const pending = pendingCanonicalByItem.get(item.id) ?? 0;
      return fromCanonical(row.on_hand_canonical + pending, row.canonical_unit, item.unit, item);
    },
    [stockByItem, pendingCanonicalByItem],
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
      ledgerWritesEnabled,
      pantryQuantityOf,
      ledgerQuantityOf,
      foldWindow,
      stockRows,
      appendMovements,
      recordPantryCorrection,
      recordWaste,
      recordPurchases,
      recordPurchaseReversal,
      refreshInventory,
    }),
    [
      movements,
      itemStock,
      ledgerReadsEnabled,
      ledgerWritesEnabled,
      pantryQuantityOf,
      ledgerQuantityOf,
      foldWindow,
      stockRows,
      appendMovements,
      recordPantryCorrection,
      recordWaste,
      recordPurchases,
      recordPurchaseReversal,
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
