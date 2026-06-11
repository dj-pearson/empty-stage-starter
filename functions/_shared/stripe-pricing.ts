/**
 * Stripe price allowlist / resolution helpers (US-326).
 *
 * `create-checkout` must never forward a client-supplied `price_id` straight
 * into a Stripe line item: a client could pass an arbitrary or cheaper price and
 * provision a paid tier at the wrong price (price/tier tampering). These helpers
 * resolve a checkout request to a server-controlled price ID that is validated
 * against an allowlist sourced from environment configuration.
 *
 * Configuration (env, set in the edge-function secrets — never hardcoded):
 *   - STRIPE_PRICE_MAP   JSON object mapping a plan/cycle key to a Stripe price
 *                        ID, e.g. {"pro_monthly":"price_123","pro_yearly":"price_456"}.
 *                        The values double as part of the allowlist.
 *   - STRIPE_PRICE_ALLOWLIST  Comma/whitespace-separated list of additional valid
 *                        price IDs (useful for clients that send a price_id
 *                        directly, e.g. native apps).
 *
 * The effective allowlist is the union of STRIPE_PRICE_ALLOWLIST and every value
 * in STRIPE_PRICE_MAP. If neither is configured the resolver fails closed and
 * reports "not configured" so checkout cannot run against an unvalidated price.
 *
 * This module is intentionally free of Deno URL imports so its logic can be
 * unit-tested under vitest (see src/test/security/stripe-price-allowlist.test.ts).
 * The runtime injects an env getter (`Deno.env.get`) as a parameter.
 */

export type EnvGetter = (key: string) => string | undefined;

export interface PriceResolutionSuccess {
  ok: true;
  priceId: string;
}

export interface PriceResolutionFailure {
  ok: false;
  /** HTTP status the caller should return (400 invalid/missing, 503 not configured). */
  status: 400 | 503;
  error: string;
}

export type PriceResolution = PriceResolutionSuccess | PriceResolutionFailure;

export interface CheckoutPriceInput {
  /** A direct Stripe price ID supplied by the client (validated against the allowlist). */
  priceId?: unknown;
  /** A plan/tier key (e.g. "pro") resolved server-side via STRIPE_PRICE_MAP. */
  planKey?: unknown;
  /** Optional billing cycle used to build the map key, e.g. "monthly" | "yearly". */
  billingCycle?: unknown;
}

/** Parse STRIPE_PRICE_MAP into a plain object. Returns `{}` on missing/invalid JSON. */
export function getPriceMap(getEnv: EnvGetter): Record<string, string> {
  const raw = getEnv('STRIPE_PRICE_MAP');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.length > 0) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The effective allowlist of valid Stripe price IDs: the union of the explicit
 * STRIPE_PRICE_ALLOWLIST entries and every value in STRIPE_PRICE_MAP.
 */
export function getPriceAllowlist(getEnv: EnvGetter): Set<string> {
  const allow = new Set<string>();
  const raw = getEnv('STRIPE_PRICE_ALLOWLIST');
  if (raw) {
    for (const entry of raw.split(/[\s,]+/)) {
      const trimmed = entry.trim();
      if (trimmed.length > 0) allow.add(trimmed);
    }
  }
  for (const value of Object.values(getPriceMap(getEnv))) allow.add(value);
  return allow;
}

/** True when `priceId` is present in the effective allowlist. */
export function isAllowedPriceId(priceId: string, getEnv: EnvGetter): boolean {
  return getPriceAllowlist(getEnv).has(priceId);
}

/**
 * Resolve a checkout request to a validated, server-controlled price ID.
 *
 * Resolution order:
 *   1. A direct `priceId` is accepted only if it is in the allowlist.
 *   2. A `planKey` (+ optional `billingCycle`) is resolved via STRIPE_PRICE_MAP,
 *      trying `"<planKey>_<billingCycle>"` then `"<planKey>"`. The resolved value
 *      must also be in the allowlist.
 *
 * Fails closed: when no pricing is configured at all, returns a 503 so a
 * misconfiguration never results in an unvalidated price reaching Stripe.
 */
export function resolveCheckoutPrice(
  input: CheckoutPriceInput,
  getEnv: EnvGetter,
): PriceResolution {
  const allowlist = getPriceAllowlist(getEnv);

  // Fail closed when pricing is not configured rather than rejecting a valid
  // request as "invalid" — signals an ops/config problem distinctly.
  if (allowlist.size === 0) {
    return { ok: false, status: 503, error: 'Stripe pricing is not configured' };
  }

  const priceId = typeof input.priceId === 'string' ? input.priceId.trim() : '';
  const planKey = typeof input.planKey === 'string' ? input.planKey.trim() : '';
  const billingCycle =
    typeof input.billingCycle === 'string' ? input.billingCycle.trim() : '';

  if (priceId) {
    if (allowlist.has(priceId)) return { ok: true, priceId };
    return { ok: false, status: 400, error: 'Invalid price_id' };
  }

  if (planKey) {
    const map = getPriceMap(getEnv);
    const candidateKeys = billingCycle
      ? [`${planKey}_${billingCycle}`, planKey]
      : [planKey];
    for (const key of candidateKeys) {
      const resolved = map[key];
      if (resolved && allowlist.has(resolved)) return { ok: true, priceId: resolved };
    }
    return { ok: false, status: 400, error: 'Invalid or unknown plan' };
  }

  return { ok: false, status: 400, error: 'price_id or planId is required' };
}
