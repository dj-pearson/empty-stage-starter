/**
 * Who bills the signed-in account, asked fresh right before Pricing would open
 * a Stripe checkout (the client-side half of the double-billing guard).
 *
 * current_user_plan_name() is the server's effective plan (Stripe, admin comp
 * or App Store, via effective_plan_id). The two rows say which of those it is.
 * Every read is the caller's own row under RLS.
 */
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { isActiveApple } from "@/lib/planSource";

export type CheckoutSource = "free" | "stripe" | "appStore" | "comp" | "unknown";

const isFreeName = (name: string | null | undefined) => !name || name.trim().toLowerCase() === "free";

export async function resolveCheckoutSource(userId: string): Promise<CheckoutSource> {
  try {
    const [planName, apple, stripe] = await Promise.all([
      supabase.rpc("current_user_plan_name"),
      supabase
        .from("apple_subscriptions")
        .select("id, status, expires_at, product_id")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("user_subscriptions")
        .select("status, stripe_subscription_id, is_complementary")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (planName.error) throw planName.error;
    if (apple.error) throw apple.error;
    if (stripe.error && stripe.error.code !== "PGRST116") throw stripe.error;

    if ((apple.data ?? []).some((row) => isActiveApple(row))) return "appStore";

    const row = stripe.data;
    if (row && (row.status === "active" || row.status === "trialing")) {
      if (row.is_complementary) return "comp";
      if (row.stripe_subscription_id) return "stripe";
    }
    // past_due is still a live Stripe subscription: a new checkout would start
    // a second one that bills alongside it once the card is fixed.
    if (row?.status === "past_due" && row.stripe_subscription_id) return "stripe";

    // A paid effective plan with no App Store or Stripe row behind it comes
    // from an admin comp.
    return isFreeName(planName.data) ? "free" : "comp";
  } catch (err) {
    logger.error("Could not resolve the billing source before checkout:", err);
    return "unknown";
  }
}
