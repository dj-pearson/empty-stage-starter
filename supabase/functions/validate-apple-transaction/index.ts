import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getCorsHeaders, securityHeaders } from "../common/headers.ts";
import { verifyAppleJWS } from "../common/apple-jws.ts";
import { deriveStatus, tierForProduct } from "../common/apple-entitlement.ts";

// Server-side validation of a StoreKit 2 transaction relayed by the device.
//
// WHY: the iOS client used to upsert `apple_subscriptions` directly. RLS only
// checks `auth.uid() = user_id`, so a tampered client could write
// status:"active" for a product it never bought and unlock premium features.
// Here the device instead sends the transaction's `jwsRepresentation` (an
// Apple-signed JWS). We verify Apple's signature, derive the entitlement from
// the VERIFIED payload, and write the row with the service role. The client can
// no longer fabricate entitlement — only Apple-signed transactions are honored.
//
// The row is keyed by originalTransactionId (matching the App Store Server
// Notifications handler) and bound to the authenticated user from the JWT, not
// to any value the client supplies.
//
// Request:  POST { "jws": "<transaction.jwsRepresentation>" }  (+ Bearer auth)
// Response: { tier, status, expiresAt, productId, originalTransactionId }

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export default async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate the caller from the JWT — the row is bound to THIS user,
    // never to a user_id the client claims.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const jws = (body as { jws?: string }).jws;
    if (!jws) {
      return new Response(JSON.stringify({ error: "Missing jws" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    // Verify Apple's signature and decode the transaction.
    let txn: Record<string, unknown>;
    try {
      txn = await verifyAppleJWS(jws);
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: `Transaction verification failed: ${err instanceof Error ? err.message : "unknown error"}`,
        }),
        { status: 401, headers: jsonHeaders },
      );
    }

    const originalTransactionId = txn.originalTransactionId ? String(txn.originalTransactionId) : "";
    if (!originalTransactionId) {
      return new Response(JSON.stringify({ error: "Transaction missing originalTransactionId" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const productId = txn.productId ? String(txn.productId) : null;
    const expiresDate = txn.expiresDate != null ? Number(txn.expiresDate) : null;
    const revocationDate = txn.revocationDate != null ? Number(txn.revocationDate) : null;
    const environment = txn.environment ? String(txn.environment) : null;

    const status = deriveStatus({ productId, expiresDate, revocationDate }, Date.now());
    const tier = status === "active" ? tierForProduct(productId) : "free";
    const expiresAt = expiresDate != null ? new Date(expiresDate).toISOString() : null;

    const { error: upsertError } = await supabase
      .from("apple_subscriptions")
      .upsert(
        {
          user_id: user.id,
          original_transaction_id: originalTransactionId,
          store_transaction_id: txn.transactionId ? String(txn.transactionId) : null,
          product_id: productId,
          status,
          expires_at: expiresAt,
          environment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "original_transaction_id" },
      );

    if (upsertError) {
      console.error("Failed to upsert apple_subscriptions:", upsertError);
      return new Response(JSON.stringify({ error: "Failed to record subscription" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    console.log(
      `Validated apple_subscription ${originalTransactionId} -> ${status}/${tier} for user ${user.id}`,
    );

    return new Response(
      JSON.stringify({ tier, status, expiresAt, productId, originalTransactionId }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    console.error("validate-apple-transaction error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown error" }),
      { status: 500, headers: jsonHeaders },
    );
  }
};
