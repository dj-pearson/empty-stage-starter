import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useScreenWakeLock } from "./useScreenWakeLock";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

function installWakeLock() {
  const release = vi.fn(async () => {});
  const sentinel = { released: false, release };
  const request = vi.fn(async () => sentinel);
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, release, sentinel };
}

afterEach(() => {
  // Leave navigator as jsdom made it: no Wake Lock API.
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
});

describe("useScreenWakeLock", () => {
  it("does nothing where the API does not exist", () => {
    const { result } = renderHook(() => useScreenWakeLock(true));
    expect(result.current).toEqual({ supported: false, active: false });
  });

  it("takes the lock while enabled and releases it on unmount", async () => {
    const api = installWakeLock();
    const { result, unmount } = renderHook(() => useScreenWakeLock(true));
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(api.request).toHaveBeenCalledWith("screen");
    unmount();
    expect(api.release).toHaveBeenCalledTimes(1);
  });

  it("does not ask while disabled", () => {
    const api = installWakeLock();
    renderHook(() => useScreenWakeLock(false));
    expect(api.request).not.toHaveBeenCalled();
  });

  it("takes it again when the page comes back into view", async () => {
    const api = installWakeLock();
    const { result } = renderHook(() => useScreenWakeLock(true));
    await waitFor(() => expect(result.current.active).toBe(true));
    api.sentinel.released = true; // the browser dropped it when the tab hid
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it("stays usable when the browser refuses", async () => {
    const request = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    const { result } = renderHook(() => useScreenWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(result.current.active).toBe(false);
  });
});
