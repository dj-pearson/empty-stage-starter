import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

/**
 * useWasteMovements' reads: this month's waste for the household, then priced
 * purchases of only the thrown-out items, merged with the context's rows.
 */
type Filter = [string, ...unknown[]];
const h = vi.hoisted(() => ({
  calls: [] as Filter[][],
  results: [] as Array<{ data: unknown[] | null; error: unknown }>,
  held: [] as unknown[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: Filter[] = [["from", table]];
      h.calls.push(filters);
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "gte", "not", "order"]) {
        chain[op] = (...a: unknown[]) => (filters.push([op, ...a]), chain);
      }
      chain.limit = (...a: unknown[]) => {
        filters.push(["limit", ...a]);
        return Promise.resolve(h.results.shift() ?? { data: [], error: null });
      };
      return chain;
    },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ householdId: "hh-1" }) }));
vi.mock("@/contexts/AppContext", () => ({ useInventory: () => ({ movements: h.held }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { useWasteMovements } from "./useWasteMovements";

const NOW = new Date(2026, 8, 24, 12);
const row = (id: string, item: string, reason: string, extra: Record<string, unknown> = {}) => ({
  id,
  item_id: item,
  delta: -1,
  canonical_unit: "count",
  reason,
  occurred_at: "2026-09-10T10:00:00Z",
  ...extra,
});

beforeEach(() => {
  h.calls.length = 0;
  h.results = [];
  h.held = [];
});

describe("useWasteMovements", () => {
  it("reads this month's household waste, then purchases for only those items", async () => {
    h.results = [
      { data: [row("w1", "f1", "waste"), row("w2", "f1", "expire"), row("w3", "f2", "waste")], error: null },
      { data: [row("p1", "f1", "purchase", { delta: 2, unit_price: 1.5, currency: "USD" })], error: null },
    ];
    const { result } = renderHook(() => useWasteMovements(true, NOW));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.movements).toHaveLength(4));

    const [waste, prices] = h.calls;
    expect(waste).toContainEqual(["eq", "household_id", "hh-1"]);
    expect(waste).toContainEqual(["gte", "occurred_at", new Date(2026, 8, 1).toISOString()]);
    expect(prices).toContainEqual(["eq", "household_id", "hh-1"]);
    expect(prices).toContainEqual(["eq", "reason", "purchase"]);
    expect(prices).toContainEqual(["in", "item_id", ["f1", "f2"]]);
    const lookback = new Date(2026, 8, 1);
    lookback.setDate(lookback.getDate() - 180);
    expect(prices).toContainEqual(["gte", "occurred_at", lookback.toISOString()]);
  });

  it("does not ask for prices when nothing was thrown out", async () => {
    h.results = [{ data: [], error: null }];
    const { result } = renderHook(() => useWasteMovements(true, NOW));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(h.calls).toHaveLength(1);
  });

  it("reads nothing while closed", async () => {
    renderHook(() => useWasteMovements(false, NOW));
    await act(async () => {});
    expect(h.calls).toHaveLength(0);
  });

  it("sets error on a failed read, and reload reads again", async () => {
    h.results = [{ data: null, error: { message: "boom" } }];
    const { result } = renderHook(() => useWasteMovements(true, NOW));
    await waitFor(() => expect(result.current.error).toBe(true));
    h.results = [{ data: [], error: null }];
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe(false));
    expect(h.calls).toHaveLength(2);
  });

  it("merges an optimistic context row the server has not echoed yet", async () => {
    h.held = [row("w-local", "f9", "waste")];
    h.results = [{ data: [row("w1", "f1", "waste")], error: null }, { data: [], error: null }];
    const { result } = renderHook(() => useWasteMovements(true, NOW));
    await waitFor(() => expect(result.current.movements.map((m) => m.id).sort()).toEqual(["w-local", "w1"]));
  });
});
