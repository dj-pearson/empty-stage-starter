import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

/**
 * US-829: the newest search is the only one allowed to write.
 *
 * The debounce cleanup cancels the TIMER, not a query already in flight. Typing
 * "ch" then "chicken" starts both; `%ch%` matches far more rows than
 * `%chicken%`, so the broader, staler query is the one MORE likely to finish
 * last. It used to win, leaving results for "ch" under a box reading "chicken".
 *
 * The race is made deterministic here by handing out deferred promises and
 * resolving them in the damaging order, rather than hoping timing reproduces it.
 */

interface Deferred {
  query: string;
  resolve: (rows: unknown[]) => void;
}
const pending: Deferred[] = [];

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (query: { value: string }) => ({
    select: () => builder(query),
    ilike: (_col: string, pattern: string) => {
      query.value = pattern;
      return builder(query);
    },
    limit: () =>
      new Promise((res) => {
        pending.push({
          query: query.value,
          resolve: (rows) => res({ data: rows, error: null }),
        });
      }),
  });
  return { supabase: { from: () => builder({ value: "" }) } };
});

import { AddFoodDialog } from "./AddFoodDialog";

const row = (name: string) => ({ id: name, name, serving_size: "1", serving_unit: "cup" });

async function type(value: string) {
  const input = screen.getByPlaceholderText(/at least 2 characters/i);
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
  // let the 300ms debounce fire
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
}

beforeEach(() => {
  pending.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

describe("food search under a fast typist", () => {
  it("ignores an earlier query that resolves after a later one", async () => {
    render(<AddFoodDialog open onOpenChange={() => {}} onSave={() => {}} />);

    await type("ch");
    await type("chicken");

    expect(pending.map((p) => p.query)).toEqual(["%ch%", "%chicken%"]);

    // The damaging order: the newest lands first, then the stale broad query.
    await act(async () => {
      pending[1].resolve([row("chicken breast")]);
    });
    await act(async () => {
      pending[0].resolve([row("cheddar"), row("cherry")]);
    });

    expect(screen.queryByText("chicken breast")).toBeTruthy();
    expect(screen.queryByText("cheddar")).toBeNull();
    expect(screen.queryByText("cherry")).toBeNull();
  });

  it("still shows results when only one query is in flight", async () => {
    render(<AddFoodDialog open onOpenChange={() => {}} onSave={() => {}} />);
    await type("chicken");
    await act(async () => {
      pending[0].resolve([row("chicken breast")]);
    });
    expect(screen.queryByText("chicken breast")).toBeTruthy();
  });

  // The other half of the guard. If a stale request is allowed to clear the
  // spinner, the list falls through to "No foods found." while the CURRENT
  // search is still running -- a flash of "nothing here" over a query that is
  // about to return results.
  it("a stale request finishing does not clear the spinner", async () => {
    render(<AddFoodDialog open onOpenChange={() => {}} onSave={() => {}} />);

    await type("ch");
    await type("chicken");
    expect(pending).toHaveLength(2);

    // The ordinary ordering: the earlier query finishes first.
    await act(async () => {
      pending[0].resolve([row("cheddar")]);
    });

    expect(screen.queryByText(/no foods found/i)).toBeNull();
    expect(screen.queryByText("cheddar")).toBeNull();

    await act(async () => {
      pending[1].resolve([row("chicken breast")]);
    });
    expect(screen.queryByText("chicken breast")).toBeTruthy();
  });
});
