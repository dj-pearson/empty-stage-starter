/**
 * CI failure triage agent (US-508).
 *
 * Event-driven: receives a GitHub Actions `workflow_run` (failure) webhook
 * (shared-secret validated). Fetches the failed job log excerpt, has Claude
 * classify flake vs real failure, and either drafts a PR-comment (real failure)
 * or records the flake on the run output. Repeated identical failures within 24h
 * escalate tier-2 instead of drafting duplicates.
 *
 * POST /agent-ci-triage   (GitHub workflow_run webhook JSON)
 * Auth: verify_jwt=false; shared secret via x-ci-secret header.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  parseWorkflowRun,
  classificationToAction,
  failureFingerprint,
  logExcerpt,
  type CiClassification,
} from '../_shared/ci-triage-logic.ts';

const AGENT_NAME = 'ci-triage';

const ClassificationSchema = z.object({
  is_flake: z.boolean(),
  failing_step: z.string(),
  likely_cause: z.string(),
  suggested_fix: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

async function githubGet(path: string, token: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'eatpal-ci-triage',
    },
  });
}

/** Fetch a bounded excerpt of the first failed job's log. */
async function failedJobLog(repo: string, runId: number, token: string): Promise<string> {
  try {
    const jobsRes = await githubGet(`/repos/${repo}/actions/runs/${runId}/jobs`, token);
    if (!jobsRes.ok) return '';
    const jobs = (await jobsRes.json()) as { jobs?: Array<{ id: number; conclusion: string }> };
    const failed = (jobs.jobs ?? []).find((j) => j.conclusion === 'failure');
    if (!failed) return '';
    const logRes = await githubGet(`/repos/${repo}/actions/jobs/${failed.id}/logs`, token);
    if (!logRes.ok) return '';
    return logExcerpt(await logRes.text());
  } catch {
    return '';
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('CI_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-ci-secret') !== secret) return json({ error: 'Unauthorized' }, 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const info = parseWorkflowRun(body);
  if (info.conclusion !== 'failure') return json({ skipped: 'not a failure' }, 200);
  if (!info.repo || !info.runId) return json({ skipped: 'missing repo/run' }, 200);
  if (!info.prNumber) return json({ skipped: 'no associated PR' }, 200);

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

  const token = Deno.env.get('GITHUB_TOKEN') ?? '';

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'ci_webhook',
    input: { repo: info.repo, runId: info.runId, pr: info.prNumber } as Json,
    handler: async (ctx) => {
      const log = token ? await failedJobLog(info.repo!, info.runId!, token) : '';

      const classification = await ctx.structuredOutput<CiClassification>({
        schema: ClassificationSchema,
        prompt:
          `Classify this failed CI run for workflow "${info.workflow}" on PR #${info.prNumber}.\n` +
          `Failed job log excerpt:\n${log || '(log unavailable)'}\n\n` +
          `Return JSON: is_flake (true if a transient/infra/timeout flake), failing_step, ` +
          `likely_cause, suggested_fix, confidence (low|medium|high).`,
      });

      if (classificationToAction(classification) === 'record') {
        return { action: 'flake', failing_step: classification.failing_step };
      }

      const fp = failureFingerprint({ workflow: info.workflow, prNumber: info.prNumber, failingStep: classification.failing_step });

      // Repeated identical failure within 24h -> escalate instead of a duplicate draft.
      const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const { count } = await db
        .from('agent_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('action_type', 'pr_comment')
        .eq('payload->>ci_fingerprint', fp)
        .gte('created_at', since);

      if ((count ?? 0) > 0) {
        await ctx.escalate({
          tier: 2,
          severity: 'medium',
          domain: 'dev_maintenance',
          title: `Repeated CI failure on PR #${info.prNumber}: ${classification.failing_step}`,
          context: { repo: info.repo, pr: info.prNumber, ci_fingerprint: fp, classification } as unknown as Json,
        });
        return { action: 'escalated', reason: 'repeated failure' };
      }

      const comment =
        `**CI triage — likely a real failure** (${classification.confidence} confidence)\n\n` +
        `**Failing step:** ${classification.failing_step}\n` +
        `**Likely cause:** ${classification.likely_cause}\n` +
        `**Suggested fix:** ${classification.suggested_fix}`;

      await ctx.requestApproval({
        actionType: 'pr_comment',
        payload: {
          repo: info.repo,
          pr_number: info.prNumber,
          body: comment,
          ci_fingerprint: fp,
        } as unknown as Json,
        expiresInHours: 72,
      });
      return { action: 'drafted', failing_step: classification.failing_step };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
