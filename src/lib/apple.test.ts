import { describe, it, expect } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  APPLE_RELAY_DOMAIN,
  isAppleRelayEmail,
  getAuthProviders,
  isAppleAccount,
} from "./apple";

const userWith = (overrides: Partial<User>): User => ({
  id: "00000000-0000-0000-0000-000000000000",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-05-07T00:00:00Z",
  ...overrides,
}) as User;

describe("isAppleRelayEmail", () => {
  it("matches the canonical privaterelay domain", () => {
    expect(isAppleRelayEmail(`abc123@${APPLE_RELAY_DOMAIN}`)).toBe(true);
  });

  it("is case-insensitive on the host", () => {
    expect(isAppleRelayEmail("ABC@PrivateRelay.AppleID.com")).toBe(true);
  });

  it("rejects real addresses", () => {
    expect(isAppleRelayEmail("user@example.com")).toBe(false);
    expect(isAppleRelayEmail("user@gmail.com")).toBe(false);
  });

  it("rejects spoofed lookalikes that don't match the exact host", () => {
    // Domain in the local part — host is example.com, not relay.
    expect(isAppleRelayEmail("privaterelay.appleid.com@example.com")).toBe(false);
    // Different host that merely ends in appleid.com — also not relay.
    expect(isAppleRelayEmail("user@notprivaterelay.appleid.com")).toBe(false);
    // Apple does not use subdomains for relay; the exact host is required.
    expect(isAppleRelayEmail("user@x.privaterelay.appleid.com")).toBe(false);
  });

  it("handles null / undefined / empty", () => {
    expect(isAppleRelayEmail(null)).toBe(false);
    expect(isAppleRelayEmail(undefined)).toBe(false);
    expect(isAppleRelayEmail("")).toBe(false);
  });
});

describe("getAuthProviders", () => {
  it("returns identities-derived providers when present", () => {
    const user = userWith({
      identities: [
        { provider: "apple" } as User["identities"][number],
        { provider: "email" } as User["identities"][number],
      ],
      app_metadata: { provider: "apple" },
    });
    expect(getAuthProviders(user).sort()).toEqual(["apple", "email"]);
  });

  it("falls back to app_metadata.provider when identities is empty", () => {
    const user = userWith({
      identities: [],
      app_metadata: { provider: "apple" },
    });
    expect(getAuthProviders(user)).toEqual(["apple"]);
  });

  it("returns empty array for null / no-provider users", () => {
    expect(getAuthProviders(null)).toEqual([]);
    expect(getAuthProviders(userWith({}))).toEqual([]);
  });

  it("deduplicates", () => {
    const user = userWith({
      identities: [
        { provider: "apple" } as User["identities"][number],
        { provider: "apple" } as User["identities"][number],
      ],
    });
    expect(getAuthProviders(user)).toEqual(["apple"]);
  });
});

describe("isAppleAccount", () => {
  it("is true for Apple identity", () => {
    const user = userWith({
      identities: [{ provider: "apple" } as User["identities"][number]],
    });
    expect(isAppleAccount(user)).toBe(true);
  });

  it("is true for mixed-provider accounts that include Apple", () => {
    const user = userWith({
      identities: [
        { provider: "email" } as User["identities"][number],
        { provider: "apple" } as User["identities"][number],
      ],
    });
    expect(isAppleAccount(user)).toBe(true);
  });

  it("is false for email-only accounts", () => {
    const user = userWith({
      identities: [{ provider: "email" } as User["identities"][number]],
    });
    expect(isAppleAccount(user)).toBe(false);
  });
});
