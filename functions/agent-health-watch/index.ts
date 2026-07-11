/**
 * System health & cost anomaly agent (US-512).
 *
 * Every 15 min (dispatcher). Reads admin_system_health metrics (error_rate,
 * p95 latency) and agent_runs cost data, compares the current window against
 * trailing 7-day baselines, and escalates anomalies. Thresholds come from the
 * agent's autonomy_policy, never hardcoded.
 *
 * Alert-storm control: an anomaly that is already open is UPDATED in place — its
 * consecutive-check counter, evidence, and last_seen are refreshed instead of
 * filing a duplicate. A sustained error-rate anomaly (>= sustainChecks in a row)
 * upgrades the open escalation from tier-2 to tier-3. When a condition clears,
 * the open escalation is auto-resolved so the counter resets.
 *
 * POST /agent-health-watch  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  analyzeHealth,
  tierForAnomaly,
  resolveHealthThresholds,
  type HealthInput,
  type AnomalyType,
} from '../_shared/health-anomaly-logic.ts';

const AGENT_NAME = 'health-watch';
const DAY_MS = 86_400_000;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const TITLE: Record<AnomalyType, string> = {
  error_rate: 'Error-rate anomaly',
  latency_p95: 'Latency (p95) anomaly',
  spend: 'Agent spend anomaly',
};

/** Latest value + trailing history for one metric_type. */
async function readMetric(db: SupabaseClient, type: string, since: string): Promise<{ current: number | null; history: number[] }> {
  const { data } = await db
    .from('admin_system_health')
    .select('metric_value, recorded_at')
    .eq('metric_type', type)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: false });
  const rows = (data ?? []) as Array<{ metric_value: number }>;
  return { current: rows[0]?.metric_value ?? null, history: rows.map((r) => r.metric_value) };
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

  const now = new Date();
  const nowIso = now.toISOString();

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const thresholds = resolveHealthThresholds((def.autonomy_policy ?? {}) as Record<string, unknown>);
      const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();

      const err = await readMetric(db, 'error_rate', sevenDaysAgo);
      const lat = await readMetric(db, 'api_response_time_p95', sevenDaysAgo);

      // Daily agent spend: bucket the last 8 days of runs by UTC date.
      const eightDaysAgo = new Date(now.getTime() - 8 * DAY_MS).toISOString();
      const { data: runRows } = await db
        .from('agent_runs')
        .select('cost_usd, started_at')
        .gte('started_at', eightDaysAgo);
      const buckets = new Map<string, number>();
      for (const r of (runRows ?? []) as Array<{ cost_usd: number | null; started_at: string }>) {
        const day = r.started_at.slice(0, 10);
        buckets.set(day, (buckets.get(day) ?? 0) + (r.cost_usd ?? 0));
      }
      const todayKey = nowIso.slice(0, 10);
      const todaySpend = buckets.get(todayKey) ?? 0;
      const trailingDailySpends = [...buckets.entries()].filter(([d]) => d !== todayKey).map(([, v]) => v);

      const input: HealthInput = {
        // Compare the latest point against the trailing history that precedes it.
        currentErrorRate: err.current,
        baselineErrorRates: err.history.slice(1),
        currentLatencyP95: lat.current,
        todaySpend,
        trailingDailySpends,
      };

      const anomalies = analyzeHealth(input, thresholds);
      const firing = new Set(anomalies.map((a) => a.fingerprint));

      // Load this agent's currently-open health escalations for dedup + resolve.
      const { data: openRows } = await db
        .from('agent_escalations')
        .select('id, tier, context')
        .eq('agent_id', def.id)
        .eq('status', 'open');
      const openByFp = new Map<string, { id: string; tier: number; context: Record<string, unknown> }>();
      for (const r of (openRows ?? []) as Array<{ id: string; tier: number; context: Record<string, unknown> }>) {
        const fp = (r.context?.fingerprint as string) ?? '';
        if (fp) openByFp.set(fp, r);
      }

      let created = 0;
      let updated = 0;
      let resolved = 0;

      for (const a of anomalies) {
        const open = openByFp.get(a.fingerprint);
        const consecutive = (typeof open?.context.consecutive === 'number' ? open.context.consecutive : 0) + 1;
        const tier = tierForAnomaly(a.type, consecutive, thresholds);

        if (open) {
          await db
            .from('agent_escalations')
            .update({
              tier, // may upgrade 2 -> 3 on a sustained error-rate anomaly
              severity: tier === 3 ? 'critical' : 'high',
              context: {
                ...open.context,
                fingerprint: a.fingerprint,
                type: a.type,
                evidence: a.evidence,
                consecutive,
                last_seen: nowIso,
              } as Json,
            })
            .eq('id', open.id);
          updated++;
        } else {
          await ctx.escalate({
            tier,
            severity: tier === 3 ? 'critical' : 'high',
            domain: 'dev_maintenance',
            title: TITLE[a.type],
            context: {
              fingerprint: a.fingerprint,
              type: a.type,
              evidence: a.evidence,
              consecutive,
              first_seen: nowIso,
              last_seen: nowIso,
            } as unknown as Json,
          });
          created++;
        }
      }

      // Auto-resolve open health escalations whose condition has cleared, so the
      // consecutive counter resets and the queue reflects reality.
      for (const [fp, open] of openByFp) {
        if (!firing.has(fp)) {
          await db
            .from('agent_escalations')
            .update({
              status: 'resolved',
              resolution_note: 'auto-resolved: condition cleared',
              resolved_at: nowIso,
            })
            .eq('id', open.id);
          resolved++;
        }
      }

      return { anomalies: anomalies.length, created, updated, resolved };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
