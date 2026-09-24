import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

type Result = { data: unknown; error: unknown };

// A chainable stand-in for the PostgREST builder that records each call.
const calls: Array<{ op: string; args: unknown[] }> = [];
let readResult: Result = { data: null, error: null };
let insertResult: Result = { data: null, error: null };
let updateResult: Result = { data: null, error: null };

function builder(kind: "read" | "insert" | "update") {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "limit"]) {
    b[m] = (...args: unknown[]) => {
      calls.push({ op: m, args });
      return b;
    };
  }
  b.maybeSingle = async () => readResult;
  b.single = async () => insertResult;
  b.then = (resolve: (v: Result) => unknown) => resolve(kind === "update" ? updateResult : readResult);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: (...args: unknown[]) => {
        calls.push({ op: "select", args });
        return builder("read");
      },
      insert: (...args: unknown[]) => {
        calls.push({ op: "insert", args });
        return builder("insert");
      },
      update: (...args: unknown[]) => {
        calls.push({ op: "update", args });
        return builder("update");
      },
    }),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { buildRecipeShareUrl, useRecipeShareLink } from "./useRecipeShareLink";

const TOKEN = "t".repeat(64);

beforeEach(() => {
  calls.length = 0;
  readResult = { data: null, error: null };
  insertResult = { data: null, error: null };
  updateResult = { data: null, error: null };
});

describe("buildRecipeShareUrl", () => {
  it("points at the public route", () => {
    expect(buildRecipeShareUrl("abc", "https://tryeatpal.com")).toBe("https://tryeatpal.com/r/abc");
  });
});

describe("useRecipeShareLink", () => {
  it("loads the live link for the recipe", async () => {
    readResult = { data: { id: "s1", token: TOKEN, created_at: "2026-09-24" }, error: null };
    const { result } = renderHook(() => useRecipeShareLink("r1", "h1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.link?.url).toMatch(new RegExp(`/r/${TOKEN}$`));
    expect(calls).toContainEqual({ op: "is", args: ["revoked_at", null] });
  });

  it("creates a link without sending a token", async () => {
    insertResult = { data: { id: "s2", token: TOKEN, created_at: "2026-09-24" }, error: null };
    const { result } = renderHook(() => useRecipeShareLink("r1", "h1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let link: Awaited<ReturnType<typeof result.current.ensure>> = null;
    await act(async () => {
      link = await result.current.ensure();
    });
    expect(link).toMatchObject({ id: "s2", token: TOKEN });
    const insert = calls.find((c) => c.op === "insert");
    expect(insert?.args[0]).toEqual({ recipe_id: "r1", household_id: "h1" });
  });

  it("uses the other parent's link when one already exists (23505)", async () => {
    insertResult = { data: null, error: { code: "23505", message: "duplicate" } };
    const { result } = renderHook(() => useRecipeShareLink("r1", "h1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    readResult = { data: { id: "s3", token: TOKEN, created_at: "2026-09-24" }, error: null };
    await act(async () => {
      await result.current.ensure();
    });
    expect(result.current.link?.id).toBe("s3");
  });

  it("revokes by setting revoked_at on the live link", async () => {
    readResult = { data: { id: "s1", token: TOKEN, created_at: "2026-09-24" }, error: null };
    const { result } = renderHook(() => useRecipeShareLink("r1", "h1"));
    await waitFor(() => expect(result.current.link).not.toBeNull());
    let ok = false;
    await act(async () => {
      ok = await result.current.revoke();
    });
    expect(ok).toBe(true);
    expect(result.current.link).toBeNull();
    const update = calls.find((c) => c.op === "update");
    expect(Object.keys(update?.args[0] as object)).toEqual(["revoked_at"]);
    expect(calls).toContainEqual({ op: "eq", args: ["id", "s1"] });
  });

  it("does nothing while closed", () => {
    renderHook(() => useRecipeShareLink("r1", "h1", false));
    expect(calls).toEqual([]);
  });
});
