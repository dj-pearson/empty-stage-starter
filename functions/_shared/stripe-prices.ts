/**
 * Server-side Stripe price allowlist (US-326).
 *
 * `create-checkout` must never pass a client-supplied price_id straight into
 * Stripe line items — a caller could substitute an arbitrary or cheaper price
 * and provision a paid tier at the wrong price (price/tier tampering).
 *
 * The set of valid price IDs is sourced from configuration (env), not
 * hardcoded. Price IDs are not secrets, but keeping them in env lets us vary
 * them per environment (test vs live) without code changes.
 *
 * Supported env shapes (first match wins):
 *   STRIPE_PRICE_IDS = "price_abc,price_def"          (flat allowlist)
 *   STRIPE_PRICE_MAP = '{"monthly":"price_abc","yearly":"price_def"}' (plan->price)
 */

// deno-lint-ignore no-explicit-any
type Env = { get(key: string): string | undefined };

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && v.startsWith('price_')) out[k] = v;
      }
      return out;
    }
  } catch (error) {
    console.error('STRIPE_PRICE_MAP is not valid JSON:', error);
  }
  return {};
}

export function getAllowedPriceIds(env: Env): Set<string> {
  const fromList = parseList(env.get('STRIPE_PRICE_IDS'));
  const fromMap = Object.values(parseMap(env.get('STRIPE_PRICE_MAP')));
  return new Set([...fromList, ...fromMap]);
}

/**
 * Resolve the request to a server-controlled Stripe price ID.
 *
 * Accepts either:
 *   - a `plan` key, resolved against STRIPE_PRICE_MAP, or
 *   - a `price_id`, validated against the combined allowlist.
 *
 * Returns the resolved price ID, or null if it is not allowlisted.
 */
export function resolvePriceId(
  env: Env,
  body: { price_id?: unknown; plan?: unknown },
): string | null {
  const map = parseMap(env.get('STRIPE_PRICE_MAP'));
  if (typeof body.plan === 'string' && map[body.plan]) {
    return map[body.plan];
  }
  if (typeof body.price_id === 'string') {
    const allowed = getAllowedPriceIds(env);
    if (allowed.has(body.price_id)) return body.price_id;
  }
  return null;
}
