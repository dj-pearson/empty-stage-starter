/**
 * Migration safety checker agent (US-509).
 *
 * Event-driven: a PR webhook touching supabase/migrations/ triggers this. It
 * fetches the PR's changed migration files, runs the deterministic
 * backward-compatibility linter, and has Claude judge the flagged statements in
 * context (dropping false positives, writing the explanation). Violations
 * produce a PR-comment draft AND a tier-2 escalation; clean migrations record a
 * passing run only.
 *
 * POST /agent-migration-check   (GitHub pull_request webhook JSON)
 * Auth: verify_jwt=false; GitHub HMAC over the raw body (x-hub-signature-256).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import { verifyGithubSignature } from '../_shared/webhook-signatures.ts';
import { lintMigrationSql, hasViolations, type LintViolation } from '../_shared/migration-lint.ts';

const AGENT_NAME = 'migration-check';
const MIGRATION_PREFIX = 'supabase/migrations/';

const ReviewSchema = z.object({
  confirmed: z.array(z.object({ rule: z.string(), file: z.string(), explanation: z.string() })),
  comment: z.string(),
});
interface Review {
  confirmed: Array<{ rule: string; file: string; explanation: string }>;
  comment: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

async function githubGet(path: string, token: string, accept = 'application/vnd.github+json'): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': 'eatpal-migration-check' },
  });
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('MIGRATION_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'Webhook not configured' }, 503);

  // Verify the GitHub HMAC (X-Hub-Signature-256) over the RAW body (US-520).
  const rawBody = await req.text();
  const validSig = await verifyGithubSignature(
    rawBody,
    req.headers.get('x-hub-signature-256'),
    secret,
  );
  if (!validSig) return json({ error: 'Unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const repo = (body.repository as { full_name?: string })?.full_name ?? null;
  const pr = (body.pull_request as { number?: number })?.number ?? null;
  if (!repo || !pr) return json({ skipped: 'missing repo/pr' }, 200);

  const token = Deno.env.get('GITHUB_TOKEN');
  if (!token) return json({ error: 'GITHUB_TOKEN is not configured' }, 503);

  // List changed files; only added/modified migration files matter.
  const filesRes = await githubGet(`/repos/${repo}/pulls/${pr}/files?per_page=100`, token);
  if (!filesRes.ok) return json({ error: 'could not list PR files' }, 502);
  const files = (await filesRes.json()) as Array<{ filename: string; status: string; raw_url?: string; contents_url?: string }>;
  const migrationFiles = files.filter(
    (f) => f.filename.startsWith(MIGRATION_PREFIX) && f.status !== 'removed' && f.filename.endsWith('.sql'),
  );
  if (migrationFiles.length === 0) return json({ skipped: 'no migration files changed' }, 200);

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

  // Lint each migration file (deterministic, before any model spend).
  const flagged: Array<{ file: string; violations: LintViolation[]; sql: string }> = [];
  for (const f of migrationFiles) {
    if (!f.raw_url) continue;
    // Only attach the GITHUB_TOKEN when raw_url is actually a GitHub host, so a
    // tampered API response can't exfiltrate the token to a third party (US-532).
    let rawHost = '';
    try {
      rawHost = new URL(f.raw_url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (rawHost !== 'raw.githubusercontent.com' && rawHost !== 'github.com') {
      console.warn(`migration-check: skipping non-GitHub raw_url host ${rawHost}`);
      continue;
    }
    const sql = await (await fetch(f.raw_url, { headers: { Authorization: `Bearer ${token}` } })).text().catch(() => '');
    const violations = lintMigrationSql(sql);
    if (hasViolations(violations)) flagged.push({ file: f.filename, violations, sql });
  }

  if (flagged.length === 0) {
    return json({ status: 'passed', files: migrationFiles.length, violations: 0 }, 200);
  }

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'pr_webhook',
    input: { repo, pr, flagged_files: flagged.map((f) => f.file) } as Json,
    handler: async (ctx) => {
      // Claude judges the flagged statements in context to drop false positives.
      const review = await ctx.structuredOutput<Review>({
        schema: ReviewSchema,
        prompt:
          `Review these flagged Supabase migration statements against EatPal's backward-compatibility ` +
          `rules (the DB is shared by shipped iOS versions; additive-only; a CHECK WIDENING is SAFE, a ` +
          `tightening is not). Drop false positives.\n\n` +
          flagged
            .map((f) => `FILE ${f.file}\nFlags: ${JSON.stringify(f.violations.map((v) => v.rule))}\nSQL:\n${f.sql.slice(0, 4000)}`)
            .join('\n\n---\n\n') +
          `\n\nReturn JSON: confirmed [{rule, file, explanation}] (real violations only), ` +
          `comment (a concise PR review comment; empty string if nothing is confirmed).`,
      });

      if (review.confirmed.length === 0) {
        return { status: 'cleared_by_review', flagged: flagged.length };
      }

      const comment =
        `⚠️ **Migration safety check** flagged ${review.confirmed.length} backward-compatibility issue(s):\n\n` +
        review.confirmed.map((c) => `- **${c.rule}** (\`${c.file}\`): ${c.explanation}`).join('\n') +
        `\n\nSee the Migration Rules in CLAUDE.md. Additive-only changes are safe.`;

      await ctx.requestApproval({
        actionType: 'pr_comment',
        payload: { repo, pr_number: pr, body: comment } as unknown as Json,
        expiresInHours: 72,
      });
      await ctx.escalate({
        tier: 2,
        severity: 'high',
        domain: 'dev_maintenance',
        title: `Backward-incompatible migration in PR #${pr}`,
        context: { repo, pr, confirmed: review.confirmed } as unknown as Json,
      });
      return { status: 'violations', confirmed: review.confirmed.length };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
