/**
 * Sentry error triage agent (US-506).
 *
 * Event-driven: receives a Sentry webhook (shared-secret validated). Dedupes by
 * fingerprint (a matching open github_issue draft is counted, not re-drafted),
 * has Claude (haiku) assess severity + user impact, and either drafts a
 * github_issue approval (normal error) or files a tier-3 escalation (crash-rate
 * spike above the configured threshold).
 *
 * POST /agent-sentry-triage   (Sentry webhook JSON)
 * Auth: verify_jwt=false; shared secret via x-sentry-secret header.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  sentryFingerprint,
  isCrashRateSpike,
  crashSpikeThreshold,
  buildIssueTitle,
  buildIssueBody,
  type SentryEvent,
  type Assessment,
} from '../_shared/sentry-triage-logic.ts';

const AGENT_NAME = 'sentry-triage';

const AssessmentSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  user_impact: z.string(),
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/** Normalize a (varied) Sentry webhook body into our event shape. */
function parseSentryEvent(body: Record<string, unknown>): SentryEvent {
  // Support {data:{event}}, {data:{issue}}, {event}, or a bare event.
  const data = (body.data ?? {}) as Record<string, unknown>;
  const e = (data.event ?? data.issue ?? body.event ?? body) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) || null : null);
  return {
    fingerprint: Array.isArray(e.fingerprint) ? (e.fingerprint as string[]) : null,
    title: (e.title as string) ?? (e.metadata as { title?: string })?.title ?? null,
    culprit: (e.culprit as string) ?? null,
    release: (e.release as string) ?? (data.release as string) ?? null,
    route: (e.transaction as string) ?? (e.culprit as string) ?? null,
    count: num(e.count) ?? num((e as { timesSeen?: unknown }).timesSeen),
    level: (e.level as string) ?? null,
    stack:
      typeof e.message === 'string'
        ? e.message
        : JSON.stringify(e.exception ?? e.entries ?? e.metadata ?? {}).slice(0, 4000),
  };
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('SENTRY_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-sentry-secret') !== secret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const event = parseSentryEvent(body);
  const fp = sentryFingerprint(event);

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

  // Dedup: an already-open github_issue draft for this fingerprint is counted,
  // not re-drafted (AC2).
  const { data: existing } = await db
    .from('agent_approvals')
    .select('id, payload')
    .eq('action_type', 'github_issue')
    .in('status', ['draft', 'approved', 'executed'])
    .eq('payload->>sentry_fingerprint', fp)
    .limit(1)
    .maybeSingle();
  if (existing) {
    const payload = (existing.payload ?? {}) as Record<string, unknown>;
    const occurrences = (typeof payload.occurrences === 'number' ? payload.occurrences : 1) + 1;
    await db.from('agent_approvals').update({ payload: { ...payload, occurrences } }).eq('id', existing.id);
    return json({ deduped: true, approval_id: existing.id, occurrences }, 200);
  }

  const threshold = crashSpikeThreshold((def as AgentDefinition).autonomy_policy as Record<string, unknown>);

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'sentry_webhook',
    input: { fingerprint: fp } as Json,
    handler: async (ctx) => {
      const assessment = await ctx.structuredOutput<Assessment>({
        schema: AssessmentSchema,
        prompt:
          `Assess this production error for EatPal.\n` +
          `Title: ${event.title ?? event.culprit}\nRelease: ${event.release}\n` +
          `Route: ${event.route}\nOccurrences: ${event.count ?? 1}\nLevel: ${event.level}\n` +
          `Return JSON: severity (low|medium|high|critical), user_impact (one sentence).`,
      });

      if (isCrashRateSpike(event.count, threshold)) {
        await ctx.escalate({
          tier: 3,
          severity: 'critical',
          domain: 'dev_maintenance',
          title: `Crash-rate spike: ${event.title ?? event.culprit}`,
          context: {
            sentry_fingerprint: fp,
            count: event.count,
            threshold,
            release: event.release,
            route: event.route,
            assessment,
          } as unknown as Json,
        });
        return { action: 'escalated', spike: true, count: event.count };
      }

      await ctx.requestApproval({
        actionType: 'github_issue',
        payload: {
          title: buildIssueTitle(event),
          body: buildIssueBody(event, assessment),
          labels: ['bug', 'sentry', assessment.severity],
          sentry_fingerprint: fp,
          occurrences: event.count ?? 1,
        } as unknown as Json,
        expiresInHours: 336,
      });
      return { action: 'drafted', severity: assessment.severity };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
