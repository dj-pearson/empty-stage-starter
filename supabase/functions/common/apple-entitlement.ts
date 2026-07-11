// Pure entitlement logic shared by the Apple subscription endpoints.
//
// Kept free of Deno/Supabase/network imports so it can be unit-tested in
// isolation (see apple-entitlement.test.ts). Both the product->tier mapping and
// the status derivation MUST mirror the iOS client
// (ios/EatPal/EatPal/Services/StoreKitService.swift: SubscriptionProduct /
// SubscriptionTier). Keep them in sync when adding a product.

export type SubscriptionTier = "free" | "pro" | "familyPlus" | "professional";

/** active | expired | revoked (refund/chargeback) */
export type SubscriptionStatus = "active" | "expired" | "revoked";

/** Highest-to-lowest so a downgrade comparison is unambiguous. */
export const TIER_ORDER: SubscriptionTier[] = ["free", "pro", "familyPlus", "professional"];

const PRODUCT_TIER: Record<string, SubscriptionTier> = {
  "com.eatpal.app.pro.monthly": "pro",
  "com.eatpal.app.pro.yearly": "pro",
  "com.eatpal.app.familyplus.monthly": "familyPlus",
  "com.eatpal.app.familyplus.yearly": "familyPlus",
  "com.eatpal.app.professional.monthly": "professional",
  "com.eatpal.app.professional.yearly": "professional",
};

/** Map an App Store product id to its tier; unknown ids resolve to `free`. */
export function tierForProduct(productId: string | null | undefined): SubscriptionTier {
  if (!productId) return "free";
  return PRODUCT_TIER[productId] ?? "free";
}

/**
 * The fields we need from a verified StoreKit 2 transaction payload. Apple
 * encodes the date fields as epoch milliseconds (numbers).
 */
export interface AppleTransactionFields {
  productId?: string | null;
  expiresDate?: number | null;
  revocationDate?: number | null;
}

/**
 * Derive the current entitlement status from a verified transaction.
 *
 * Precedence: a refund/revocation always wins; then expiry; otherwise active.
 * `nowMs` is injected so the logic is deterministic under test.
 */
export function deriveStatus(txn: AppleTransactionFields, nowMs: number): SubscriptionStatus {
  if (txn.revocationDate != null) return "revoked";
  if (txn.expiresDate != null && txn.expiresDate <= nowMs) return "expired";
  return "active";
}

/** True only when the status grants access right now. */
export function isEntitled(status: SubscriptionStatus): boolean {
  return status === "active";
}
