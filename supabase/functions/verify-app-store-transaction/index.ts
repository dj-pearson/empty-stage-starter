import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getCorsHeaders, securityHeaders } from "../common/headers.ts";
import { requireUser } from "../_shared/require-admin.ts";
import { AppleJwsError, appleRootCaFromEnv, verifyAppleJwsStrict } from "../_shared/appStoreJws.ts";
import { decideVerifiedTransaction, type ExistingAppleRow } from "../_shared/appStoreTransaction.ts";

/**
 * Verify App Store Transaction
 *
 * POST /verify-app-store-transaction
 * Body: { signedTransaction: string }   // StoreKit 2 Transaction.jwsRepresentation
 * Auth: the signed-in user's JWT (Authorization: Bearer <access token>)
 * 200:  { ok: true, product_id, expires_at, status }
 *
 * The server replacement for the iOS app writing apple_subscriptions itself.
 * Every column comes from the Apple-signed payload after the full certificate
 * chain is verified against APPLE_ROOT_CA_G3 (_shared/appStoreChain.ts); the
 * client supplies nothing but the JWS and its own identity. The row is bound to
 * the caller.
 *
 * Refusals: 401 not signed in; 400 bad body; 422 a JWS that does not verify,
 * or is for another app, an unknown product, or has no expiry; 409 the
 * original transaction already belongs to another account, or its
 * appAccountToken names another account; 503 APPLE_ROOT_CA_G3 unset or the
 * database unavailable. A replayed older transaction is 200 with the stored
 * state and writes nothing. Rules: _shared/appStoreTransaction.ts.
 *
 * ENV: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * APPLE_ROOT_CA_G3 (base64 DER of Apple Root CA - G3).
 */

const MAX_JWS_LENGTH = 32 * 1024;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface StoredRow extends ExistingAppleRow {
  product_id: string | null;
}

export default async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" };
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: jsonHeaders });
  const fail = (status: number, code: string, message: string, detail?: unknown) => {
    if (detail !== undefined) console.error(`verify-app-store-transaction ${code}:`, detail);
    return reply(status, { ok: false, error: message, code });
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Method not allowed");

  const gate = await requireUser(req);
  if (!gate.ok) return fail(gate.status, "unauthorized", gate.error ?? "Unauthorized");
  // requireUser also admits the service-role key with no user; a transaction
  // has to be bound to a person.
  if (!gate.userId) return fail(403, "user_required", "A signed-in user is required");
  const userId = gate.userId;

  const rootCa = appleRootCaFromEnv();
  if (!rootCa || !supabaseUrl || !supabaseServiceKey) {
    return fail(503, "verification_unavailable", "Purchase verification is not configured");
  }

  let body: { signedTransaction?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_body", "Request body must be JSON");
  }
  const jws = body?.signedTransaction;
  if (typeof jws !== "string" || jws.length === 0 || jws.length > MAX_JWS_LENGTH) {
    return fail(400, "missing_signed_transaction", "signedTransaction is required");
  }

  let payload: Record<string, unknown>;
  try {
    payload = await verifyAppleJwsStrict(jws, rootCa);
  } catch (err) {
    if (err instanceof AppleJwsError) {
      console.warn(`verify-app-store-transaction: refused JWS for user ${userId}: ${err.message}`);
      return fail(422, "unverified_transaction", "The transaction could not be verified");
    }
    return fail(500, "verification_error", "Verification failed", err);
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const originalTransactionId = String(payload.originalTransactionId ?? "");

  const readExisting = async (): Promise<{ ok: true; row: StoredRow | null } | { ok: false }> => {
    if (!originalTransactionId) return { ok: true, row: null };
    const { data, error } = await admin
      .from("apple_subscriptions")
      .select("user_id, status, expires_at, store_transaction_id, product_id")
      .eq("original_transaction_id", originalTransactionId)
      .maybeSingle();
    if (error) {
      console.error("verify-app-store-transaction lookup failed:", error);
      return { ok: false };
    }
    return { ok: true, row: (data ?? null) as StoredRow | null };
  };

  // Two passes at most: a racing insert of the same original transaction (the
  // device's own direct upsert on an older build, or Apple's notification)
  // turns into an update, or a 409 if it landed for someone else.
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await readExisting();
    if (!existing.ok) return fail(503, "lookup_failed", "Could not read subscription state");

    const decision = decideVerifiedTransaction({ payload, callerUserId: userId, existing: existing.row, now: new Date() });

    if (decision.kind === "refuse") {
      console.warn(`verify-app-store-transaction ${decision.code} for user ${userId} (${originalTransactionId})`);
      return fail(decision.status, decision.code, decision.message);
    }

    if (decision.kind === "keep") {
      const row = existing.row!;
      return reply(200, { ok: true, product_id: row.product_id, expires_at: row.expires_at, status: row.status });
    }

    const nowIso = new Date().toISOString();
    if (decision.kind === "insert") {
      const { error } = await admin.from("apple_subscriptions").insert({ ...decision.row, updated_at: nowIso });
      if (error?.code === "23505") continue;
      if (error) return fail(503, "write_failed", "Could not record the subscription", error);
    } else {
      // user_id is never written on update, and the filter repeats the owner
      // check so a row that changed hands since the read is left alone.
      const { data, error } = await admin
        .from("apple_subscriptions")
        .update({ ...decision.row, updated_at: nowIso })
        .eq("original_transaction_id", decision.row.original_transaction_id)
        .eq("user_id", existing.row!.user_id)
        .select("user_id");
      if (error) return fail(503, "write_failed", "Could not record the subscription", error);
      if (!data || data.length === 0) continue;
    }

    console.log(
      `verify-app-store-transaction ${decision.kind} ${decision.row.original_transaction_id} -> ${decision.row.status} for user ${userId}`,
    );
    return reply(200, {
      ok: true,
      product_id: decision.row.product_id,
      expires_at: decision.row.expires_at,
      status: decision.row.status,
    });
  }

  return fail(409, "conflict", "The subscription changed while it was being recorded; try again");
};
