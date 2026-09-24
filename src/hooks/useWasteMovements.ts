/**
 * Item 22: the ledger rows the waste report needs, fetched when it opens.
 *
 * The context's movements slice is a 90-day window capped at 1000 rows,
 * oldest first, so for a busy household it can stop short of this month. The
 * report asks the server for exactly what it reads instead: this month's
 * waste and expiry, and the priced purchases of the items thrown out (the
 * price source). Rows the context holds that the server has not echoed yet
 * (an optimistic "threw it out" a second ago) are merged in by id.
 *
 * RLS scopes both reads to the household; the explicit household filter is
 * for the index, not for safety.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInventory } from "@/contexts/AppContext";
import { logger } from "@/lib/logger";
import { startOfMonth, WASTE_REASONS, type ReportMovement } from "@/lib/wasteReport";

/** How far back a purchase price is still believable. */
export const PRICE_LOOKBACK_DAYS = 180;

const COLUMNS =
  "id, item_id, delta, canonical_unit, display_quantity, display_unit, reason, occurred_at, reversed_by_id, unit_price, currency";

export interface WasteMovementsState {
  movements: ReportMovement[];
  loading: boolean;
  error: boolean;
  reload: () => void;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** NUMERIC can arrive as a string; a row without a usable delta is dropped. */
export function parseReportRows(rows: unknown[] | null | undefined): ReportMovement[] {
  const out: ReportMovement[] = [];
  for (const raw of rows ?? []) {
    const r = raw as Record<string, unknown> | null;
    if (!r || typeof r.id !== "string" || typeof r.item_id !== "string") continue;
    const delta = toNumber(r.delta);
    if (delta === null) continue;
    out.push({
      id: r.id,
      item_id: r.item_id,
      delta,
      canonical_unit: String(r.canonical_unit ?? ""),
      display_quantity: toNumber(r.display_quantity),
      display_unit: typeof r.display_unit === "string" ? r.display_unit : null,
      reason: String(r.reason ?? ""),
      occurred_at: String(r.occurred_at ?? ""),
      reversed_by_id: typeof r.reversed_by_id === "string" ? r.reversed_by_id : null,
      unit_price: toNumber(r.unit_price),
      currency: typeof r.currency === "string" ? r.currency : null,
    });
  }
  return out;
}

export function useWasteMovements(enabled: boolean, now: Date = new Date()): WasteMovementsState {
  const { householdId } = useAuth();
  const { movements: held } = useInventory();
  const [fetched, setFetched] = useState<ReportMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;

  useEffect(() => {
    if (!enabled || !householdId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    void (async () => {
      try {
        const [year, month] = monthKey.split("-").map(Number);
        const since = startOfMonth(new Date(year, month, 1)).toISOString();
        const wasteRes = await supabase
          .from("inventory_movements")
          .select(COLUMNS)
          .eq("household_id", householdId)
          .in("reason", [...WASTE_REASONS])
          .gte("occurred_at", since)
          .order("occurred_at", { ascending: false })
          .limit(500);
        if (wasteRes.error) throw wasteRes.error;
        const waste = parseReportRows(wasteRes.data as unknown[]);
        const itemIds = [...new Set(waste.map((m) => m.item_id))];
        let purchases: ReportMovement[] = [];
        if (itemIds.length > 0) {
          const lookback = new Date(year, month, 1);
          lookback.setDate(lookback.getDate() - PRICE_LOOKBACK_DAYS);
          const priceRes = await supabase
            .from("inventory_movements")
            .select(COLUMNS)
            .eq("household_id", householdId)
            .eq("reason", "purchase")
            .not("unit_price", "is", null)
            .in("item_id", itemIds)
            .gte("occurred_at", lookback.toISOString())
            .order("occurred_at", { ascending: false })
            .limit(1000);
          if (priceRes.error) throw priceRes.error;
          purchases = parseReportRows(priceRes.data as unknown[]);
        }
        if (!cancelled) setFetched([...waste, ...purchases]);
      } catch (err) {
        logger.error("Waste report load failed:", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, householdId, monthKey, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const movements = useMemo(() => {
    const byId = new Map<string, ReportMovement>();
    for (const m of fetched) byId.set(m.id, m);
    for (const m of parseReportRows(held as unknown[])) if (!byId.has(m.id)) byId.set(m.id, m);
    return [...byId.values()];
  }, [fetched, held]);

  return { movements, loading, error, reload };
}
