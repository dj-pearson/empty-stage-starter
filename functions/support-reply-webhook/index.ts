/**
 * Support reply intake (US-494).
 *
 * Handles the inbound side of the support conversation loop:
 *   - inbound user reply (Resend inbound webhook, or an admin paste): matches the
 *     ticket via the [EPT-<id>] subject token, appends a 'user' message, and
 *     sets the ticket back to 'new' so triage re-runs.
 *   - admin_reply: an admin replies manually; records a 'sender:admin' message,
 *     emails the user (with the ticket token), and moves the ticket to
 *     'awaiting_user'.
 *   - resolve: an admin resolves the ticket (status 'resolved' + resolved_at).
 *
 * POST /support-reply-webhook
 *   { subject, body, email? }                      (inbound; internal secret or admin)
 *   { mode:'admin_reply', ticket_id, body }         (admin JWT)
 *   { mode:'resolve', ticket_id, note? }            (admin JWT)
 *
 * Auth (verify_jwt=false): internal AGENT_DISPATCH_SECRET (inbound webhook) OR
 * an admin JWT. admin_reply/resolve require admin.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { isAdmin } from '../_shared/admin.ts';
import { canTransition, parseTicketToken, withTicketToken } from '../_shared/support-status-logic.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

serve(async (req) => {
  const cors = getCorsHeaders(req);
  const json = (b: unknown, s: number) =>
    new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...cors } });

  if (req.method === 'OPTIONS') return handleCorsPreFlight(req);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('AGENT_DISPATCH_SECRET');
  const internalOk = !!secret && req.headers.get('x-agent-dispatch-secret') === secret;

  // Admin detection (for admin_reply / resolve / admin paste).
  let adminOk = false;
  if (!internalOk) {
    const auth = await authenticateRequest(req);
    if (!auth.error) {
      const anon = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      );
      adminOk = await isAdmin(anon, auth.user.id);
    }
  }
  if (!internalOk && !adminOk) return json({ error: 'Unauthorized' }, 401);

  const db: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode ?? 'inbound';

  /** Update status only through a legal transition (US-494 guard). */
  async function setStatus(ticketId: string, from: string, to: string, extra: Record<string, unknown> = {}) {
    if (!canTransition(from, to)) return false;
    await db.from('support_tickets').update({ status: to, ...extra }).eq('id', ticketId);
    return true;
  }

  try {
    if (mode === 'admin_reply' || mode === 'resolve') {
      if (!adminOk) return json({ error: 'admin role required' }, 403);
      const ticketId = body?.ticket_id;
      if (!ticketId || typeof ticketId !== 'string') return json({ error: 'ticket_id is required' }, 400);

      const { data: ticket } = await db
        .from('support_tickets')
        .select('id, subject, email, status')
        .eq('id', ticketId)
        .maybeSingle();
      if (!ticket) return json({ error: 'ticket not found' }, 404);

      if (mode === 'resolve') {
        await db.from('support_tickets').update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        }).eq('id', ticketId);
        if (typeof body?.note === 'string' && body.note.trim()) {
          await db.from('support_messages').insert({
            ticket_id: ticketId,
            sender: 'admin',
            body: body.note,
            metadata: { kind: 'resolution_note', internal: true },
          });
        }
        return json({ resolved: true }, 200);
      }

      // admin_reply
      const reply = typeof body?.body === 'string' ? body.body.trim() : '';
      if (!reply) return json({ error: 'body is required' }, 400);
      await db.from('support_messages').insert({
        ticket_id: ticketId,
        sender: 'admin',
        body: reply,
        metadata: { kind: 'reply' },
      });
      // Email the user (best-effort) with the ticket token embedded.
      const apiKey = Deno.env.get('RESEND_API_KEY');
      if (apiKey && ticket.email) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: Deno.env.get('EMAIL_FROM') ?? 'noreply@tryeatpal.com',
            to: ticket.email,
            subject: withTicketToken(`Re: ${ticket.subject}`, ticketId),
            html: `<div style="font-family:system-ui,sans-serif">${reply}</div>`,
          }),
        }).catch((e) => console.error('admin reply email failed:', e));
      }
      await setStatus(ticketId, ticket.status, 'awaiting_user');
      return json({ replied: true }, 200);
    }

    // --- inbound user reply ---------------------------------------------------
    const subject = typeof body?.subject === 'string' ? body.subject : '';
    const message = typeof body?.body === 'string' ? body.body.trim() : '';
    const ticketId = parseTicketToken(subject);
    if (!ticketId) return json({ error: 'no ticket token found in subject' }, 400);
    if (!message) return json({ error: 'body is required' }, 400);

    const { data: ticket } = await db
      .from('support_tickets')
      .select('id, status')
      .eq('id', ticketId)
      .maybeSingle();
    if (!ticket) return json({ error: 'ticket not found' }, 404);

    await db.from('support_messages').insert({
      ticket_id: ticketId,
      sender: 'user',
      body: message,
      metadata: { kind: 'inbound_reply' },
    });
    // Reopen for re-triage (handles awaiting_user and resolved -> new).
    await setStatus(ticketId, ticket.status, 'new');
    return json({ received: true, ticket_id: ticketId }, 200);
  } catch (err) {
    console.error('support-reply-webhook error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
