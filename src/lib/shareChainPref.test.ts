import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  rows: new Map<string, boolean>(),
  readError: null as unknown,
  upsertError: null as unknown,
  reads: [] as string[],
  upserts: [] as Array<{ row: Record<string, unknown>; opts: unknown }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_col: string, userId: string) => ({
          maybeSingle: async () => {
            h.reads.push(userId);
            if (h.readError) return { data: null, error: h.readError };
            return {
              data: h.rows.has(userId) ? { share_chain_outcomes: h.rows.get(userId) } : null,
              error: null,
            };
          },
        }),
      }),
      upsert: async (row: Record<string, unknown>, opts: unknown) => {
        h.upserts.push({ row, opts });
        if (h.upsertError) return { error: h.upsertError };
        h.rows.set(row.user_id as string, row.share_chain_outcomes as boolean);
        return { error: null };
      },
    }),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import {
  SHARE_CHAIN_CACHE_KEY,
  adoptShareChainUser,
  getShareChainState,
  isShareChainOptedIn,
  loadShareChainPref,
  resetShareChainPrefForTests,
  setShareChainPref,
} from "./shareChainPref";

beforeEach(() => {
  resetShareChainPrefForTests();
  localStorage.clear();
  h.rows.clear();
  h.readError = null;
  h.upsertError = null;
  h.reads.length = 0;
  h.upserts.length = 0;
});

describe("shareChainPref", () => {
  it("loads the value from the server row", async () => {
    h.rows.set("u1", false);
    await loadShareChainPref("u1");
    expect(getShareChainState()).toMatchObject({ userId: "u1", value: false, loaded: true });
    expect(isShareChainOptedIn()).toBe(false);
  });

  it("treats no row as the column default (on)", async () => {
    await loadShareChainPref("u1");
    expect(getShareChainState()).toMatchObject({ value: true, loaded: true });
    expect(isShareChainOptedIn()).toBe(true);
  });

  it("fails closed before the server answers, whatever the cache says", async () => {
    localStorage.setItem(SHARE_CHAIN_CACHE_KEY, JSON.stringify({ u: "u1", v: true }));
    adoptShareChainUser("u1");
    expect(getShareChainState()).toMatchObject({ value: true, loaded: false });
    expect(isShareChainOptedIn()).toBe(false);
  });

  it("stays closed when the load fails", async () => {
    h.readError = { code: "500", message: "down" };
    await loadShareChainPref("u1");
    expect(getShareChainState().loaded).toBe(false);
    expect(isShareChainOptedIn()).toBe(false);
  });

  it("upserts on user_id and keeps the new value", async () => {
    await loadShareChainPref("u1");
    const { error } = await setShareChainPref("u1", false);
    expect(error).toBeNull();
    expect(h.upserts[0].row).toMatchObject({ user_id: "u1", share_chain_outcomes: false });
    expect(h.upserts[0].opts).toEqual({ onConflict: "user_id" });
    expect(getShareChainState()).toMatchObject({ value: false, pending: false, loaded: true });
  });

  it("reverts when the upsert fails", async () => {
    await loadShareChainPref("u1");
    h.upsertError = { code: "42501", message: "denied" };
    const pending = setShareChainPref("u1", false);
    expect(getShareChainState()).toMatchObject({ value: false, pending: true });
    const { error } = await pending;
    expect(error).toBe("denied");
    expect(getShareChainState()).toMatchObject({ value: true, pending: false });
  });

  it("survives a scrub of the local key by re-reading the server", async () => {
    await loadShareChainPref("u1");
    await setShareChainPref("u1", false);
    // Sign-out: the scrub removes the cache key, the page reloads.
    localStorage.removeItem(SHARE_CHAIN_CACHE_KEY);
    resetShareChainPrefForTests();
    await loadShareChainPref("u1");
    expect(getShareChainState()).toMatchObject({ value: false, loaded: true });
    expect(isShareChainOptedIn()).toBe(false);
  });

  it("scopes the cache to its user", async () => {
    h.rows.set("u1", false);
    await loadShareChainPref("u1");
    adoptShareChainUser(null);
    expect(getShareChainState()).toMatchObject({ userId: null, loaded: false });
    // A second account on the same browser does not paint u1's choice.
    adoptShareChainUser("u2");
    expect(getShareChainState()).toMatchObject({ userId: "u2", value: true, loaded: false });
    // And u1 coming back paints its own.
    adoptShareChainUser("u1");
    expect(getShareChainState()).toMatchObject({ userId: "u1", value: false, loaded: false });
  });

  it("drops a load that answers after the user switched", async () => {
    h.rows.set("u1", false);
    const first = loadShareChainPref("u1");
    adoptShareChainUser("u2");
    await first;
    expect(getShareChainState()).toMatchObject({ userId: "u2", loaded: false });
  });

  it("carries a legacy device-only opt-out to the server once", async () => {
    // The pre-store hook wrote a bare JSON boolean.
    localStorage.setItem(SHARE_CHAIN_CACHE_KEY, "false");
    await loadShareChainPref("u1");
    expect(getShareChainState()).toMatchObject({ value: false, loaded: true });
    expect(h.upserts[0].row).toMatchObject({ user_id: "u1", share_chain_outcomes: false });
  });
});
