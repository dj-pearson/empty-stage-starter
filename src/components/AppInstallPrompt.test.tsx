import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AppInstallPrompt } from "./AppInstallPrompt";

/**
 * US-824: there used to be TWO install prompts. PWAInstallPrompt was mounted
 * app-wide in App.tsx and this one in Dashboard, so every /dashboard route
 * rendered both -- same `fixed bottom-4 ... md:right-4` position, separate
 * dismissal keys. These pin the survivor's behaviour, including the legacy key
 * it now has to honour on the other's behalf.
 */

function fireBeforeInstallPrompt() {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome: "dismissed" });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

function setStandalone(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({
      matches,
      media: "",
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  setStandalone(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AppInstallPrompt", () => {
  it("appears after the browser offers an install", async () => {
    render(<AppInstallPrompt />);
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();

    fireBeforeInstallPrompt();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByRole("button", { name: /dismiss/i })).toBeTruthy();
  });

  it("stays away for a user who dismissed the REMOVED prompt", async () => {
    // The whole point of the legacy key: this user already said no, to a
    // component that no longer exists. Asking again would be a regression they
    // experience as the app forgetting.
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());

    render(<AppInstallPrompt />);
    fireBeforeInstallPrompt();
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("stays away for a user who dismissed this prompt", async () => {
    localStorage.setItem("app_install_dismissed", Date.now().toString());
    render(<AppInstallPrompt />);
    fireBeforeInstallPrompt();
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("asks again once the week-long dismissal has expired", async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem("app_install_dismissed", String(eightDaysAgo));

    render(<AppInstallPrompt />);
    fireBeforeInstallPrompt();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByRole("button", { name: /dismiss/i })).toBeTruthy();
  });

  // Guards the shape of the check, not a guard clause: reading the key as a
  // boolean (`if (dismissed)`) instead of parsing it would hide the prompt for
  // good on any unparseable value. parseInt -> NaN -> falsy already does the
  // right thing, so this pins that it stays that way.
  it("ignores a corrupt dismissal value rather than hiding forever", async () => {
    localStorage.setItem("app_install_dismissed", "not-a-timestamp");
    render(<AppInstallPrompt />);
    fireBeforeInstallPrompt();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeTruthy();
  });

  it("renders nothing when the app is already installed", async () => {
    setStandalone(true);
    render(<AppInstallPrompt />);
    fireBeforeInstallPrompt();
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("writes a dismissal the next mount will honour", async () => {
    render(<AppInstallPrompt />);
    fireBeforeInstallPrompt();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    await act(async () => {
      screen.getByRole("button", { name: /dismiss/i }).click();
    });

    expect(localStorage.getItem("app_install_dismissed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });
});
