/**
 * Public CSAT rating endpoint (US-495).
 *
 * A user taps a 1..5 button in the CSAT email, which hits this endpoint with a
 * signed token (?t=) and score (&score=). It verifies the token, records the
 * score ONCE (support_csat.ticket_id is UNIQUE — single-use), escalates a low
 * score (<= 2), and returns a simple thank-you HTML page.
 *
 * GET /csat-rate?t=<token>&score=<1..5>
 * Auth: verify_jwt=false (public link); the signed token IS the authorization.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyCsatToken, isValidScore, scoreEscalates } from '../_shared/csat-logic.ts';
import { buildEscalation } from '../_shared/agent-approval-logic.ts';

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
  const score = Number(url.searchParams.get('score'));

  if (!token || !isValidScore(score)) {
    return page('Invalid link', 'This rating link is invalid or incomplete.', 400);
  }

  const secret = Deno.env.get('CSAT_TOKEN_SECRET') ?? Deno.env.get('AGENT_DISPATCH_SECRET') ?? '';
  const ticketId = await verifyCsatToken(token, secret);
  if (!ticketId) {
    return page('Invalid link', 'This rating link could not be verified.', 400);
  }

  const db: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  try {
    // Single-use: the UNIQUE(ticket_id) constraint rejects a second insert.
    const { error } = await db.from('support_csat').insert({ ticket_id: ticketId, score });
    if (error) {
      // Duplicate = already rated; treat as a friendly no-op.
      if (String(error.code) === '23505' || /duplicate|unique/i.test(error.message ?? '')) {
        return page('Already rated', 'Thanks — we already recorded your rating for this ticket.', 200);
      }
      throw error;
    }

    if (scoreEscalates(score)) {
      const { escalation, audit } = buildEscalation(
        {
          agentId: null,
          agentName: 'csat',
          runId: null,
          tier: 2,
          severity: 'medium',
          domain: 'customer_service',
          title: `Low CSAT score (${score}/5)`,
          context: { ticket_id: ticketId, score },
        },
        new Date(),
      );
      const { data: row } = await db.from('agent_escalations').insert(escalation).select('id').single();
      if (row) await db.from('agent_audit_log').insert({ ...audit, subject_id: row.id });
    }

    return page('Thank you!', 'Your feedback helps us improve EatPal support.', 200);
  } catch (err) {
    console.error('csat-rate error:', err);
    return page('Something went wrong', 'Please try again later.', 500);
  }
});
