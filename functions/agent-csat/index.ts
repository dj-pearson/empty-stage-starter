/**
 * CSAT follow-up agent (US-495).
 *
 * ~24h after a ticket is resolved, drafts a templated rating email (1..5 link
 * buttons hitting the public csat-rate endpoint with a signed token) via
 * requestApproval (payload templated:true). One email max per ticket: suppressed
 * if the ticket already has a CSAT approval or an existing rating.
 *
 * POST /agent-csat  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import { signCsatToken, ratingLinks, buildCsatEmail, resolveCsatTokenSecret } from '../_shared/csat-logic.ts';

const AGENT_NAME = 'csat';
const BATCH_SIZE = 25;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function functionsBase(): string {
  const url = Deno.env.get('SUPABASE_URL');
  return url ? `${url}/functions/v1` : (Deno.env.get('FUNCTIONS_URL') ?? '');
}

serve(async (req) => {
  const expected = Deno.env.get('AGENT_DISPATCH_SECRET');
  if (!expected || req.headers.get('x-agent-dispatch-secret') !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const { data: def } = await db
    .from('agent_definitions')
    .select('id, name, model, system_prompt, daily_cost_cap_usd, autonomy_policy')
    .eq('name', AGENT_NAME)
    .maybeSingle();
  if (!def) return json({ error: `agent '${AGENT_NAME}' is not registered` }, 404);

  // Fail closed: CSAT links must be signed with the dedicated secret (US-521).
  const tokenSecret = resolveCsatTokenSecret(Deno.env.get('CSAT_TOKEN_SECRET'));
  if (!tokenSecret) {
    return json({ error: 'CSAT_TOKEN_SECRET is not configured' }, 500);
  }

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const cutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const { data: tickets } = await db
        .from('support_tickets')
        .select('id, subject, email, resolved_at')
        .eq('status', 'resolved')
        .lt('resolved_at', cutoff)
        .not('email', 'is', null)
        .order('resolved_at', { ascending: true })
        .limit(BATCH_SIZE);

      const batch = (tickets ?? []) as Array<{ id: string; subject: string; email: string | null }>;
      let drafted = 0;
      let suppressed = 0;

      for (const ticket of batch) {
        if (!ticket.email) {
          suppressed++;
          continue;
        }
        // Already rated?
        const { count: rated } = await db
          .from('support_csat')
          .select('id', { count: 'exact', head: true })
          .eq('ticket_id', ticket.id);
        // Already emailed (a CSAT approval exists)?
        const { count: emailed } = await db
          .from('agent_approvals')
          .select('id', { count: 'exact', head: true })
          .eq('action_type', 'send_email')
          .eq('payload->>kind', 'csat')
          .eq('payload->>ticket_id', ticket.id);
        if ((rated ?? 0) > 0 || (emailed ?? 0) > 0) {
          suppressed++;
          continue;
        }

        const token = await signCsatToken(ticket.id, tokenSecret);
        const email = buildCsatEmail(ticket.subject, ratingLinks(functionsBase(), token));
        await ctx.requestApproval({
          actionType: 'send_email',
          payload: {
            to: ticket.email,
            subject: email.subject,
            body: email.html,
            html: email.html,
            ticket_id: ticket.id,
            kind: 'csat',
            templated: true,
          } as unknown as Json,
          expiresInHours: 168,
        });
        drafted++;
      }

      return { processed: batch.length, drafted, suppressed };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
