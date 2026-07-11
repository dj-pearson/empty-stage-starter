/**
 * Auth anomaly detection agent (US-510).
 *
 * Every 15 min (dispatcher). Calls the agent_recent_auth_events RPC, runs the
 * pure detectors (credential stuffing, signup bursts, rapid geo-switching) with
 * thresholds pulled from the agent's autonomy_policy (never hardcoded), and
 * raises a tier-3 escalation carrying the evidence for each distinct incident.
 *
 * Detection ONLY — it never blocks sign-ins. Duplicate suppression: a still-open
 * tier-3 escalation with a matching fingerprint has its context refreshed
 * (evidence + occurrence count + last_seen) instead of spawning a new alert, so
 * an ongoing attack does not flood the queue.
 *
 * POST /agent-auth-anomaly  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  detectAll,
  resolveThresholds,
  type AuthEvent,
  type Detection,
} from '../_shared/auth-anomaly-logic.ts';

const AGENT_NAME = 'auth-anomaly';
const WINDOW_MINUTES = 15;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const SEVERITY: Record<Detection['type'], string> = {
  credential_stuffing: 'high',
  signup_burst: 'high',
  geo_switch: 'medium',
};

const TITLE: Record<Detection['type'], string> = {
  credential_stuffing: 'Possible credential-stuffing attack',
  signup_burst: 'Unusual signup burst',
  geo_switch: 'Rapid geo-switching on an account',
};

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

  const nowIso = new Date().toISOString();

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    input: { window_minutes: WINDOW_MINUTES } as Json,
    handler: async (ctx) => {
      const thresholds = resolveThresholds((def.autonomy_policy ?? {}) as Record<string, unknown>);

      // Pull recent auth events via the SECURITY DEFINER RPC (auth.* is not
      // directly reachable from PostgREST).
      const { data: rows, error } = await db.rpc('agent_recent_auth_events', { p_minutes: WINDOW_MINUTES });
      if (error) return { error: `auth event source unavailable: ${error.message}`, detections: 0 };

      const events = (rows ?? []) as AuthEvent[];
      const detections = detectAll(events, thresholds);
      if (detections.length === 0) {
        return { events: events.length, detections: 0 };
      }

      let created = 0;
      let refreshed = 0;
      for (const d of detections) {
        // Dedup: refresh an already-open tier-3 escalation for this fingerprint
        // rather than filing a duplicate for an ongoing incident.
        const { data: open } = await db
          .from('agent_escalations')
          .select('id, context')
          .eq('agent_id', def.id)
          .eq('status', 'open')
          .eq('tier', 3)
          .eq('context->>fingerprint', d.fingerprint)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (open) {
          const prev = (open.context ?? {}) as Record<string, unknown>;
          const occurrences = (typeof prev.occurrences === 'number' ? prev.occurrences : 1) + 1;
          await db
            .from('agent_escalations')
            .update({
              context: {
                ...prev,
                fingerprint: d.fingerprint,
                type: d.type,
                evidence: d.evidence,
                occurrences,
                last_seen: nowIso,
              } as Json,
            })
            .eq('id', open.id);
          refreshed++;
          continue;
        }

        await ctx.escalate({
          tier: 3,
          severity: SEVERITY[d.type],
          domain: 'dev_maintenance',
          title: TITLE[d.type],
          context: {
            fingerprint: d.fingerprint,
            type: d.type,
            evidence: d.evidence,
            occurrences: 1,
            first_seen: nowIso,
            last_seen: nowIso,
            note: 'Detection only — no sign-ins were blocked.',
          } as Json,
        });
        created++;
      }

      return { events: events.length, detections: detections.length, created, refreshed };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
