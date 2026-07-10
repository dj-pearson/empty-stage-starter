/**
 * Support triage agent (US-490) — the first agent handler on the shared runtime.
 *
 * Invoked by the dispatcher (agent-<name> convention). Each run classifies a
 * bounded batch of support_tickets in status 'new' with Claude (haiku) via the
 * runtime's structured-output helper, writes the classification back, advances
 * the ticket to 'triaged', and files a tier-2/3 escalation when the ticket
 * matches the escalation conditions (angry / billing / account_data / urgent).
 *
 * POST /agent-support-triage  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 *
 * The runtime does NOT hand handlers a DB client (draft-first invariant), so
 * this handler creates its own service-role client for ticket reads/writes.
 * Outward-facing effects still only happen via ctx.escalate / requestApproval.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  classificationToEscalation,
  type TicketClassification,
} from '../_shared/support-triage-logic.ts';

const AGENT_NAME = 'support-triage';
const BATCH_SIZE = 10;

const ClassificationSchema = z.object({
  category: z.enum(['bug', 'billing', 'how_to', 'feature_request', 'account_data', 'other']),
  sentiment: z.enum(['positive', 'neutral', 'frustrated', 'angry']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  tier: z.number().int().min(1).max(3),
});

interface TicketRow {
  id: string;
  subject: string;
  description: string | null;
  email: string | null;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

serve(async (req) => {
  const expected = Deno.env.get('AGENT_DISPATCH_SECRET');
  if (!expected || req.headers.get('x-agent-dispatch-secret') !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // Load the agent definition (prompt/model/policy) for the runtime.
  const { data: def } = await db
    .from('agent_definitions')
    .select('id, name, model, system_prompt, daily_cost_cap_usd, autonomy_policy')
    .eq('name', AGENT_NAME)
    .maybeSingle();
  if (!def) return json({ error: `agent '${AGENT_NAME}' is not registered` }, 404);
  const agentDefinition = def as AgentDefinition;

  const result = await runAgent({
    agentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const { data: tickets } = await db
        .from('support_tickets')
        .select('id, subject, description, email')
        .eq('status', 'new')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);

      const batch = (tickets ?? []) as TicketRow[];
      let triaged = 0;
      let escalated = 0;

      for (const ticket of batch) {
        const classification = await ctx.structuredOutput<TicketClassification>({
          schema: ClassificationSchema,
          prompt:
            `Classify this support ticket for EatPal (a meal-planning app).\n\n` +
            `Subject: ${ticket.subject}\n` +
            `Message: ${ticket.description ?? '(no body)'}\n\n` +
            `Return JSON with: category (bug|billing|how_to|feature_request|account_data|other), ` +
            `sentiment (positive|neutral|frustrated|angry), priority (low|medium|high|urgent), ` +
            `and tier (1 routine, 2 needs attention, 3 urgent/sensitive).`,
        });

        const escalation = classificationToEscalation(classification);

        await db
          .from('support_tickets')
          .update({
            category: classification.category,
            sentiment: classification.sentiment,
            priority: classification.priority,
            tier: classification.tier,
            status: 'triaged',
          })
          .eq('id', ticket.id);
        triaged++;

        if (escalation) {
          await ctx.escalate({
            tier: escalation.tier,
            severity: escalation.severity,
            domain: 'customer_service',
            title: `Support ticket needs attention: ${ticket.subject}`,
            context: {
              ticket_id: ticket.id,
              email: ticket.email,
              reasons: escalation.reasons,
              classification,
            } as unknown as Json,
          });
          escalated++;
        }
      }

      return { processed: batch.length, triaged, escalated };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
