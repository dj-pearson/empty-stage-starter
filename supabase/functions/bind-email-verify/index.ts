// Verifies the 6-digit code emitted by bind-email-request and, on success,
// rewrites auth.users.email to the previously-requested address. The
// caller's Apple identity in auth.identities is preserved, so Apple Sign In
// continues to work; the user can additionally set a password client-side
// via supabase.auth.updateUser({ password }) once this returns ok.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ATTEMPTS = 5;

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Server misconfigured" }, 500);
  }

  let body: { code?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const code = (body.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code" }, 400);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Newest unconsumed request for this user. There should be at most one
  // (request handler invalidates priors), but order anyway for safety.
  const { data: request, error: reqErr } = await admin
    .from("email_bind_requests")
    .select("id, requested_email, code_hash, expires_at, attempts, consumed_at")
    .eq("user_id", userId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reqErr) return json({ error: "Could not load request", detail: reqErr.message }, 500);
  if (!request) return json({ error: "No active code — request a new one" }, 404);

  if (new Date(request.expires_at).getTime() < Date.now()) {
    await admin.from("email_bind_requests")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", request.id);
    return json({ error: "Code expired — request a new one" }, 410);
  }

  if (request.attempts >= MAX_ATTEMPTS) {
    await admin.from("email_bind_requests")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", request.id);
    return json({ error: "Too many attempts — request a new code" }, 429);
  }

  const submittedHash = await sha256Hex(code);
  // Constant-time comparison via fixed-length hex strings.
  if (!timingSafeEqual(submittedHash, request.code_hash)) {
    const newAttempts = request.attempts + 1;
    await admin.from("email_bind_requests")
      .update({ attempts: newAttempts })
      .eq("id", request.id);
    const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts);
    return json({
      error: remaining > 0
        ? `Wrong code — ${remaining} attempt${remaining === 1 ? "" : "s"} left`
        : "Too many attempts — request a new code",
      attemptsRemaining: remaining,
    }, 400);
  }

  // Final collision check (in case another account claimed this email
  // between request and verify).
  const { data: taken, error: takenErr } = await admin.rpc("email_taken_by_other", {
    p_email: request.requested_email,
  });
  if (takenErr) return json({ error: "Could not validate email", detail: takenErr.message }, 500);
  if (taken === true) {
    await admin.from("email_bind_requests")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", request.id);
    return json({ error: "That email was just claimed by another account" }, 409);
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
    email: request.requested_email,
    email_confirm: true,
  });
  if (updateErr) {
    return json({ error: "Could not update email", detail: updateErr.message }, 500);
  }

  await admin.from("email_bind_requests")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", request.id);

  return json({ ok: true, email: request.requested_email });
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
