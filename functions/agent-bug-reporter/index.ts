/**
 * Bug-report-to-GitHub-issue agent (US-493).
 *
 * For triaged 'bug' tickets, drafts a well-formed GitHub issue via structured
 * output and submits it through requestApproval({actionType:'github_issue'}).
 * Duplicate suppression: before drafting, checks OPEN github_issue approvals for
 * the same normalized-title fingerprint and links the new ticket to the existing
 * one (internal note) instead of drafting a duplicate.
 *
 * The issue URL is written back to the ticket on EXECUTION by the
 * approval-executor (US-482), not here.
 *
 * POST /agent-bug-reporter  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import { ticketReference } from '../_shared/support-intake-logic.ts';
import { normalizeTitle, buildIssueBody, type BugDraft } from '../_shared/bug-report-logic.ts';

const AGENT_NAME = 'bug-reporter';
const BATCH_SIZE = 5;

const BugSchema = z.object({
  title: z.string().min(1).max(160),
  repro_steps: z.string(),
  expected: z.string(),
  actual: z.string(),
  device_platform: z.string().nullable().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
});

interface TicketRow {
  id: string;
  subject: string;
  description: string | null;
  email: string | null;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

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
      const { data: tickets } = await db
        .from('support_tickets')
        .select('id, subject, description, email')
        .eq('status', 'triaged')
        .eq('category', 'bug')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);

      const batch = (tickets ?? []) as TicketRow[];
      let drafted = 0;
      let linked = 0;

      for (const ticket of batch) {
        const fingerprint = normalizeTitle(ticket.subject);

        // Duplicate suppression: an OPEN github_issue approval with the same
        // fingerprint (or already referencing this ticket) means don't re-draft.
        const { data: existing } = await db
          .from('agent_approvals')
          .select('id, payload')
          .eq('action_type', 'github_issue')
          .in('status', ['draft', 'approved', 'executed'])
          .or(`payload->>fingerprint.eq.${fingerprint},payload->>ticket_id.eq.${ticket.id}`)
          .limit(1);

        if (existing && existing.length > 0) {
          const dupOf = existing[0] as { id: string; payload: Record<string, unknown> };
          // Only add a link note once (skip if this ticket IS the original).
          if (dupOf.payload?.ticket_id !== ticket.id) {
            await db.from('support_messages').insert({
              ticket_id: ticket.id,
              sender: 'agent',
              body: `Linked to an existing bug report (approval ${dupOf.id}). No duplicate issue drafted.`,
              metadata: { internal: true, kind: 'bug_dedupe', linked_approval_id: dupOf.id },
            });
            linked++;
          }
          continue;
        }

        const draft = await ctx.structuredOutput<BugDraft>({
          schema: BugSchema,
          prompt:
            `Turn this bug report into a GitHub issue for the EatPal engineering team.\n\n` +
            `Subject: ${ticket.subject}\n` +
            `Report: ${ticket.description ?? '(no body)'}\n\n` +
            `Return JSON: title (concise), repro_steps, expected, actual, ` +
            `device_platform (null if unknown), severity (low|medium|high|critical).`,
        });

        const reference = ticketReference(ticket.id);
        await ctx.requestApproval({
          actionType: 'github_issue',
          payload: {
            title: draft.title,
            body: buildIssueBody(draft, reference),
            labels: ['bug', 'support'],
            ticket_id: ticket.id,
            fingerprint,
            severity: draft.severity,
          } as unknown as Json,
          expiresInHours: 168,
        });
        drafted++;
      }

      return { processed: batch.length, drafted, linked };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
