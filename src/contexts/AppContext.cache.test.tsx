/**
 * US-537: the web write-through cache must minimize child PII and be reliably
 * scrubbed on sign-out (no pending save re-writes it afterward).
 */
import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { AppProvider } from "./AppContext";

const STORAGE_KEY = "kid-meal-planner";
let sessionUser: { id: string } | null = null;
const authCbs: Array<(event: string, session: unknown) => void> = [];
const tableData: Record<string, unknown[]> = {};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ["select", "eq", "order", "limit", "gte", "lte", "insert", "update", "delete"]) {
    builder[m] = vi.fn(chain);
  }
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: tableData[table] ?? [], error: null });
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: sessionUser ? { user: sessionUser } : null } })),
      onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
        authCbs.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn((t: string) => makeBuilder(t)),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
    rpc: vi.fn((fn: string) => {
      if (fn === "get_user_household_id" || fn === "ensure_user_household") return Promise.resolve({ data: "hh-1", error: null });
      return Promise.resolve({ data: null, error: null });
    }),
  },
}));

const storageBacking: Record<string, string> = {};
const setItem = vi.fn((k: string, v: string) => { storageBacking[k] = v; return Promise.resolve(); });
const removeItem = vi.fn((k: string) => { delete storageBacking[k]; return Promise.resolve(); });
vi.mock("@/lib/platform", () => ({
  getStorage: vi.fn().mockResolvedValue({
    getItem: vi.fn((k: string) => Promise.resolve(storageBacking[k] ?? null)),
    setItem: (k: string, v: string) => setItem(k, v),
    removeItem: (k: string) => removeItem(k),
  }),
  isWeb: vi.fn().mockReturnValue(true),
  isMobile: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(),
    withContext: vi.fn().mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock("@/hooks/useRealtimeSubscription", () => ({ registerSubscription: vi.fn(), unregisterSubscription: vi.fn() }));

describe("US-537: cache PII minimization + sign-out scrub", () => {
  beforeEach(() => {
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    localStorage.clear();
    sessionStorage.clear();
    for (const k of Object.keys(tableData)) delete tableData[k];
    setItem.mockClear();
    removeItem.mockClear();
    sessionUser = { id: "user-1" };
    authCbs.length = 0;
    tableData["kids"] = [
      { id: "k1", name: "Sam", age: 5, allergens: ["peanut"], notes: "private", household_id: "hh-1" },
    ];
  });

  const cacheWrites = () => setItem.mock.calls.filter((c) => c[0] === STORAGE_KEY);

  it("redacts child PII from the persisted cache", async () => {
    render(<AppProvider><div /></AppProvider>);
    // Wait for the async load + the 500ms debounced save to flush (real timers).
    await waitFor(() => expect(cacheWrites().length).toBeGreaterThan(0), { timeout: 2000 });

    const lastPayload = cacheWrites().at(-1)![1] as string;
    expect(lastPayload).toContain("Sam"); // name kept for offline paint
    expect(lastPayload).not.toContain("peanut"); // allergen redacted
    expect(lastPayload).not.toContain("private"); // notes redacted
  });

  it("scrubs the cache on sign-out and does not re-write PII afterward", async () => {
    render(<AppProvider><div /></AppProvider>);
    await waitFor(() => expect(cacheWrites().length).toBeGreaterThan(0), { timeout: 2000 });
    setItem.mockClear();

    // Fire SIGNED_OUT to every subscriber (AuthContext + AppContext).
    authCbs.forEach((cb) => cb("SIGNED_OUT", null));
    await waitFor(() => expect(removeItem).toHaveBeenCalledWith(STORAGE_KEY), { timeout: 2000 });

    // Wait past the debounce window to catch any late save that would re-write PII.
    await delay(700);
    expect(cacheWrites().length).toBe(0);
    expect(storageBacking[STORAGE_KEY]).toBeUndefined();
  });

  /**
   * US-835: the scrub above covered one key. These are the others a shared
   * family tablet handed to whoever signed in next. This drives the real
   * SIGNED_OUT handler against jsdom's own storage rather than the mocked
   * platform adapter, because that is what scrubOnSignOut talks to.
   */
  it("clears the rest of the household's browser state on sign-out", async () => {
    localStorage.setItem("eatpal_recent_searches", '["chicken nuggets","Ada"]');
    localStorage.setItem("eatpal.auto_restock_blocklist", '["milk"]');
    localStorage.setItem("eatpal.kid_birthday_dismissed.k1.2026", "true");
    localStorage.setItem("eatpal-budget-calc-draft", '{"householdSize":4}');
    localStorage.setItem("eatpal_cookie_consent", '{"analytics":false}');
    sessionStorage.setItem("login_session_id", "sess-a");
    sessionStorage.setItem("gsc_user_id", "user-1");
    sessionStorage.setItem("route-error-chunk-reload-at", "0");

    render(<AppProvider><div /></AppProvider>);
    await waitFor(() => expect(cacheWrites().length).toBeGreaterThan(0), { timeout: 2000 });

    authCbs.forEach((cb) => cb("SIGNED_OUT", null));

    await waitFor(() => {
      expect(localStorage.getItem("eatpal_recent_searches")).toBeNull();
    }, { timeout: 2000 });
    expect(localStorage.getItem("eatpal.auto_restock_blocklist")).toBeNull();
    expect(localStorage.getItem("eatpal.kid_birthday_dismissed.k1.2026")).toBeNull();
    expect(localStorage.getItem("eatpal-budget-calc-draft")).toBeNull();
    expect(sessionStorage.getItem("login_session_id")).toBeNull();
    expect(sessionStorage.getItem("gsc_user_id")).toBeNull();

    // Not a scrub-everything test: consent and the deploy-reload cooldown are
    // properties of the browser and must survive.
    expect(localStorage.getItem("eatpal_cookie_consent")).toBe('{"analytics":false}');
    expect(sessionStorage.getItem("route-error-chunk-reload-at")).toBe("0");
  });
});
