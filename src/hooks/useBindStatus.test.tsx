import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

type Listener = (event: string, session: { user: unknown } | null) => void;

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  hasPassword: vi.fn(),
  listener: null as Listener | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: h.getUser,
      onAuthStateChange: (cb: Listener) => {
        h.listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
vi.mock("@/lib/accountQueries", () => ({ fetchHasPassword: h.hasPassword }));

import { useBindStatus } from "./useBindStatus";

const appleRelay = {
  id: "u1",
  email: "abc@privaterelay.appleid.com",
  app_metadata: { provider: "apple", providers: ["apple"] },
  identities: [{ provider: "apple" }],
};

beforeEach(() => {
  h.getUser.mockReset().mockResolvedValue({ data: { user: appleRelay } });
  h.hasPassword.mockReset().mockResolvedValue(false);
  h.listener = null;
});

describe("useBindStatus", () => {
  it("loads once and ignores INITIAL_SESSION and TOKEN_REFRESHED", async () => {
    const { result } = renderHook(() => useBindStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(h.getUser).toHaveBeenCalledTimes(1);
    act(() => {
      h.listener?.("INITIAL_SESSION", { user: appleRelay });
      h.listener?.("TOKEN_REFRESHED", { user: appleRelay });
    });
    expect(h.getUser).toHaveBeenCalledTimes(1);
  });

  it("refreshes on USER_UPDATED without going back to loading", async () => {
    const { result } = renderHook(() => useBindStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.needsPassword).toBe(true);

    let resolvePassword: (v: boolean) => void = () => {};
    h.hasPassword.mockReturnValue(new Promise<boolean>((r) => (resolvePassword = r)));
    act(() => h.listener?.("USER_UPDATED", { user: appleRelay }));
    await waitFor(() => expect(h.getUser).toHaveBeenCalledTimes(2));
    // Mid-refresh: stale values stay, loading does not flip.
    expect(result.current.loading).toBe(false);
    expect(result.current.needsPassword).toBe(true);

    await act(async () => resolvePassword(true));
    await waitFor(() => expect(result.current.hasPassword).toBe(true));
    expect(result.current.needsPassword).toBe(false);
  });
});
