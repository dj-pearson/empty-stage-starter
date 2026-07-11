/**
 * Nurture unsubscribe endpoint (US-498).
 *
 * A signed token (?t=) in every nurture email links here. Verifying the token
 * yields the email, which is inserted into email_suppressions so no further
 * nurture email is sent. Returns a simple confirmation page.
 *
 * GET /nurture-unsubscribe?t=<token>
 * Auth: verify_jwt=false (public link); the signed token IS the authorization.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyEmailToken } from '../_shared/nurture-logic.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function page(title: string, message: string, status: number): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title}</title>
     <div style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center">
       <h1 style="font-size:20px">${title}</h1><p style="color:#4b5563">${message}</p>
     </div>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';
  const secret = Deno.env.get('CSAT_TOKEN_SECRET') ?? Deno.env.get('AGENT_DISPATCH_SECRET') ?? '';

  const email = await verifyEmailToken(token, secret);
  if (!email) return page('Invalid link', 'This unsubscribe link could not be verified.', 400);

  const db: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  try {
    // Idempotent: unique(email) — a second unsubscribe is a friendly no-op.
    const { error } = await db.from('email_suppressions').insert({ email, reason: 'unsubscribe' });
    if (error && !/duplicate|unique|23505/i.test(`${error.code} ${error.message}`)) throw error;
    return page('Unsubscribed', `${email} will no longer receive nurture emails from EatPal.`, 200);
  } catch (err) {
    console.error('nurture-unsubscribe error:', err);
    return page('Something went wrong', 'Please try again later.', 500);
  }
});
