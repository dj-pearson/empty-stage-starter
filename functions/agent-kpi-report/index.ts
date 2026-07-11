/**
 * Weekly business KPI report agent (US-513).
 *
 * Mondays (dispatcher). Computes the week's KPIs vs the prior week — all figures
 * from SQL — then Claude writes a short narrative from those numbers only. The
 * report is drafted as a templated send_email to the configured digest
 * recipients and stored on the run output so it is viewable in the runs board.
 *
 * POST /agent-kpi-report  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import { buildKpiReport, trendArrow, type KpiRaw, type Metric } from '../_shared/kpi-report-logic.ts';

const AGENT_NAME = 'kpi-report';
const DAY_MS = 86_400_000;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/** COUNT(*) over [from,to) on `col`, tolerant of a missing table/column. */
async function countIn(db: SupabaseClient, table: string, col: string, from: string, to: string, eq?: [string, string]): Promise<number> {
  try {
    let q = db.from(table).select('id', { count: 'exact', head: true }).gte(col, from).lt(col, to);
    if (eq) q = q.eq(eq[0], eq[1]);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Count of signups in the window who created at least one plan (activation proxy). */
async function activatedCount(db: SupabaseClient, from: string, to: string): Promise<number> {
  try {
    const { data: signups } = await db.from('profiles').select('id').gte('created_at', from).lt('created_at', to);
    const ids = (signups ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) return 0;
    const { data: planned } = await db.from('plan_entries').select('user_id').in('user_id', ids);
    return new Set((planned ?? []).map((r: { user_id: string }) => r.user_id)).size;
  } catch {
    return 0;
  }
}

async function activeSubsAndMrr(db: SupabaseClient): Promise<{ active: number; mrr: number }> {
  try {
    const { data: subs } = await db.from('user_subscriptions').select('plan_id').eq('status', 'active');
    const active = (subs ?? []).length;
    const planIds = [...new Set((subs ?? []).map((s: { plan_id: string | null }) => s.plan_id).filter(Boolean))];
    let mrr = 0;
    if (planIds.length > 0) {
      const { data: plans } = await db.from('subscription_plans').select('id, price_monthly').in('id', planIds);
      const price = new Map<string, number>();
      for (const p of (plans ?? []) as Array<{ id: string; price_monthly: number }>) {
        price.set(p.id, Number(p.price_monthly) || 0);
      }
      for (const s of (subs ?? []) as Array<{ plan_id: string }>) mrr += price.get(s.plan_id) ?? 0;
    }
    return { active, mrr };
  } catch {
    return { active: 0, mrr: 0 };
  }
}

async function csatScores(db: SupabaseClient, from: string, to: string): Promise<number[]> {
  try {
    const { data } = await db.from('support_csat').select('score').gte('created_at', from).lt('created_at', to);
    return (data ?? []).map((r: { score: number }) => Number(r.score)).filter((n: number) => Number.isFinite(n));
  } catch {
    return [];
  }
}

async function agentSpend(db: SupabaseClient, from: string, to: string): Promise<number> {
  try {
    const { data } = await db.from('agent_runs').select('cost_usd').gte('started_at', from).lt('started_at', to);
    return (data ?? []).reduce((s: number, r: { cost_usd: number | null }) => s + (r.cost_usd ?? 0), 0);
  } catch {
    return 0;
  }
}

/** All raw KPIs for one [from,to) window. activeSubs/mrr are point-in-time (now). */
async function rawFor(db: SupabaseClient, from: string, to: string, snapshot: { active: number; mrr: number }): Promise<KpiRaw> {
  const [signups, activated, newSubs, canceledSubs, supportTickets, contentPublished, scores, spend] = await Promise.all([
    countIn(db, 'profiles', 'created_at', from, to),
    activatedCount(db, from, to),
    countIn(db, 'subscription_events', 'created_at', from, to, ['event_type', 'subscribed']),
    countIn(db, 'subscription_events', 'created_at', from, to, ['event_type', 'canceled']),
    countIn(db, 'support_tickets', 'created_at', from, to),
    countIn(db, 'content_calendar', 'created_at', from, to, ['status', 'published']),
    csatScores(db, from, to),
    agentSpend(db, from, to),
  ]);
  return {
    signups,
    activated,
    activeSubs: snapshot.active,
    newSubs,
    canceledSubs,
    mrr: snapshot.mrr,
    supportTickets,
    csatScores: scores,
    contentPublished,
    agentSpend: spend,
  };
}

async function digestRecipients(db: SupabaseClient): Promise<string[]> {
  try {
    const { data } = await db.from('agent_system_settings').select('digest_emails').limit(1).maybeSingle();
    return Array.isArray(data?.digest_emails) ? data.digest_emails.filter(Boolean) : [];
  } catch {
    return [];
  }
}

const LABELS: Array<[keyof ReturnType<typeof buildKpiReport>, string]> = [
  ['signups', 'Signups'],
  ['activationRatePct', 'Activation rate (%)'],
  ['activeSubs', 'Active subscriptions'],
  ['netSubs', 'Net new subs'],
  ['mrr', 'MRR ($)'],
  ['supportTickets', 'Support tickets'],
  ['csatAvg', 'CSAT avg (1-5)'],
  ['contentPublished', 'Content published'],
  ['agentSpend', 'Agent spend ($)'],
];

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
  const to = now.toISOString();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS).toISOString();

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const snapshot = await activeSubsAndMrr(db);
      const [cur, prev] = await Promise.all([
        rawFor(db, weekAgo, to, snapshot),
        rawFor(db, twoWeeksAgo, weekAgo, snapshot),
      ]);
      const report = buildKpiReport(cur, prev);

      // Deterministic figures table for the email + the model prompt.
      const table = LABELS.map(([key, label]) => {
        const m = report[key] as Metric;
        return `| ${label} | ${m.current} | ${m.previous} | ${trendArrow(m)} |`;
      }).join('\n');
      const figures = `| Metric | This week | Last week | WoW |\n|---|---|---|---|\n${table}`;

      const narrative = await ctx.complete({
        messages: [
          {
            role: 'user',
            content:
              `Write the weekly KPI narrative for EatPal from THESE NUMBERS ONLY (do not invent figures):\n\n` +
              `${JSON.stringify(report, null, 2)}\n\n` +
              `4-6 sentences: what improved, what regressed, and one suggested focus for next week.`,
          },
        ],
        maxTokens: 500,
      });

      const weekOf = weekAgo.slice(0, 10);
      const subject = `EatPal weekly KPIs — week of ${weekOf}`;
      const body = `# EatPal Weekly KPIs\n_Week of ${weekOf}_\n\n${narrative.text}\n\n## Figures\n\n${figures}\n`;

      const recipients = await digestRecipients(db);
      for (const to of recipients) {
        await ctx.requestApproval({
          actionType: 'send_email',
          payload: {
            to,
            subject,
            body,
            html: body,
            template_key: 'weekly_kpi',
            kind: 'kpi_report',
            templated: true,
          } as unknown as Json,
          expiresInHours: 72,
        });
      }

      // Store the full report on the run output for the runs dashboard.
      return {
        week_of: weekOf,
        recipients: recipients.length,
        report,
        narrative: narrative.text,
        figures_markdown: figures,
      } as unknown as Json;
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
