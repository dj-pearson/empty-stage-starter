// Vitest mirror for delete-account's recent-authentication rule, so it runs in
// CI without Deno. Deno twin: supabase/functions/_shared/requireRecentAuth.test.ts
import { describe, expect, it } from "vitest";
import {
  authenticatedAtSeconds,
  decideRecentAuth,
  decideRecentAuthForRequest,
  decodeJwtPayload,
  REAUTH_REQUIRED_CODE,
} from "../../supabase/functions/_shared/requireRecentAuth";
import { DELETE_ACCOUNT_CLIENT_HEADERS } from "@/lib/accountDeletion";

const NOW = 1_790_000_000;

function b64url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(payload))}.sig`;
}

describe("decideRecentAuth", () => {
  it("lets a web caller who signed in within ten minutes through", () => {
    const token = jwt({ amr: [{ method: "password", timestamp: NOW - 599 }] });
    expect(decideRecentAuth({ clientHeader: "eatpal-web/1", token, nowSeconds: NOW })).toEqual({
      ok: true,
      reason: "recent",
    });
  });

  it("refuses a web caller whose token was only refreshed recently", () => {
    const token = jwt({ iat: NOW - 30, amr: [{ method: "password", timestamp: NOW - 3600 }] });
    const decision = decideRecentAuth({ clientHeader: "eatpal-web", token, nowSeconds: NOW });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.status).toBe(401);
      expect(decision.body.code).toBe(REAUTH_REQUIRED_CODE);
    }
  });

  it("keeps the valid-JWT rule for callers without the web header (shipped iOS)", () => {
    const stale = jwt({ amr: [{ method: "password", timestamp: NOW - 86_400 }] });
    expect(decideRecentAuth({ clientHeader: null, token: stale, nowSeconds: NOW }).ok).toBe(true);
    expect(decideRecentAuth({ clientHeader: "supabase-js-web/2.57.0", token: stale, nowSeconds: NOW }).ok).toBe(true);
  });

  it("fails closed on an unreadable web token", () => {
    const decision = decideRecentAuth({ clientHeader: "eatpal-web/1", token: "nope", nowSeconds: NOW });
    expect(decision).toMatchObject({ ok: false, reason: "unreadable" });
  });

  it("uses the newest amr timestamp and falls back to iat", () => {
    expect(authenticatedAtSeconds({ amr: [{ timestamp: 5 }, { timestamp: 9 }], iat: 100 })).toBe(9);
    expect(authenticatedAtSeconds({ iat: 100 })).toBe(100);
    expect(decodeJwtPayload(jwt({ name: "Zo\u00eb" }))).toEqual({ name: "Zo\u00eb" });
  });

  it("is satisfied by the header the web dialog actually sends", () => {
    const fresh = jwt({ amr: [{ method: "otp", timestamp: NOW - 10 }] });
    const stale = jwt({ amr: [{ method: "otp", timestamp: NOW - 5000 }] });
    const req = (token: string) =>
      new Request("https://x.test", {
        headers: { Authorization: `Bearer ${token}`, ...DELETE_ACCOUNT_CLIENT_HEADERS },
      });
    expect(decideRecentAuthForRequest(req(fresh), NOW).ok).toBe(true);
    // Stale proves the header really classifies as web rather than legacy.
    expect(decideRecentAuthForRequest(req(stale), NOW).ok).toBe(false);
  });
});
