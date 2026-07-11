// Deno tests for the pure Apple entitlement logic.
// Run with: deno test supabase/functions/common/apple-entitlement.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveStatus,
  isEntitled,
  tierForProduct,
} from "./apple-entitlement.ts";

const NOW = 1_700_000_000_000; // fixed "now" in epoch ms

Deno.test("tierForProduct maps every known product id", () => {
  assertEquals(tierForProduct("com.eatpal.app.pro.monthly"), "pro");
  assertEquals(tierForProduct("com.eatpal.app.pro.yearly"), "pro");
  assertEquals(tierForProduct("com.eatpal.app.familyplus.monthly"), "familyPlus");
  assertEquals(tierForProduct("com.eatpal.app.familyplus.yearly"), "familyPlus");
  assertEquals(tierForProduct("com.eatpal.app.professional.monthly"), "professional");
  assertEquals(tierForProduct("com.eatpal.app.professional.yearly"), "professional");
});

Deno.test("tierForProduct resolves unknown/empty ids to free", () => {
  assertEquals(tierForProduct("com.eatpal.app.bogus"), "free");
  assertEquals(tierForProduct(""), "free");
  assertEquals(tierForProduct(null), "free");
  assertEquals(tierForProduct(undefined), "free");
});

Deno.test("deriveStatus: revocation always wins", () => {
  // Revoked even though it hasn't expired yet.
  assertEquals(
    deriveStatus({ revocationDate: NOW - 1000, expiresDate: NOW + 1_000_000 }, NOW),
    "revoked",
  );
});

Deno.test("deriveStatus: expired when past expiry and not revoked", () => {
  assertEquals(deriveStatus({ expiresDate: NOW - 1 }, NOW), "expired");
  // Exactly at expiry is treated as expired (<=).
  assertEquals(deriveStatus({ expiresDate: NOW }, NOW), "expired");
});

Deno.test("deriveStatus: active when unexpired and not revoked", () => {
  assertEquals(deriveStatus({ expiresDate: NOW + 1 }, NOW), "active");
  // Non-consumable / no expiry date -> active.
  assertEquals(deriveStatus({}, NOW), "active");
});

Deno.test("isEntitled only for active", () => {
  assertEquals(isEntitled("active"), true);
  assertEquals(isEntitled("expired"), false);
  assertEquals(isEntitled("revoked"), false);
});
