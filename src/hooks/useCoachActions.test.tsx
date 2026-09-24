import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import "@/i18n";
import "@/i18n/appLocale";
import type { Food, Kid, PlanEntry } from "@/types";
import { pickNextOpenSlot, type CoachAction } from "@/lib/coachReply";

const mocks = vi.hoisted(() => ({
  addPlanEntry: vi.fn(),
  deletePlanEntries: vi.fn(),
  mergeGroceryItems: vi.fn(),
  deleteGroceryItems: vi.fn(),
  updateGroceryItem: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/contexts/AppContext", () => ({
  usePlan: () => ({ addPlanEntry: mocks.addPlanEntry, deletePlanEntries: mocks.deletePlanEntries }),
  useGrocery: () => ({
    mergeGroceryItems: mocks.mergeGroceryItems,
    deleteGroceryItems: mocks.deleteGroceryItems,
    updateGroceryItem: mocks.updateGroceryItem,
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: mocks.toastSuccess, error: mocks.toastError }),
}));

import { useCoachActions } from "./useCoachActions";

const KID: Kid = {
  id: "k1",
  name: "Ava",
  allergens: ["peanut"],
  allergen_severity: { peanut: "severe" },
};

const FOODS: Food[] = [
  { id: "f-carrot", name: "carrots", category: "vegetable", is_safe: false, is_try_bite: true, allergens: [] },
  { id: "f-pb", name: "peanut butter", category: "protein", is_safe: true, is_try_bite: false, allergens: ["peanut"] },
];

const PLAN: PlanEntry[] = [];
const REPLY = "Serve carrots next to her pasta tonight. Skip the peanut butter for now.";

function setup(addFoodToLadder = vi.fn().mockResolvedValue(true)) {
  const hook = renderHook(() =>
    useCoachActions({ kid: KID, foods: FOODS, planEntries: PLAN, ladderRows: [], addFoodToLadder }),
  );
  return { ...hook, addFoodToLadder };
}

function find(actions: CoachAction[], type: CoachAction["type"], foodId: string): CoachAction {
  const a = actions.find((x) => x.type === type && x.food.id === foodId);
  if (!a) throw new Error(`no ${type} for ${foodId}`);
  return a;
}

type ToastOptions = { action?: { onClick: () => void } };
const lastUndo = () => {
  const call = mocks.toastSuccess.mock.calls.at(-1);
  return (call?.[1] as ToastOptions | undefined)?.action?.onClick;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 24, 10, 0, 0));
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.addPlanEntry.mockResolvedValue({ error: null, insertedIds: ["p1"] });
  mocks.deletePlanEntries.mockResolvedValue({ error: null, removed: [] });
  mocks.mergeGroceryItems.mockReturnValue({ touched: 1, insertedIds: ["g1"], bumps: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCoachActions", () => {
  it("offers carrots and blocks peanut butter for a severe-peanut kid", () => {
    const { result } = setup();
    const actions = result.current.actionsFor(REPLY);
    expect(find(actions, "try_bite", "f-carrot").status).toBe("ok");
    const pb = find(actions, "try_bite", "f-pb");
    expect(pb.status).toBe("blocked");
    expect(pb.reason).toEqual({ allergen: "peanut", severity: "severe" });
  });

  it("makes no write for a blocked action", async () => {
    const { result, addFoodToLadder } = setup();
    const pb = find(result.current.actionsFor(REPLY), "try_bite", "f-pb");
    await act(() => result.current.run(pb));
    // A stale chip that claims ok is re-checked at tap time.
    await act(() => result.current.run({ ...pb, status: "ok" }));
    await act(() => result.current.run({ ...pb, key: "ladder:f-pb", type: "ladder", status: "ok" }));
    expect(mocks.addPlanEntry).not.toHaveBeenCalled();
    expect(addFoodToLadder).not.toHaveBeenCalled();
    expect(mocks.mergeGroceryItems).not.toHaveBeenCalled();
  });

  it("writes a try bite once on a double tap, in the next open slot for this kid", async () => {
    const { result } = setup();
    const carrots = find(result.current.actionsFor(REPLY), "try_bite", "f-carrot");
    await act(async () => {
      await Promise.all([result.current.run(carrots), result.current.run(carrots)]);
    });
    await act(() => result.current.run(carrots));

    const slot = pickNextOpenSlot("k1", PLAN, new Date());
    expect(mocks.addPlanEntry).toHaveBeenCalledTimes(1);
    expect(mocks.addPlanEntry).toHaveBeenCalledWith({
      kid_id: "k1",
      food_id: "f-carrot",
      date: slot.date,
      meal_slot: slot.meal_slot,
      result: null,
    });
    expect(result.current.done.has(carrots.key)).toBe(true);
    expect(result.current.pending.has(carrots.key)).toBe(false);
  });

  it("Undo deletes the inserted plan rows", async () => {
    const { result } = setup();
    const carrots = find(result.current.actionsFor(REPLY), "try_bite", "f-carrot");
    await act(() => result.current.run(carrots));
    const undo = lastUndo();
    expect(undo).toBeTypeOf("function");
    await act(async () => {
      undo?.();
    });
    expect(mocks.deletePlanEntries).toHaveBeenCalledWith(["p1"]);
    expect(result.current.done.has(carrots.key)).toBe(false);
  });

  it("adds to grocery through mergeGroceryItems tagged ai_coach, with Undo", async () => {
    const { result } = setup();
    const grocery = find(result.current.actionsFor("Roast some carrots."), "grocery", "f-carrot");
    await act(() => result.current.run(grocery));
    expect(mocks.mergeGroceryItems).toHaveBeenCalledTimes(1);
    expect(mocks.mergeGroceryItems.mock.calls[0][0]).toEqual([
      expect.objectContaining({ name: "carrots", quantity: 1, added_via: "ai_coach" }),
    ]);
    act(() => lastUndo()?.());
    expect(mocks.deleteGroceryItems).toHaveBeenCalledWith(["g1"]);
  });

  it("toasts the failure when the ladder refuses", async () => {
    const { result, addFoodToLadder } = setup(vi.fn().mockResolvedValue(false));
    const ladder = find(result.current.actionsFor(REPLY), "ladder", "f-carrot");
    await act(() => result.current.run(ladder));
    expect(addFoodToLadder).toHaveBeenCalledWith("f-carrot", null, "k1");
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("Couldn't add carrots to the ladder"));
    expect(result.current.done.has(ladder.key)).toBe(false);
  });
});
