import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { verifyAppleJWS } from "../common/apple-jws.ts";

// App Store Server Notifications V2 endpoint.
//
// Apple POSTs { "signedPayload": "<JWS>" } here for subscription lifecycle
// events. We verify the JWS, decode the transaction, and reflect refunds /
// revocations / expirations into `apple_subscriptions` (keyed by
// originalTransactionId) so a refunded user is shut off server-side even if
// they never reopen the app.
//
// SETUP (App Store Connect):
//   - App Store Connect → your app → App Information → App Store Server
//     Notifications → set the Production (and Sandbox) URL to
//     https://functions.tryeatpal.com/app-store-notifications and choose
//     Version 2 notifications.
//   - Use "Request a Test Notification" to verify end-to-end.
//
// SECURITY: the JWS signature is verified by the shared verifyAppleJWS helper
// (see ../common/apple-jws.ts) against the x5c leaf certificate, with optional
// trust-anchor pinning via APPLE_ROOT_CA_G3.

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const jsonHeaders = { "Content-Type": "application/json" };

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: jsonHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const signedPayload = (body as { signedPayload?: string }).signedPayload;
    if (!signedPayload) {
      return new Response(JSON.stringify({ error: "Missing signedPayload" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const notification = await verifyAppleJWS(signedPayload);
    const notificationType = String(notification.notificationType ?? "");
    const subtype = notification.subtype ? String(notification.subtype) : "";
    const data = (notification.data ?? {}) as Record<string, unknown>;
    const signedTransactionInfo = data.signedTransactionInfo as string | undefined;
    const environment = data.environment ? String(data.environment) : null;

    console.log(`App Store notification: ${notificationType}${subtype ? "/" + subtype : ""} (${environment ?? "?"})`);

    if (!signedTransactionInfo) {
      // e.g. TEST notifications and some renewal-info-only events carry no txn.
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders });
    }

    const txn = await verifyAppleJWS(signedTransactionInfo);
    const originalTransactionId = txn.originalTransactionId ? String(txn.originalTransactionId) : "";
    if (!originalTransactionId) {
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders });
    }

    // Map the notification to a new entitlement status.
    let newStatus: string | null = null;
    switch (notificationType) {
      case "REFUND":
      case "REVOKE":
        newStatus = "revoked";
        break;
      case "EXPIRED":
        newStatus = "expired";
        break;
      case "SUBSCRIBED":
      case "DID_RENEW":
      case "OFFER_REDEEMED":
      case "RESUBSCRIBE":
        newStatus = "active";
        break;
      default:
        // GRACE_PERIOD_EXPIRED, DID_CHANGE_RENEWAL_STATUS/PREF, PRICE_INCREASE,
        // TEST, etc. don't change current access — ack and move on.
        newStatus = null;
    }

    if (!newStatus) {
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const expiresAt = txn.expiresDate ? new Date(Number(txn.expiresDate)).toISOString() : null;

    const { data: updated, error } = await supabase
      .from("apple_subscriptions")
      .update({
        status: newStatus,
        expires_at: expiresAt,
        store_transaction_id: txn.transactionId ? String(txn.transactionId) : null,
        product_id: txn.productId ? String(txn.productId) : null,
        environment,
        updated_at: new Date().toISOString(),
      })
      .eq("original_transaction_id", originalTransactionId)
      .select("user_id");

    if (error) {
      console.error("Failed to update apple_subscriptions:", error);
    } else if (!updated || updated.length === 0) {
      console.warn(
        `No apple_subscriptions row for originalTransactionId ${originalTransactionId} (${notificationType}) — the device hasn't synced this transaction yet.`
      );
    } else {
      console.log(
        `apple_subscriptions ${originalTransactionId} -> ${newStatus} for user ${updated[0].user_id} (${notificationType})`
      );
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders });
  } catch (err) {
    console.error("App Store notification error:", err);
    // 401 on verification failure so Apple retries and we get visibility.
    return new Response(
      `Notification verification failed: ${err instanceof Error ? err.message : "unknown error"}`,
      { status: 401 }
    );
  }
};
