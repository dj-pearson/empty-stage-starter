import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client BEFORE importing the module under test.
const refreshSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { refreshSession: (...a: unknown[]) => refreshSession(...a) } },
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  isSupabaseAuthError,
  handleSupabaseAuthError,
} from "./supabaseAuthError";

describe("isSupabaseAuthError", () => {
  it("detects PostgREST PGRST301 (expired/invalid JWT)", () => {
    expect(isSupabaseAuthError({ code: "PGRST301" })).toBe(true);
  });

  it("detects HTTP 401", () => {
    expect(isSupabaseAuthError({ status: 401 })).toBe(true);
  });

  it.each([
    "JWT expired",
    "jwt is expired",
    "Token is expired",
    "Invalid JWT",
    "Not authenticated",
  ])("detects message %s", (message) => {
    expect(isSupabaseAuthError({ message })).toBe(true);
  });

  it("returns false for non-auth errors and nullish values", () => {
    expect(isSupabaseAuthError({ code: "PGRST116", message: "no rows" })).toBe(false);
    expect(isSupabaseAuthError({ message: "network failure" })).toBe(false);
    expect(isSupabaseAuthError(null)).toBe(false);
    expect(isSupabaseAuthError(undefined)).toBe(false);
    expect(isSupabaseAuthError("oops")).toBe(false);
  });
});

describe("handleSupabaseAuthError (expired-token path)", () => {
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    assign = vi.fn();
    // jsdom's window.location.assign is a no-op that warns; replace it with a
    // controllable mock that also exposes a path to build the redirect from.
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { pathname: "/dashboard", search: "?tab=plan", assign },
    });
  });

  it("returns 'not-auth-error' and never refreshes for a non-auth error", async () => {
    const outcome = await handleSupabaseAuthError({ message: "network failure" });
    expect(outcome).toBe("not-auth-error");
    expect(refreshSession).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("refreshes once and returns 'refreshed' when the session can be renewed", async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: "new" } }, error: null });
    const outcome = await handleSupabaseAuthError({ code: "PGRST301" });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(outcome).toBe("refreshed");
    expect(assign).not.toHaveBeenCalled();
  });

  it("redirects to /auth (preserving path) when refresh fails", async () => {
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "refresh token expired" } });
    const outcome = await handleSupabaseAuthError({ message: "JWT expired" });
    expect(outcome).toBe("redirected");
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(
      `/auth?redirect=${encodeURIComponent("/dashboard?tab=plan")}`,
    );
  });

  it("redirects when refreshSession throws", async () => {
    refreshSession.mockRejectedValue(new Error("network down"));
    const outcome = await handleSupabaseAuthError({ status: 401 });
    expect(outcome).toBe("redirected");
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("does not redirect-loop when already on /auth", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { pathname: "/auth", search: "", assign },
    });
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "expired" } });
    const outcome = await handleSupabaseAuthError({ code: "PGRST301" });
    expect(outcome).toBe("redirected");
    expect(assign).not.toHaveBeenCalled();
  });
});
