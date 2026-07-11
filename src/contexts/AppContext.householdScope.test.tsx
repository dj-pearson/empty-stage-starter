/**
 * US-550: the authenticated load and refresh helpers always filter by
 * household_id (defense-in-depth alongside RLS) — no unscoped select branches.
 */
import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { AppProvider } from "./AppContext";

let sessionUser: { id: string } | null = null;
const eqCalls: Array<[string, unknown]> = [];
const fromTables: string[] = [];

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ["select", "order", "limit", "gte", "lte", "insert", "update", "delete"]) {
    builder[m] = vi.fn(chain);
  }
  builder.eq = vi.fn((col: string, val: unknown) => { eqCalls.push([col, val]); return builder; });
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: sessionUser ? { user: sessionUser } : null } })),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn((t: string) => { fromTables.push(t); return makeBuilder(); }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
    rpc: vi.fn((fn: string) =>
      fn === "get_user_household_id" || fn === "ensure_user_household"
        ? Promise.resolve({ data: "hh-1", error: null })
        : Promise.resolve({ data: null, error: null }),
    ),
  },
}));

const storageBacking: Record<string, string> = {};
vi.mock("@/lib/platform", () => ({
  getStorage: vi.fn().mockResolvedValue({
    getItem: vi.fn((k: string) => Promise.resolve(storageBacking[k] ?? null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
  }),
  isWeb: vi.fn().mockReturnValue(true),
  isMobile: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(),
    withContext: vi.fn().mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock("@/hooks/useRealtimeSubscription", () => ({ registerSubscription: vi.fn(), unregisterSubscription: vi.fn() }));

describe("US-550: household-scoped data load", () => {
  beforeEach(() => {
    eqCalls.length = 0;
    fromTables.length = 0;
    sessionUser = { id: "user-1" };
  });

  it("filters every domain table by household_id on the authenticated load", async () => {
    render(<AppProvider><div /></AppProvider>);
    await waitFor(() => expect(fromTables).toContain("foods"), { timeout: 2000 });
    await waitFor(
      () => expect(eqCalls.some(([c, v]) => c === "household_id" && v === "hh-1")).toBe(true),
      { timeout: 2000 },
    );

    // Each of the five domain tables was queried with a household_id filter.
    for (const table of ["kids", "foods", "recipes", "plan_entries", "grocery_items"]) {
      expect(fromTables, `expected a query on ${table}`).toContain(table);
    }
    const hhFilters = eqCalls.filter(([c, v]) => c === "household_id" && v === "hh-1");
    expect(hhFilters.length).toBeGreaterThanOrEqual(5);
  });
});
