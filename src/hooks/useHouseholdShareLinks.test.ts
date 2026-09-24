import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

type Result = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  calls: [] as Array<{ op: string; args: unknown[] }>,
  readResult: { data: [] as unknown, error: null as unknown } as Result,
  failIds: new Set<string>(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (onEq?: (col: string, val: unknown) => Result) => {
    let last: Result = h.readResult;
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order"]) {
      b[m] = (...args: unknown[]) => {
        h.calls.push({ op: m, args });
        if (m === "eq" && onEq) last = onEq(args[0] as string, args[1]);
        return b;
      };
    }
    b.then = (resolve: (v: Result) => unknown) => resolve(last);
    return b;
  };
  return {
    supabase: {
      from: (table: string) => {
        h.calls.push({ op: "from", args: [table] });
        return {
          select: (...args: unknown[]) => {
            h.calls.push({ op: "select", args });
            return chain();
          },
          update: (...args: unknown[]) => {
            h.calls.push({ op: "update", args });
            return chain((_col, id) =>
              h.failIds.has(id as string) ? { data: null, error: { message: "denied" } } : { data: null, error: null }
            );
          },
        };
      },
    },
  };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ userId: "u1", householdId: "h1" }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { HOUSEHOLD_SHARE_LINKS_SELECT, useHouseholdShareLinks } from "./useHouseholdShareLinks";

const TOKEN = "t".repeat(64);
const row = (id: string, name: string | null, created_by: string | null = "u1") => ({
  id,
  token: `${TOKEN}${id}`,
  created_at: "2026-09-20T10:00:00Z",
  created_by,
  recipe_id: `r-${id}`,
  recipes: name === null ? null : { name },
});

beforeEach(() => {
  h.calls.length = 0;
  h.failIds.clear();
  h.readResult = { data: [row("s1", "Mac and cheese"), row("s2", null, "u2"), row("s3", "Tacos")], error: null };
});

describe("useHouseholdShareLinks", () => {
  it("reads live links for the household, newest first", async () => {
    const { result } = renderHook(() => useHouseholdShareLinks());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(h.calls).toContainEqual({ op: "from", args: ["recipe_shares"] });
    expect(HOUSEHOLD_SHARE_LINKS_SELECT).toBe("id, token, created_at, created_by, recipe_id, recipes(name)");
    expect(h.calls).toContainEqual({ op: "select", args: [HOUSEHOLD_SHARE_LINKS_SELECT] });
    expect(h.calls).toContainEqual({ op: "eq", args: ["household_id", "h1"] });
    expect(h.calls).toContainEqual({ op: "is", args: ["revoked_at", null] });
    expect(h.calls).toContainEqual({ op: "order", args: ["created_at", { ascending: false }] });
    expect(result.current.links.map((l) => l.recipeName)).toEqual(["Mac and cheese", null, "Tacos"]);
    expect(result.current.links[0].url).toMatch(/\/r\/t+s1$/);
  });

  it("revokeAll turns off every live id through the same update", async () => {
    const { result } = renderHook(() => useHouseholdShareLinks());
    await waitFor(() => expect(result.current.links).toHaveLength(3));
    h.calls.length = 0;
    let out = { revoked: 0, failed: 0 };
    await act(async () => {
      out = await result.current.revokeAll();
    });
    expect(out).toEqual({ revoked: 3, failed: 0 });
    const updates = h.calls.filter((c) => c.op === "update");
    expect(updates).toHaveLength(3);
    for (const u of updates) expect(Object.keys(u.args[0] as object)).toEqual(["revoked_at"]);
    const ids = h.calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(ids).toEqual([
      ["id", "s1"],
      ["id", "s2"],
      ["id", "s3"],
    ]);
    expect(result.current.links).toEqual([]);
  });

  it("keeps the links whose revoke failed", async () => {
    h.failIds.add("s2");
    const { result } = renderHook(() => useHouseholdShareLinks());
    await waitFor(() => expect(result.current.links).toHaveLength(3));
    let out = { revoked: 0, failed: 0 };
    await act(async () => {
      out = await result.current.revokeAll();
    });
    expect(out).toEqual({ revoked: 2, failed: 1 });
    expect(result.current.links.map((l) => l.id)).toEqual(["s2"]);
  });

  it("revoke(id) removes one row", async () => {
    const { result } = renderHook(() => useHouseholdShareLinks());
    await waitFor(() => expect(result.current.links).toHaveLength(3));
    let ok = false;
    await act(async () => {
      ok = await result.current.revoke("s3");
    });
    expect(ok).toBe(true);
    expect(result.current.links.map((l) => l.id)).toEqual(["s1", "s2"]);
  });
});
