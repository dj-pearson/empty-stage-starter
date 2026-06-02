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

import { runOptimisticMutation } from "./optimisticMutation";

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
    const store = makeSetState<number>([1, 2, 3]);
    const result = await runOptimisticMutation<number>(
      store.setState,
      (prev) => prev.filter((n) => n !== 2),
      () => Promise.resolve({ error: null }),
      { logLabel: "test:" },
    );
    expect(result.error).toBeNull();
    expect(store.get()).toEqual([1, 3]);
    expect(toastError).not.toHaveBeenCalled();
    expect(handleSupabaseAuthError).not.toHaveBeenCalled();
  });

  it("rolls back to the snapshot and toasts on a non-auth server error", async () => {
    const store = makeSetState<number>([1, 2, 3]);
    const serverErr = { message: "constraint violation" };
    const result = await runOptimisticMutation<number>(
      store.setState,
      (prev) => [...prev, 4],
      () => Promise.resolve({ error: serverErr }),
      { logLabel: "test:", toastMessage: "nope" },
    );
    expect(result.error).toBe(serverErr);
    // rolled back to the original snapshot
    expect(store.get()).toEqual([1, 2, 3]);
    expect(handleSupabaseAuthError).toHaveBeenCalledWith(serverErr);
    expect(toastError).toHaveBeenCalledWith("nope");
  });

  it("rolls back but does NOT toast when the error is an auth error (handled globally)", async () => {
    handleSupabaseAuthError.mockResolvedValue("redirected");
    const store = makeSetState<number>([1, 2]);
    const serverErr = { code: "PGRST301" };
    await runOptimisticMutation<number>(
      store.setState,
      (prev) => prev.map((n) => n * 10),
      () => Promise.resolve({ error: serverErr }),
      { logLabel: "test:" },
    );
    expect(store.get()).toEqual([1, 2]); // rolled back
    expect(handleSupabaseAuthError).toHaveBeenCalledWith(serverErr);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("uses a default toast message when none is provided", async () => {
    const store = makeSetState<string>(["a"]);
    await runOptimisticMutation<string>(
      store.setState,
      (prev) => [...prev, "b"],
      () => Promise.resolve({ error: { message: "boom" } }),
      { logLabel: "test:" },
    );
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toMatch(/reverted/i);
  });
});
