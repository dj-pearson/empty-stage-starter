import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { verifyAppleJwsLegacy } from "../_shared/appStoreJws.ts";
import { decideNotificationInsert, statusForNotification } from "../_shared/appStoreTransaction.ts";

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
// SECURITY:
//   - Verification lives in _shared/appStoreJws.ts (verifyAppleJwsLegacy),
//     moved there unchanged: the JWS signature is checked against the x5c
//     leaf, and with APPLE_ROOT_CA_G3 set the last x5c entry must equal it.
//     That check does not prove the leaf chains to the root, so on its own it
//     only ever UPDATES an existing row's status, as before.
//   - Creating a row (no row yet for this originalTransactionId) additionally
//     needs the full chain check (issuing signatures, Apple marker OIDs,
//     validity) against APPLE_ROOT_CA_G3, and an appAccountToken naming the
//     user. With APPLE_ROOT_CA_G3 unset nothing is ever created.
//   - appAccountToken = the EatPal user's auth.users.id, set by the app on
//     product.purchase(options:). See docs/ios-storekit-verification.md.

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

    const { payload: notification } = await verifyAppleJwsLegacy(signedPayload);
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

    const { payload: txn, chainVerified } = await verifyAppleJwsLegacy(signedTransactionInfo);
    const originalTransactionId = txn.originalTransactionId ? String(txn.originalTransactionId) : "";
    if (!originalTransactionId) {
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders });
    }

    // Map the notification to a new entitlement status.
    const newStatus = statusForNotification(notificationType);

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
      // No row yet. Create one only for a fully verified transaction whose
      // appAccountToken names the user (see _shared/appStoreTransaction.ts);
      // otherwise this is the old "device hasn't synced yet" case.
      const plan = decideNotificationInsert({
        txnPayload: txn,
        notificationStatus: newStatus,
        chainVerified,
        now: new Date(),
      });
      if (!plan.insert) {
        console.warn(
          `No apple_subscriptions row for originalTransactionId ${originalTransactionId} (${notificationType}) -- the device hasn't synced this transaction yet; not creating one (${plan.reason}).`
        );
      } else {
        const { error: insertError } = await supabase
          .from("apple_subscriptions")
          .insert({ ...plan.row, updated_at: new Date().toISOString() });
        if (!insertError) {
          console.log(
            `apple_subscriptions ${originalTransactionId} created as ${newStatus} for user ${plan.row.user_id} from appAccountToken (${notificationType})`
          );
        } else if (insertError.code === "23505") {
          // The device or verify-app-store-transaction wrote it in between.
          const { error: retryError } = await supabase
            .from("apple_subscriptions")
            .update({
              status: newStatus,
              expires_at: expiresAt,
              store_transaction_id: txn.transactionId ? String(txn.transactionId) : null,
              product_id: txn.productId ? String(txn.productId) : null,
              environment,
              updated_at: new Date().toISOString(),
            })
            .eq("original_transaction_id", originalTransactionId);
          if (retryError) console.error("Failed to update apple_subscriptions after a racing insert:", retryError);
        } else if (insertError.code === "23503") {
          console.warn(
            `appAccountToken on ${originalTransactionId} names no EatPal user; not creating a row (${notificationType}).`
          );
        } else {
          console.error("Failed to insert apple_subscriptions:", insertError);
        }
      }
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
