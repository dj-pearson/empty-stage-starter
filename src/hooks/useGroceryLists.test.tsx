import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { GroceryListRow } from "./useGroceryLists";

/**
 * US-341 load precedence for grocery lists: the cache paints first, a server
 * success replaces it, and a failure keeps it on screen with `error` set.
 */
type Result = { data: GroceryListRow[] | null; error: { message: string } | null };
let respond: (r: Result) => void = () => {};
let pending: Promise<Result> = Promise.resolve({ data: [], error: null });
const queries: string[] = [];

function nextResponse() {
  pending = new Promise<Result>((resolve) => {
    respond = resolve;
  });
}

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.or = self;
    chain.order = self;
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      pending.then(resolve, reject);
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        queries.push(table);
        return builder();
      },
    },
  };
});

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const { useGroceryLists, listsCacheKey, selectedListCacheKey } = await import("./useGroceryLists");

const USER = "00000000-0000-4000-8000-000000000001";
const HOUSEHOLD = "00000000-0000-4000-8000-00000000aaa1";

const row = (id: string, overrides: Partial<GroceryListRow> = {}): GroceryListRow => ({
  id,
  name: id,
  user_id: USER,
  household_id: HOUSEHOLD,
  is_default: false,
  is_archived: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
  color: null,
  description: null,
  icon: null,
  store_layout_id: null,
  store_name: null,
  ...overrides,
});

describe("useGroceryLists", () => {
  beforeEach(() => {
    localStorage.clear();
    queries.length = 0;
    nextResponse();
  });

  it("renders the cache before the server responds, then lets the server overwrite it", async () => {
    localStorage.setItem(listsCacheKey(USER), JSON.stringify([row("cached", { is_default: true })]));

    const { result } = renderHook(() => useGroceryLists(USER, HOUSEHOLD));

    await waitFor(() => expect(result.current.lists.map((l) => l.id)).toEqual(["cached"]));
    expect(result.current.loading).toBe(true);
    expect(result.current.selectedListId).toBe("cached");

    await act(async () => {
      respond({ data: [row("server", { is_default: true })], error: null });
    });

    await waitFor(() => expect(result.current.lists.map((l) => l.id)).toEqual(["server"]));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
    expect(result.current.selectedListId).toBe("server");
    expect(JSON.parse(localStorage.getItem(listsCacheKey(USER)) ?? "[]")[0].id).toBe("server");
  });

  it("keeps the cache and sets error when the fetch fails", async () => {
    localStorage.setItem(listsCacheKey(USER), JSON.stringify([row("cached")]));

    const { result } = renderHook(() => useGroceryLists(USER, HOUSEHOLD));
    await waitFor(() => expect(result.current.lists).toHaveLength(1));

    await act(async () => {
      respond({ data: null, error: { message: "offline" } });
    });

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.lists.map((l) => l.id)).toEqual(["cached"]);
  });

  it("falls back to the default when the stored selection no longer exists", async () => {
    localStorage.setItem(selectedListCacheKey(USER), "deleted-elsewhere");

    const { result } = renderHook(() => useGroceryLists(USER, HOUSEHOLD));
    await act(async () => {
      respond({ data: [row("other"), row("home", { is_default: true })], error: null });
    });

    await waitFor(() => expect(result.current.lists).toHaveLength(2));
    expect(result.current.selectedListId).toBe("home");
  });

  it("keeps a stored selection that still exists", async () => {
    localStorage.setItem(selectedListCacheKey(USER), "other");

    const { result } = renderHook(() => useGroceryLists(USER, HOUSEHOLD));
    await act(async () => {
      respond({ data: [row("other"), row("home", { is_default: true })], error: null });
    });

    await waitFor(() => expect(result.current.selectedListId).toBe("other"));
  });

  it("breaks a default tie by the oldest created_at", async () => {
    const { result } = renderHook(() => useGroceryLists(USER, HOUSEHOLD));
    await act(async () => {
      respond({
        data: [
          row("newer", { is_default: true, created_at: "2026-03-01T00:00:00Z" }),
          row("older", { is_default: true, created_at: "2025-12-01T00:00:00Z" }),
          row("oldest-not-default", { created_at: "2025-01-01T00:00:00Z" }),
        ],
        error: null,
      });
    });

    await waitFor(() => expect(result.current.defaultListId).toBe("older"));
    expect(result.current.selectedListId).toBe("older");
  });

  it("persists an explicit selection", async () => {
    const { result } = renderHook(() => useGroceryLists(USER, HOUSEHOLD));
    await act(async () => {
      respond({ data: [row("a", { is_default: true }), row("b")], error: null });
    });
    await waitFor(() => expect(result.current.lists).toHaveLength(2));

    act(() => result.current.setSelectedListId("b"));

    expect(result.current.selectedListId).toBe("b");
    await waitFor(() => expect(localStorage.getItem(selectedListCacheKey(USER))).toBe("b"));
  });
});
