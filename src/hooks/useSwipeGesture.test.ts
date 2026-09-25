import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSwipeGesture } from "./useSwipeGesture";

function touch(el: HTMLElement, type: string, x: number, y = 100, fingers = 1) {
  const point = { clientX: x, clientY: y, identifier: 0, target: el };
  const list = type === "touchend" || type === "touchcancel" ? [] : Array.from({ length: fingers }, () => point);
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "touches", { value: list });
  Object.defineProperty(ev, "changedTouches", { value: [point] });
  el.dispatchEvent(ev);
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useSwipeGesture", () => {
  it("fires on a real horizontal swipe", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const onSwipeLeft = vi.fn();
    const ref = { current: el };
    const { result } = renderHook(() => {
      const r = useSwipeGesture({ onSwipeLeft, threshold: 60 });
      if (!r.current) (r as { current: HTMLDivElement | null }).current = ref.current as HTMLDivElement;
      return r;
    });
    expect(result.current.current).toBe(el);
    touch(el, "touchstart", 300);
    vi.advanceTimersByTime(50);
    touch(el, "touchmove", 250);
    vi.advanceTimersByTime(50);
    touch(el, "touchend", 150);
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it("ignores a gesture that starts at the screen edge", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const onSwipeRight = vi.fn();
    renderHook(() => {
      const r = useSwipeGesture({ onSwipeRight, threshold: 60 });
      if (!r.current) (r as { current: HTMLDivElement | null }).current = el as HTMLDivElement;
      return r;
    });
    touch(el, "touchstart", 5);
    vi.advanceTimersByTime(50);
    touch(el, "touchmove", 100);
    vi.advanceTimersByTime(50);
    touch(el, "touchend", 200);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("does not fire on a zero-duration gesture", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const onSwipeLeft = vi.fn();
    renderHook(() => {
      const r = useSwipeGesture({ onSwipeLeft, threshold: 60 });
      if (!r.current) (r as { current: HTMLDivElement | null }).current = el as HTMLDivElement;
      return r;
    });
    touch(el, "touchstart", 300);
    touch(el, "touchend", 100);
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("drops a gesture cancelled mid-way, and a second finger", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const onSwipeLeft = vi.fn();
    renderHook(() => {
      const r = useSwipeGesture({ onSwipeLeft, threshold: 60 });
      if (!r.current) (r as { current: HTMLDivElement | null }).current = el as HTMLDivElement;
      return r;
    });
    touch(el, "touchstart", 300);
    vi.advanceTimersByTime(50);
    touch(el, "touchmove", 250);
    touch(el, "touchcancel", 250);
    vi.advanceTimersByTime(50);
    touch(el, "touchend", 100);
    expect(onSwipeLeft).not.toHaveBeenCalled();

    touch(el, "touchstart", 300);
    vi.advanceTimersByTime(50);
    touch(el, "touchmove", 250, 100, 2);
    vi.advanceTimersByTime(50);
    touch(el, "touchend", 100);
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("uses the latest callback without rebinding", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const add = vi.spyOn(el, "addEventListener");
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => {
        const r = useSwipeGesture({ onSwipeLeft: cb, threshold: 60 });
        if (!r.current) (r as { current: HTMLDivElement | null }).current = el as HTMLDivElement;
        return r;
      },
      { initialProps: { cb: first } },
    );
    const bound = add.mock.calls.length;
    rerender({ cb: second });
    expect(add.mock.calls.length).toBe(bound);
    touch(el, "touchstart", 300);
    vi.advanceTimersByTime(50);
    touch(el, "touchmove", 250);
    vi.advanceTimersByTime(50);
    touch(el, "touchend", 150);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
