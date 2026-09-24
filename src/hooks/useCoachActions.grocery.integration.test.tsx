/**
 * useCoachActions against the real GroceryProvider, not a stub of it.
 *
 * useCoachActions.test.tsx mocks mergeGroceryItems with the shape it expects
 * back ({ touched, insertedIds, bumps }). This file checks that the shape is
 * what GroceryContext actually returns, that the row lands with added_via
 * "ai_coach", and that Undo removes exactly the row the chip added. Only the
 * network edges (Supabase client, auth, realtime) and the plan context are
 * stubbed.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import "@/i18n";
import "@/i18n/appLocale";
import type { Food, GroceryItem, Kid } from "@/types";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  rpc: vi.fn(),
  del: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (...a: unknown[]) => mocks.insert(...a),
      delete: () => ({ in: (...a: unknown[]) => mocks.del(...a) }),
    }),
    rpc: (...a: unknown[]) => mocks.rpc(...a),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userId: "u1", householdId: "h1" }),
}));

vi.mock("@/hooks/useRealtimeSubscription", () => ({
  registerSubscription: vi.fn(),
  unregisterSubscription: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/PlanContext", () => ({
  usePlan: () => ({ addPlanEntry: vi.fn(), deletePlanEntries: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: mocks.toastSuccess, error: mocks.toastError }),
}));

import { GroceryProvider, useGrocery } from "@/contexts/GroceryContext";
import { useCoachActions } from "./useCoachActions";

const KID: Kid = { id: "k1", name: "Ava", allergens: ["peanut"], allergen_severity: { peanut: "severe" } };
const CARROTS: Food = {
  id: "f-carrot",
  name: "carrots",
  category: "vegetable",
  is_safe: false,
  is_try_bite: true,
  allergens: [],
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <GroceryProvider>{children}</GroceryProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.insert.mockReturnValue({ select: () => Promise.resolve({ data: [], error: null }) });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.del.mockResolvedValue({ error: null });
});

describe("useCoachActions + real GroceryProvider", () => {
  it("adds the food as an ai_coach row, marks the chip done, and Undo takes the same row back out", async () => {
    const { result } = renderHook(
      () => ({
        coach: useCoachActions({
          kid: KID,
          foods: [CARROTS],
          planEntries: [],
          ladderRows: [],
          addFoodToLadder: vi.fn().mockResolvedValue(true),
        }),
        grocery: useGrocery(),
      }),
      { wrapper },
    );

    const chip = result.current.coach
      .actionsFor("Try carrots on the side tonight.")
      .find((a) => a.type === "grocery");
    expect(chip?.status).toBe("ok");

    await act(() => result.current.coach.run(chip as NonNullable<typeof chip>));

    const rows: GroceryItem[] = result.current.grocery.groceryItems;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("carrots");
    expect(rows[0].added_via).toBe("ai_coach");
    expect(result.current.coach.done.has("grocery:f-carrot")).toBe(true);
    expect(mocks.toastError).not.toHaveBeenCalled();

    const undo = (mocks.toastSuccess.mock.calls.at(-1)?.[1] as { action?: { onClick: () => void } } | undefined)
      ?.action?.onClick;
    expect(undo).toBeTypeOf("function");
    act(() => undo?.());

    await waitFor(() => expect(result.current.grocery.groceryItems).toHaveLength(0));
    expect(result.current.coach.done.has("grocery:f-carrot")).toBe(false);
  });
});
