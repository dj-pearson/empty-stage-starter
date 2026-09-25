import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import "@/i18n";

type Call = [string, ...unknown[]];

interface Recorded {
  table: string;
  calls: Call[];
}

const state = vi.hoisted(() => ({
  queries: [] as Recorded[],
  online: true,
  feedbackError: null as unknown,
  feedbackRows: [] as unknown[],
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: state.toastError, success: vi.fn() } }));
vi.mock("@/hooks/useCommon", () => ({ useOnline: () => state.online }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => {
  function builder(table: string) {
    const rec: Recorded = { table, calls: [] };
    state.queries.push(rec);
    const settle = () => {
      if (table === "plan_entry_feedback") {
        return { data: state.feedbackError ? null : state.feedbackRows, error: state.feedbackError };
      }
      const inCall = rec.calls.find((c) => c[0] === "in");
      const ids = (inCall?.[2] as string[]) ?? [];
      return { data: ids.map((id) => ({ id, plan_entry_id: null, reaction_notes: null, parent_notes: null, attempted_at: null })), error: null };
    };
    const proxy: Record<string, unknown> = {};
    for (const method of ["select", "not", "gte", "lte", "eq", "order", "range", "in"]) {
      proxy[method] = (...args: unknown[]) => {
        rec.calls.push([method, ...args]);
        return proxy;
      };
    }
    proxy.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject);
    return proxy;
  }
  return { supabase: { from: (table: string) => builder(table) } };
});

import { ATTEMPT_CHUNK_SIZE, FEEDBACK_TOAST_ID, useJournalFeedback } from "./useJournalFeedback";

const feedbackQueries = () => state.queries.filter((q) => q.table === "plan_entry_feedback");
const attemptQueries = () => state.queries.filter((q) => q.table === "food_attempts");

beforeEach(() => {
  state.queries.length = 0;
  state.online = true;
  state.feedbackError = null;
  state.feedbackRows = [];
  state.toastError.mockReset();
});

describe("useJournalFeedback", () => {
  it("bounds feedback by the plan entry's local date, not created_at", async () => {
    state.feedbackRows = [
      { id: "f1", plan_entry_id: "p1", user_id: "u1", rating: 3, note: "ok", created_at: "2026-09-20T12:00:00Z", plan_entries: { date: "2026-09-20", kid_id: "k1" } },
    ];
    const { result } = renderHook(() => useJournalFeedback({ from: "2026-09-18", to: "2026-09-24" }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const calls = feedbackQueries()[0].calls;
    expect(calls).toContainEqual(["gte", "plan_entries.date", "2026-09-18"]);
    expect(calls).toContainEqual(["lte", "plan_entries.date", "2026-09-24"]);
    expect(calls).toContainEqual(["not", "note", "is", null]);
    expect(calls.some((c) => c[1] === "created_at" && (c[0] === "gte" || c[0] === "lte"))).toBe(false);
    expect(calls.some((c) => c[0] === "eq")).toBe(false);
    expect(calls.filter((c) => c[0] === "order").map((c) => c[1])).toEqual(["created_at", "id"]);
    expect(calls.some((c) => c[0] === "range")).toBe(true);
    expect(String(calls.find((c) => c[0] === "select")?.[1])).toContain("plan_entries!inner(date, kid_id)");
    // The join payload is dropped.
    expect(result.current.feedback).toEqual([
      { id: "f1", plan_entry_id: "p1", user_id: "u1", rating: 3, note: "ok", created_at: "2026-09-20T12:00:00Z" },
    ]);
  });

  it("filters to one kid when kidId is set", async () => {
    const { result } = renderHook(() => useJournalFeedback({ from: "2026-09-18", to: "2026-09-24", kidId: "k2" }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(feedbackQueries()[0].calls).toContainEqual(["eq", "plan_entries.kid_id", "k2"]);
  });

  it("skips the fetch and reports offline when there is no connection", async () => {
    state.online = false;
    const { result } = renderHook(() => useJournalFeedback({ from: "2026-09-18", to: "2026-09-24" }));
    expect(result.current.status).toBe("offline");
    await act(async () => {});
    expect(state.queries).toHaveLength(0);
  });

  it("reuses one toast id when a retry fails again", async () => {
    state.feedbackError = { message: "boom" };
    const { result } = renderHook(() => useJournalFeedback({ from: "2026-09-18", to: "2026-09-24" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe("error");

    act(() => result.current.reload());
    await waitFor(() => expect(state.toastError).toHaveBeenCalledTimes(2));
    for (const [, opts] of state.toastError.mock.calls) {
      expect(opts).toMatchObject({ id: FEEDBACK_TOAST_ID, action: { label: "Retry" } });
    }
  });

  it("keeps the last good rows while a reload fails", async () => {
    state.feedbackRows = [
      { id: "f1", plan_entry_id: "p1", user_id: "u1", rating: 3, note: "ok", created_at: "2026-09-20T12:00:00Z" },
    ];
    const { result } = renderHook(() => useJournalFeedback({ from: "2026-09-18", to: "2026-09-24" }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    state.feedbackError = { message: "boom" };
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.feedback).toHaveLength(1);
  });

  it("reads attempts in chunks of 100", async () => {
    const attemptIds = Array.from({ length: 250 }, (_, i) => `a${String(i).padStart(3, "0")}`);
    const { result } = renderHook(() => useJournalFeedback({ from: "2026-09-18", to: "2026-09-24", attemptIds }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const sizes = attemptQueries().map((q) => (q.calls.find((c) => c[0] === "in")?.[2] as string[]).length);
    expect(ATTEMPT_CHUNK_SIZE).toBe(100);
    expect(sizes).toEqual([100, 100, 50]);
    expect(result.current.attempts).toHaveLength(250);
  });
});
