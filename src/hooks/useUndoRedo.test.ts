import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useUndoRedo } from "./useUndoRedo";

describe("useUndoRedo dirty check (US-543)", () => {
  it("does not push history when the same reference is set (fast path, no serialize)", () => {
    const initial = { count: 0 };
    const { result } = renderHook(() => useUndoRedo(initial));
    act(() => { result.current.set(result.current.state); }); // same ref
    expect(result.current.canUndo).toBe(false);
    expect(result.current.history.past).toHaveLength(0);
  });

  it("does not push history when a value-equal (different ref) object is set", () => {
    const { result } = renderHook(() => useUndoRedo({ count: 0, tags: ["a"] }));
    act(() => { result.current.set({ count: 0, tags: ["a"] }); }); // deep-equal, new ref
    expect(result.current.canUndo).toBe(false);
  });

  it("pushes history and supports undo when the value actually changes", () => {
    const { result } = renderHook(() => useUndoRedo({ count: 0 }));
    act(() => { result.current.set({ count: 1 }); });
    expect(result.current.state).toEqual({ count: 1 });
    expect(result.current.canUndo).toBe(true);
    act(() => { result.current.undo(); });
    expect(result.current.state).toEqual({ count: 0 });
    expect(result.current.canRedo).toBe(true);
  });

  it("supports the functional updater form", () => {
    const { result } = renderHook(() => useUndoRedo({ count: 5 }));
    act(() => { result.current.set((prev) => ({ count: prev.count + 1 })); });
    expect(result.current.state).toEqual({ count: 6 });
    expect(result.current.canUndo).toBe(true);
  });
});
