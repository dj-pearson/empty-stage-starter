// Generates a 6-digit verification code that lets an Apple-relay user
// bind a real email address to their account. The code is hashed at rest
// and emailed to the requested address; the user calls bind-email-verify
// with the code to swap their auth.users.email.
//
// Auth: caller's user JWT (anon client). Mutations use the service-role
// client to bypass the (locked-down) RLS on email_bind_requests.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const PER_TARGET_HOURLY_LIMIT = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  let body: { email?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const target = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(target)) return json({ error: "Enter a valid email address" }, 400);
  if (target.endsWith("@privaterelay.appleid.com")) {
    return json({ error: "Choose a real email — not an Apple relay address" }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;
  const currentEmail = (userData.user.email ?? "").toLowerCase();
  if (target === currentEmail) {
    return json({ error: "That's already your account email" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pre-check email collision so we don't email a code the user can never bind.
  const { data: takenData, error: takenErr } = await admin.rpc("email_taken_by_other", {
    p_email: target,
  });
  if (takenErr) return json({ error: "Could not validate email", detail: takenErr.message }, 500);
  if (takenData === true) {
    return json({ error: "That email is already linked to another account" }, 409);
  }

  // Per-user resend cooldown: most-recent request within the last 60s blocks.
  const cooldownCutoff = new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000).toISOString();
  const { data: recent } = await admin
    .from("email_bind_requests")
    .select("created_at")
    .eq("user_id", userId)
    .gt("created_at", cooldownCutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    const elapsed = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
    const wait = Math.max(1, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
    return json({ error: `Please wait ${wait}s before requesting another code` }, 429);
  }

  // Per-target hourly limit (defense-in-depth against inbox spamming).
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: targetCount } = await admin
    .from("email_bind_requests")
    .select("id", { count: "exact", head: true })
    .ilike("requested_email", target)
    .gt("created_at", hourAgo);
  if ((targetCount ?? 0) >= PER_TARGET_HOURLY_LIMIT) {
    return json({ error: "Too many recent requests for that email — try again later" }, 429);
  }

  // Invalidate any prior unconsumed requests for this user (latest-wins).
  await admin
    .from("email_bind_requests")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("consumed_at", null);

  const code = generateCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertErr } = await admin.from("email_bind_requests").insert({
    user_id: userId,
    requested_email: target,
    code_hash: codeHash,
    expires_at: expiresAt,
  });
  if (insertErr) return json({ error: "Could not create code", detail: insertErr.message }, 500);

  const sent = await sendVerificationEmail(target, code);
  if (!sent.ok) {
    console.error("bind-email-request: send failed", sent.error);
    return json({ error: "Could not send email — try again" }, 502);
  }

  return json({
    ok: true,
    expiresAt,
    expiresInSeconds: CODE_TTL_MINUTES * 60,
    maxAttempts: MAX_ATTEMPTS,
  });
};

function generateCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  // Take 24 bits worth of entropy, mod 1_000_000, zero-pad.
  const n = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 1_000_000;
  return n.toString().padStart(6, "0");
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sendVerificationEmail(to: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const provider = (Deno.env.get("EMAIL_PROVIDER") ?? "console").toLowerCase();
  const subject = "Your EatPal verification code";
  const text = `Your EatPal verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.\n\nIf you didn't request this, you can ignore this email.`;
  const html = `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:560px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:white;padding:24px;text-align:center;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;font-size:20px;">Verify your email</h1>
  </div>
  <div style="background:#f9fafb;padding:24px;border-radius:0 0 10px 10px;">
    <p>Enter this code in EatPal to bind this email to your account:</p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:white;padding:20px;border-radius:8px;border:1px solid #e5e7eb;margin:20px 0;font-family:monospace;">${code}</div>
    <p style="color:#6b7280;font-size:13px;">This code expires in ${CODE_TTL_MINUTES} minutes. If you didn't request it, you can safely ignore this email.</p>
  </div>
</body></html>`;

  if (provider === "resend") {
    const apiKey = Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("RESEND_API") ?? "";
    const from = Deno.env.get("EMAIL_FROM") ?? "noreply@eatpal.com";
    if (!apiKey) return { ok: false, error: "RESEND_API_KEY not configured" };

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${detail}` };
    }
    return { ok: true };
  }

  // Console fallback (dev / self-hosted without Resend). Code visible in logs only.
  console.log(`[bind-email-request] code for ${to}: ${code}`);
  return { ok: true };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
