import { describe, it, expect, vi, beforeEach } from "vitest";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const handleSupabaseAuthError = vi.fn();
vi.mock("@/lib/supabaseAuthError", () => ({
  handleSupabaseAuthError: (...a: unknown[]) => handleSupabaseAuthError(...a),
}));

import { runOptimisticMutation, rollbackOptimistic } from "./optimisticMutation";

interface Row { id: string; name: string }
const r = (id: string, name = id): Row => ({ id, name });

/**
 * Minimal stand-in for a React state dispatcher. React invokes the functional
 * updater synchronously while dispatching, which is exactly the timing the
 * helper relies on for snapshot capture — so applying it synchronously here is
 * a faithful model.
 */
function makeSetState<T>(initial: T[]) {
  let state = initial;
  const setState = (u: T[] | ((prev: T[]) => T[])) => {
    state = typeof u === "function" ? (u as (prev: T[]) => T[])(state) : u;
  };
  return { setState, get: () => state };
}

describe("runOptimisticMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleSupabaseAuthError.mockResolvedValue("not-auth-error");
  });

  it("applies the optimistic change and keeps it on success", async () => {
    const store = makeSetState<Row>([r("1"), r("2"), r("3")]);
    const result = await runOptimisticMutation<Row>(
      store.setState,
      (prev) => prev.filter((x) => x.id !== "2"),
      () => Promise.resolve({ error: null }),
      { logLabel: "test:" },
    );
    expect(result.error).toBeNull();
    expect(store.get().map((x) => x.id)).toEqual(["1", "3"]);
    expect(toastError).not.toHaveBeenCalled();
    expect(handleSupabaseAuthError).not.toHaveBeenCalled();
  });

  it("rolls back the optimistic add and toasts on a non-auth server error", async () => {
    const store = makeSetState<Row>([r("1"), r("2"), r("3")]);
    const serverErr = { message: "constraint violation" };
    const result = await runOptimisticMutation<Row>(
      store.setState,
      (prev) => [...prev, r("4")],
      () => Promise.resolve({ error: serverErr }),
      { logLabel: "test:", toastMessage: "nope" },
    );
    expect(result.error).toBe(serverErr);
    expect(store.get().map((x) => x.id)).toEqual(["1", "2", "3"]); // add reverted
    expect(handleSupabaseAuthError).toHaveBeenCalledWith(serverErr);
    expect(toastError).toHaveBeenCalledWith("nope");
  });

  it("rolls back but does NOT toast when the error is an auth error (handled globally)", async () => {
    handleSupabaseAuthError.mockResolvedValue("redirected");
    const store = makeSetState<Row>([r("1", "a"), r("2", "b")]);
    const serverErr = { code: "PGRST301" };
    await runOptimisticMutation<Row>(
      store.setState,
      (prev) => prev.map((x) => ({ ...x, name: x.name.toUpperCase() })),
      () => Promise.resolve({ error: serverErr }),
      { logLabel: "test:" },
    );
    expect(store.get().map((x) => x.name)).toEqual(["a", "b"]); // rolled back
    expect(handleSupabaseAuthError).toHaveBeenCalledWith(serverErr);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("uses a default toast message when none is provided", async () => {
    const store = makeSetState<Row>([r("a")]);
    await runOptimisticMutation<Row>(
      store.setState,
      (prev) => [...prev, r("b")],
      () => Promise.resolve({ error: { message: "boom" } }),
      { logLabel: "test:" },
    );
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toMatch(/reverted/i);
  });

  it("preserves a concurrent realtime insert that arrives during a failed mutation (US-535)", async () => {
    const store = makeSetState<Row>([r("1", "Milk")]);
    const optimisticEdit = { id: "1", name: "Milk 2%" };
    await runOptimisticMutation<Row>(
      store.setState,
      () => [optimisticEdit],
      // Simulate a realtime INSERT landing while the server call is in flight.
      () => {
        store.setState((cur) => [...cur, r("2", "Eggs from other device")]);
        return Promise.resolve({ error: { message: "fail" } });
      },
      { logLabel: "test:" },
    );
    const ids = store.get().map((x) => x.id).sort();
    expect(ids).toEqual(["1", "2"]); // realtime row 2 survived the rollback
    expect(store.get().find((x) => x.id === "1")!.name).toBe("Milk"); // row 1 reverted
  });
});

describe("rollbackOptimistic — non-destructive (US-535)", () => {
  it("restores an optimistically-edited row to its snapshot value", () => {
    const snapshot = [r("1", "Milk"), r("2", "Eggs")];
    const optimistic = [r("1", "Milk 2%"), snapshot[1]];
    const out = rollbackOptimistic(optimistic, snapshot, optimistic);
    expect(out.find((x) => x.id === "1")!.name).toBe("Milk");
  });

  it("keeps a realtime edit that replaced the row during the mutation", () => {
    const snapshot = [r("1", "Milk")];
    const optimistic = [r("1", "Milk 2%")];
    const current = [r("1", "Milk (other device)")]; // different ref -> concurrent
    const out = rollbackOptimistic(current, snapshot, optimistic);
    expect(out[0].name).toBe("Milk (other device)");
  });

  it("drops an optimistic add but keeps a concurrent realtime insert", () => {
    const snapshot: Row[] = [];
    const added = r("mine", "Draft");
    const optimistic = [added];
    const current = [added, r("other", "From other device")];
    const out = rollbackOptimistic(current, snapshot, optimistic);
    expect(out.map((x) => x.id)).toEqual(["other"]);
  });

  it("re-adds an optimistically-deleted row not concurrently re-added", () => {
    const snapshot = [r("1"), r("2")];
    const optimistic = [snapshot[0]];
    const out = rollbackOptimistic([snapshot[0]], snapshot, optimistic);
    expect(out.map((x) => x.id).sort()).toEqual(["1", "2"]);
  });
});
