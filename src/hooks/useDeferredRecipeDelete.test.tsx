import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import "@/i18n";
import type { Recipe } from "@/types";

interface CapturedToast {
  message: string;
  opts: {
    id?: string;
    duration?: number;
    action?: { label: string; onClick: () => void };
    onAutoClose?: () => void;
    onDismiss?: () => void;
  };
}

const { toasts, dismiss } = vi.hoisted(() => ({
  toasts: [] as CapturedToast[],
  dismiss: vi.fn(),
}));

vi.mock("sonner", () => {
  const toast = Object.assign(
    vi.fn((message: string, opts: CapturedToast["opts"]) => {
      toasts.push({ message, opts });
      return opts.id ?? toasts.length;
    }),
    { dismiss, success: vi.fn(), error: vi.fn() },
  );
  return { toast };
});

import { useDeferredRecipeDelete, RECIPE_DELETE_UNDO_MS } from "./useDeferredRecipeDelete";

const TACOS: Recipe = { id: "r-tacos", name: "Fish tacos", food_ids: [] };

function setup() {
  const deleteRecipe = vi.fn();
  const dropRecipe = vi.fn();
  const onRequested = vi.fn();
  const hook = renderHook(() => useDeferredRecipeDelete({ deleteRecipe, dropRecipe, onRequested }));
  return { ...hook, deleteRecipe, dropRecipe, onRequested };
}

describe("useDeferredRecipeDelete", () => {
  beforeEach(() => {
    toasts.length = 0;
    dismiss.mockClear();
  });

  it("hides the recipe, shows one Undo toast and commits on auto-close", () => {
    const { result, deleteRecipe, dropRecipe, onRequested } = setup();

    act(() => result.current.requestDelete(TACOS));
    expect(result.current.pendingDeleteIds.has(TACOS.id)).toBe(true);
    expect(onRequested).toHaveBeenCalledWith(TACOS);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('Deleted "Fish tacos"');
    expect(toasts[0].opts.duration).toBe(RECIPE_DELETE_UNDO_MS);
    expect(toasts[0].opts.action?.label).toBe("Undo");
    expect(deleteRecipe).not.toHaveBeenCalled();

    act(() => toasts[0].opts.onAutoClose?.());
    expect(deleteRecipe).toHaveBeenCalledTimes(1);
    expect(deleteRecipe).toHaveBeenCalledWith(TACOS.id);
    expect(dropRecipe).toHaveBeenCalledWith(TACOS.id);
    expect(result.current.pendingDeleteIds.size).toBe(0);

    // A late dismiss after the commit does not delete twice.
    act(() => toasts[0].opts.onDismiss?.());
    expect(deleteRecipe).toHaveBeenCalledTimes(1);
  });

  it("Undo cancels the delete and brings the recipe back", () => {
    const { result, deleteRecipe } = setup();

    act(() => result.current.requestDelete(TACOS));
    act(() => toasts[0].opts.action?.onClick());
    expect(result.current.pendingDeleteIds.has(TACOS.id)).toBe(false);

    // Whatever sonner does with the toast afterwards, nothing is committed.
    act(() => toasts[0].opts.onAutoClose?.());
    act(() => toasts[0].opts.onDismiss?.());
    expect(deleteRecipe).not.toHaveBeenCalled();
  });

  it("ignores a second request for the same recipe", () => {
    const { result } = setup();
    act(() => result.current.requestDelete(TACOS));
    act(() => result.current.requestDelete(TACOS));
    expect(toasts).toHaveLength(1);
  });

  it("flushes pending deletes on unmount", () => {
    const { result, unmount, deleteRecipe, dropRecipe } = setup();
    act(() => result.current.requestDelete(TACOS));
    act(() => result.current.requestDelete({ ...TACOS, id: "r-soup", name: "Soup" }));

    unmount();
    expect(deleteRecipe).toHaveBeenCalledTimes(2);
    expect(deleteRecipe).toHaveBeenCalledWith("r-tacos");
    expect(deleteRecipe).toHaveBeenCalledWith("r-soup");
    expect(dropRecipe).toHaveBeenCalledTimes(2);
    expect(dismiss).toHaveBeenCalled();
  });

  it("flushes pending deletes on pagehide", () => {
    const { result, deleteRecipe } = setup();
    act(() => result.current.requestDelete(TACOS));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(deleteRecipe).toHaveBeenCalledWith(TACOS.id);
    expect(result.current.pendingDeleteIds.size).toBe(0);
  });
});
