/**
 * Support ticket intake edge function (US-489).
 *
 * Accepts { email, subject, body } (Zod-validated), applies basic per-email
 * rate limiting, and creates a support_tickets row (status 'new') plus the
 * first support_messages row (sender 'user'). Anonymous submissions are allowed
 * (user_id null); when a valid JWT is present the ticket is linked to that user.
 *
 * POST /support-intake  { "email": "...", "subject": "...", "body": "..." }
 * Auth: verify_jwt=false (public form). Writes use the service role so
 * anonymous inserts bypass owner-RLS; rate limiting guards abuse.
 *
 * Response (200): { ticket_id, reference }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import {
  ticketReference,
  rateLimitWindowStart,
  isRateLimited,
  INTAKE_MAX_PER_WINDOW,
} from '../_shared/support-intake-logic.ts';

const IntakeSchema = z.object({
  email: z.string().email().max(320),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
});

serve(async (req) => {
  const cors = getCorsHeaders(req);
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...cors },
    });

  if (req.method === 'OPTIONS') return handleCorsPreFlight(req);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Validate the payload at the boundary.
  const raw = await req.json().catch(() => null);
  const parsed = IntakeSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid submission', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { email, subject, body } = parsed.data;

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  try {
    // Basic rate limit: cap tickets per email within the rolling window.
    const windowStart = rateLimitWindowStart(new Date());
    const { count } = await db
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', windowStart);
    if (isRateLimited(count ?? 0)) {
      return json(
        { error: `Too many requests. Please wait before submitting again (max ${INTAKE_MAX_PER_WINDOW}/hour).` },
        429,
      );
    }

    // Link to the authenticated user when a valid JWT is present (optional).
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const authed = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data } = await authed.auth.getUser();
      userId = data.user?.id ?? null;
    }

    const { data: ticket, error: ticketError } = await db
      .from('support_tickets')
      // description is NOT NULL on the pre-existing table; mirror the body into
      // it for backward compatibility with the existing admin ticket UI/views.
      .insert({ user_id: userId, email, subject, description: body, status: 'new' })
      .select('id')
      .single();
    if (ticketError || !ticket) {
      throw new Error(`ticket insert failed: ${ticketError?.message ?? 'unknown'}`);
    }

    const { error: msgError } = await db
      .from('support_messages')
      .insert({ ticket_id: ticket.id, sender: 'user', body });
    if (msgError) {
      throw new Error(`message insert failed: ${msgError.message}`);
    }

    return json({ ticket_id: ticket.id, reference: ticketReference(ticket.id) }, 200);
  } catch (err) {
    console.error('support-intake error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
