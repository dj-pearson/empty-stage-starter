import { describe, it, expect } from "vitest";
import { WEB_AUTH_SECURITY } from "./client";

// US-531: the web session lives in localStorage (static Cloudflare Pages SPA
// can't set httpOnly cookies without an SSR/Worker rearchitecture — see
// docs/security/web-session-storage.md). These flags are the compensating
// posture; pin them so a future edit can't silently weaken it.
describe("US-531: web auth security options", () => {
  it("keeps refresh-token rotation enabled (autoRefreshToken)", () => {
    // AC3: refresh-token rotation remains enabled. autoRefreshToken drives the
    // client half of rotation (server rotation is the GoTrue default).
    expect(WEB_AUTH_SECURITY.autoRefreshToken).toBe(true);
    expect(WEB_AUTH_SECURITY.persistSession).toBe(true);
  });

  it("uses the PKCE flow so no access token lands in the URL fragment", () => {
    expect(WEB_AUTH_SECURITY.flowType).toBe("pkce");
  });

  it("scopes the session to a single origin via a stable storage key", () => {
    expect(WEB_AUTH_SECURITY.storageKey).toBe("sb-auth-token");
    expect(WEB_AUTH_SECURITY.detectSessionInUrl).toBe(true);
  });
});
