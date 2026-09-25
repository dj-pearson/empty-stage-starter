/**
 * Read create-checkout's refusals off the error invokeEdgeFunction returns.
 *
 * create-checkout answers 409 { code: "already_subscribed", source } when the
 * account already holds a plan (Stripe, App Store or complimentary), and 503
 * { code: "entitlement_unverified" } when it could not tell. Pricing.tsx runs
 * the same check before calling, so reaching either means the page was stale:
 * a purchase on the phone, a second tab. The error is read by shape, not by
 * class, so this works whichever module produced it.
 */

/** Who already bills the account, as create-checkout names it. */
export type EntitledSource = "stripe" | "appStore" | "comp";
const ENTITLED_SOURCES: readonly string[] = ["stripe", "appStore", "comp"];

export type CheckoutRefusal =
  | { kind: "alreadySubscribed"; source: EntitledSource | null }
  | { kind: "unverified" };

interface ErrorShape {
  status?: unknown;
  code?: unknown;
  body?: { source?: unknown } | null;
}

export function readCheckoutRefusal(error: unknown): CheckoutRefusal | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as ErrorShape;
  if (e.code === "already_subscribed" || (e.status === 409 && e.code == null)) {
    const raw = e.body?.source;
    const source = typeof raw === "string" && ENTITLED_SOURCES.includes(raw)
      ? (raw as EntitledSource)
      : null;
    return { kind: "alreadySubscribed", source };
  }
  if (e.code === "entitlement_unverified") return { kind: "unverified" };
  return null;
}
