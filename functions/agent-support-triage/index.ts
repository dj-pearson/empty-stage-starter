/**
 * Support triage agent (US-490, refactored for US-492).
 *
 * Invoked by the dispatcher. Each run:
 *   1. classifies a bounded batch of support_tickets in status 'new' with Claude
 *      (haiku) via structured output, writes the classification back, advances
 *      the ticket to 'triaged';
 *   2. evaluates the DECLARATIVE escalation rules (agent_escalation_rules) for
 *      each triaged ticket and files the top escalation when any rule matches;
 *   3. runs the SLA sweep — owed tickets with no reply after 24h are escalated
 *      via the same rules engine (the SLA rule).
 *
 * POST /agent-support-triage  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  evaluateEscalationRules,
  topEscalation,
  type EscalationRule,
  type RuleInput,
} from '../_shared/escalation-rules.ts';

const AGENT_NAME = 'support-triage';
const BATCH_SIZE = 10;
const SLA_SWEEP_LIMIT = 20;
const OWED_STATUSES = ['new', 'triaged', 'awaiting_reply'];

const ClassificationSchema = z.object({
  category: z.enum(['bug', 'billing', 'how_to', 'feature_request', 'account_data', 'other']),
  sentiment: z.enum(['positive', 'neutral', 'frustrated', 'angry']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  tier: z.number().int().min(1).max(3),
});
interface Classification {
  category: 'bug' | 'billing' | 'how_to' | 'feature_request' | 'account_data' | 'other';
  sentiment: 'positive' | 'neutral' | 'frustrated' | 'angry';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tier: number;
}

interface TicketRow {
  id: string;
  subject: string;
  description: string | null;
  email: string | null;
  status?: string;
  category?: string | null;
  sentiment?: string | null;
  priority?: string | null;
  updated_at?: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/** Has this ticket already got an open escalation? (idempotency / no storms.) */
async function hasOpenEscalation(db: SupabaseClient, ticketId: string): Promise<boolean> {
  const { count } = await db
    .from('agent_escalations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
    .eq('context->>ticket_id', ticketId);
  return (count ?? 0) > 0;
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

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      // Load enabled escalation rules once (US-492 — routing is data).
      const { data: ruleRows } = await db
        .from('agent_escalation_rules')
        .select('id, domain, condition, tier, severity, enabled, description')
        .eq('enabled', true);
      const rules = (ruleRows ?? []) as EscalationRule[];

      const searchText = (t: TicketRow) => `${t.subject} ${t.description ?? ''}`.toLowerCase();

      async function fileEscalation(ticket: TicketRow, input: RuleInput, classification?: Classification) {
        const matches = evaluateEscalationRules(input, rules);
        const top = topEscalation(matches);
        if (!top) return false;
        if (await hasOpenEscalation(db, ticket.id)) return false;
        await ctx.escalate({
          tier: top.tier,
          severity: top.severity,
          domain: top.domain ?? 'customer_service',
          title: `Support ticket needs attention: ${ticket.subject}`,
          context: {
            ticket_id: ticket.id,
            email: ticket.email,
            reasons: top.reasons,
            rule_ids: top.rule_ids,
            classification: classification ?? null,
          } as unknown as Json,
        });
        return true;
      }

      // --- 1 & 2. Classify + rule-evaluate new tickets ---------------------
      const { data: newTickets } = await db
        .from('support_tickets')
        .select('id, subject, description, email')
        .eq('status', 'new')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);

      const batch = (newTickets ?? []) as TicketRow[];
      let triaged = 0;
      let escalated = 0;

      for (const ticket of batch) {
        const classification = await ctx.structuredOutput<Classification>({
          schema: ClassificationSchema,
          prompt:
            `Classify this support ticket for EatPal (a meal-planning app).\n\n` +
            `Subject: ${ticket.subject}\n` +
            `Message: ${ticket.description ?? '(no body)'}\n\n` +
            `Return JSON with: category (bug|billing|how_to|feature_request|account_data|other), ` +
            `sentiment (positive|neutral|frustrated|angry), priority (low|medium|high|urgent), ` +
            `and tier (1 routine, 2 needs attention, 3 urgent/sensitive).`,
        });

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

        const input: RuleInput = {
          category: classification.category,
          sentiment: classification.sentiment,
          priority: classification.priority,
          status: 'triaged',
          text: searchText(ticket),
          ageHours: 0,
        };
        if (await fileEscalation(ticket, input, classification)) escalated++;
      }

      // --- 3. SLA sweep: owed tickets with no reply after 24h --------------
      const cutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const { data: staleTickets } = await db
        .from('support_tickets')
        .select('id, subject, description, email, status, category, sentiment, priority, updated_at')
        .in('status', OWED_STATUSES)
        .lt('updated_at', cutoff)
        .order('updated_at', { ascending: true })
        .limit(SLA_SWEEP_LIMIT);

      let slaEscalated = 0;
      for (const ticket of (staleTickets ?? []) as TicketRow[]) {
        const ageHours = ticket.updated_at
          ? (Date.now() - new Date(ticket.updated_at).getTime()) / 3_600_000
          : null;
        const input: RuleInput = {
          category: ticket.category ?? null,
          sentiment: ticket.sentiment ?? null,
          priority: ticket.priority ?? null,
          status: ticket.status ?? null,
          text: searchText(ticket),
          ageHours,
        };
        if (await fileEscalation(ticket, input)) slaEscalated++;
      }

      return { processed: batch.length, triaged, escalated, slaEscalated };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
