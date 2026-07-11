/**
 * Agent self-evaluation report agent (US-514).
 *
 * Weekly (dispatcher). Aggregates the week's agent_feedback into per-agent
 * quality metrics (approval/edit rates, avg edit distance, top rejection
 * reasons, cost per approved action), asks Claude to suggest concrete
 * system_prompt tweaks per agent from the actual rejections/edits, and delivers
 * the whole thing as a single tier-2 'Agent quality report' escalation.
 *
 * POST /agent-self-eval  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import { aggregateFeedback, type FeedbackRecord, type AgentQualityMetrics } from '../_shared/self-eval-logic.ts';

const AGENT_NAME = 'self-eval';
const DAY_MS = 86_400_000;

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

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const weekOf = weekAgo.slice(0, 10);

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      // Week's feedback, joined to the agent name.
      const { data: fbRows } = await db
        .from('agent_feedback')
        .select('agent_id, decision, edit_distance, rejection_reason, agent_definitions(name)')
        .gte('created_at', weekAgo);
      const records: FeedbackRecord[] = ((fbRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
        agent_id: (r.agent_id as string) ?? null,
        agent_name: ((r.agent_definitions as { name?: string } | null)?.name) ?? null,
        decision: r.decision as FeedbackRecord['decision'],
        edit_distance: (r.edit_distance as number | null) ?? null,
        rejection_reason: (r.rejection_reason as string | null) ?? null,
      }));

      if (records.length === 0) {
        return { week_of: weekOf, agents: 0, note: 'no feedback this week' };
      }

      // Per-agent cost for the same window (for cost-per-approved-action).
      const { data: runRows } = await db
        .from('agent_runs')
        .select('agent_id, cost_usd')
        .gte('started_at', weekAgo);
      const costByAgent: Record<string, number> = {};
      for (const r of (runRows ?? []) as Array<{ agent_id: string | null; cost_usd: number | null }>) {
        if (!r.agent_id) continue;
        costByAgent[r.agent_id] = (costByAgent[r.agent_id] ?? 0) + (r.cost_usd ?? 0);
      }

      const metrics = aggregateFeedback(records, costByAgent);

      // Per-agent prompt suggestions from the actual rejections/edits.
      const sections: string[] = [];
      for (const m of metrics) {
        const section = await buildAgentSection(ctx, db, m, records, weekAgo);
        sections.push(section);
      }

      const body =
        `# Agent quality report\n_Week of ${weekOf}_\n\n` +
        metricsTable(metrics) +
        `\n\n` +
        sections.join('\n\n---\n\n');

      await ctx.escalate({
        tier: 2,
        severity: 'medium',
        domain: 'dev_maintenance',
        title: 'Agent quality report',
        context: { week_of: weekOf, metrics, report: body } as unknown as Json,
      });

      return { week_of: weekOf, agents: metrics.length, feedback: records.length } as unknown as Json;
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});

function metricsTable(metrics: AgentQualityMetrics[]): string {
  const head = `| Agent | Total | Approval | Edit rate | Avg edit dist | Rejected | $/approved |\n|---|---|---|---|---|---|---|`;
  const rows = metrics.map((m) =>
    `| ${m.agentName} | ${m.total} | ${pct(m.approvalRate)} | ${pct(m.editRate)} | ${m.avgEditDistance ?? '—'} | ${m.rejected} | ${m.costPerApproved === null ? '—' : `$${m.costPerApproved}`} |`,
  );
  return [head, ...rows].join('\n');
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

async function buildAgentSection(
  // deno-lint-ignore no-explicit-any
  ctx: any,
  db: SupabaseClient,
  m: AgentQualityMetrics,
  records: FeedbackRecord[],
  weekAgo: string,
): Promise<string> {
  const header = `## ${m.agentName}\nApproval ${pct(m.approvalRate)} · edit ${pct(m.editRate)} · ${m.rejected} rejected` +
    (m.topRejectionReasons.length ? `\nTop rejections: ${m.topRejectionReasons.map((r) => `${r.reason} (${r.count})`).join(', ')}` : '');

  // Nothing to learn from when the agent was clean this week.
  if (m.rejected === 0 && m.edited === 0) {
    return `${header}\n\n_No rejections or edits — prompt looks healthy._`;
  }

  // Pull the current prompt so the suggestion is grounded in what exists today.
  const { data: agentDef } = await db
    .from('agent_definitions')
    .select('system_prompt')
    .eq('id', m.agentId)
    .maybeSingle();

  const suggestion = await ctx.complete({
    messages: [
      {
        role: 'user',
        content:
          `Agent "${m.agentName}" over the past week: ${m.rejected} rejections, ${m.edited} edited approvals ` +
          `(avg edit distance ${m.avgEditDistance ?? 'n/a'}).\n` +
          `Top rejection reasons: ${JSON.stringify(m.topRejectionReasons)}.\n\n` +
          `Current system_prompt:\n"""${(agentDef?.system_prompt ?? '(none)').slice(0, 1500)}"""\n\n` +
          `Propose specific, minimal system_prompt changes that would reduce these rejections/edits. ` +
          `Quote the failure pattern each change targets. Do not rewrite the whole prompt.`,
      },
    ],
    maxTokens: 600,
  });

  return `${header}\n\n**Suggested prompt changes:**\n${suggestion.text}`;
}
