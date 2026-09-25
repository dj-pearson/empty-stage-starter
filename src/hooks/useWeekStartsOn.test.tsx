import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const auth = { userId: "u1" as string | null, householdId: null };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const maybeSingle = vi.fn();
const upsert = vi.fn();
const eqCalls: Array<[string, unknown]> = [];
vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return chain;
    },
    maybeSingle: () => maybeSingle(),
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table !== "user_preferences") throw new Error(`unexpected table ${table}`);
        return { ...chain, upsert: (row: unknown, opts: unknown) => upsert(row, opts) };
      },
    },
  };
});

import { useWeekStartsOn, useWeekStartsOnSetting, resetWeekStartsOnRequestsForTests } from "./useWeekStartsOn";
import { resetWeekStartsOnForTests, getWeekStartsOn } from "@/lib/weekStartPref";

beforeEach(() => {
  localStorage.clear();
  resetWeekStartsOnForTests();
  resetWeekStartsOnRequestsForTests();
  maybeSingle.mockReset();
  upsert.mockReset();
  eqCalls.length = 0;
  auth.userId = "u1";
});

describe("useWeekStartsOn", () => {
  it("is Monday until the server says otherwise, then follows the user's row", async () => {
    maybeSingle.mockResolvedValue({ data: { value: 0 }, error: null });
    const { result } = renderHook(() => useWeekStartsOn());
    expect(result.current).toBe(1);
    await waitFor(() => expect(result.current).toBe(0));
    expect(eqCalls).toEqual([
      ["user_id", "u1"],
      ["key", "week_starts_on"],
    ]);
  });

  it("keeps Monday when the user never chose", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useWeekStartsOn());
    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    expect(result.current).toBe(1);
  });

  it("reads the server once per user however many components ask", async () => {
    maybeSingle.mockResolvedValue({ data: { value: 1 }, error: null });
    renderHook(() => [useWeekStartsOn(), useWeekStartsOn()]);
    renderHook(() => useWeekStartsOn());
    await waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(1));
  });

  it("re-reads A's row after switching A -> B -> A", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { value: 0 }, error: null });
    const hook = renderHook(() => useWeekStartsOn());
    await waitFor(() => expect(hook.result.current).toBe(0));

    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    auth.userId = "u2";
    hook.rerender();
    await waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(2));
    expect(hook.result.current).toBe(1);

    maybeSingle.mockResolvedValueOnce({ data: { value: 0 }, error: null });
    auth.userId = "u1";
    hook.rerender();
    await waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(hook.result.current).toBe(0));
  });

  it("drops a load that answers after the user switched", async () => {
    let resolveA: (v: unknown) => void = () => {};
    maybeSingle.mockImplementationOnce(() => new Promise((r) => { resolveA = r; }));
    const hook = renderHook(() => useWeekStartsOn());
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    auth.userId = "u2";
    hook.rerender();
    await waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveA({ data: { value: 0 }, error: null });
    });
    expect(hook.result.current).toBe(1);
  });

  it("does not query without a signed-in user", () => {
    auth.userId = null;
    const { result } = renderHook(() => useWeekStartsOn());
    expect(result.current).toBe(1);
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("stays on the cached value when the read fails", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: "500", message: "down" } });
    const { result } = renderHook(() => useWeekStartsOn());
    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    expect(result.current).toBe(1);
  });
});

describe("useWeekStartsOnSetting", () => {
  it("applies at once and upserts the user's row on (user_id, key)", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    upsert.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useWeekStartsOnSetting());
    let res: { error: string | null } = { error: "unset" };
    await act(async () => {
      res = await result.current.setWeekStartsOn(0);
    });
    expect(res.error).toBeNull();
    expect(result.current.weekStartsOn).toBe(0);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", key: "week_starts_on", value: 0 }),
      { onConflict: "user_id,key" },
    );
  });

  it("reports a failed save but keeps the change on this device", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    upsert.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    const { result } = renderHook(() => useWeekStartsOnSetting());
    let res: { error: string | null } = { error: null };
    await act(async () => {
      res = await result.current.setWeekStartsOn(0);
    });
    expect(res.error).toBe("denied");
    expect(getWeekStartsOn()).toBe(0);
  });
});
