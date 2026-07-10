/**
 * Approval execution engine (US-482).
 *
 * The single place external side effects happen. Given an approved
 * agent_approvals id, it executes by action_type and finalizes the row:
 *   - 'send_email'    -> Resend
 *   - 'social_webhook'-> the configured Instagram/Pinterest webhook URL
 *   - 'github_issue'  -> GitHub REST API (GITHUB_TOKEN)
 *
 * POST /approval-executor
 *   { "approval_id": "uuid" }   -> execute one approval
 *   { "sweep": true }           -> mark expired drafts (dispatcher calls this)
 *
 * Auth (verify_jwt=false; gated inside): the internal dispatch secret
 * (x-agent-dispatch-secret) OR an admin JWT. The approval queue UI (US-484)
 * calls it with an admin JWT; the dispatcher calls the sweep with the secret.
 *
 * Guarantees:
 *   - Idempotent: a row already 'executed' is not re-executed; only 'approved'
 *     rows run (draft->approved->executed enforced via decideExecution).
 *   - Every execution writes an agent_audit_log entry with the result
 *     (message id / post ref / issue URL) and stores it on payload._execution.
 *   - A failed execution keeps status 'approved', records the error, and files a
 *     tier-2 escalation after 3 failed attempts.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { isAdmin } from '../_shared/admin.ts';
import { validateExternalUrl, fetchWithTimeout } from '../_shared/url-validator.ts';
import { buildEscalation } from '../_shared/agent-approval-logic.ts';
import {
  decideExecution,
  payloadWithSuccess,
  payloadWithFailure,
  shouldEscalateFailure,
} from '../_shared/approval-execution-logic.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });

// ---------------------------------------------------------------------------
// Action executors — each performs one external side effect and returns a
// compact, auditable result. They throw on failure with a concise message.
// ---------------------------------------------------------------------------

async function executeSendEmail(payload: Record<string, unknown>): Promise<unknown> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const to = payload.to;
  const subject = payload.subject;
  const html = (payload.html ?? payload.body) as string | undefined;
  if (!to || !subject || !html) {
    throw new Error('send_email payload requires to, subject, and html/body');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: (payload.from as string) ?? Deno.env.get('EMAIL_FROM') ?? 'noreply@tryeatpal.com',
      to,
      subject,
      html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return { message_id: (data as { id?: string }).id ?? null };
}

async function executeSocialWebhook(payload: Record<string, unknown>): Promise<unknown> {
  const webhookUrl = Deno.env.get('SOCIAL_WEBHOOK_URL');
  if (!webhookUrl) throw new Error('SOCIAL_WEBHOOK_URL is not configured');

  // SSRF guard: the destination must be a public URL (US-505 reuses this too).
  const check = await validateExternalUrl(webhookUrl);
  if (!check.valid) throw new Error(`SOCIAL_WEBHOOK_URL rejected: ${check.error}`);

  const res = await fetchWithTimeout(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = (await res.text()).slice(0, 300);
  if (!res.ok) throw new Error(`social webhook ${res.status}: ${text}`);
  return { posted: true, webhook_status: res.status, webhook_response: text };
}

async function executeGithubIssue(payload: Record<string, unknown>): Promise<unknown> {
  const token = Deno.env.get('GITHUB_TOKEN');
  const repo = (payload.repo as string) ?? Deno.env.get('GITHUB_REPO'); // "owner/name"
  if (!token) throw new Error('GITHUB_TOKEN is not configured');
  if (!repo) throw new Error('github_issue requires a repo (payload.repo or GITHUB_REPO)');

  const title = payload.title;
  if (!title) throw new Error('github_issue payload requires a title');

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'eatpal-agentic-os',
    },
    body: JSON.stringify({
      title,
      body: (payload.body as string) ?? '',
      labels: Array.isArray(payload.labels) ? payload.labels : undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const issue = data as { html_url?: string; number?: number };
  return { issue_url: issue.html_url ?? null, issue_number: issue.number ?? null };
}

const EXECUTORS: Record<string, (p: Record<string, unknown>) => Promise<unknown>> = {
  send_email: executeSendEmail,
  social_webhook: executeSocialWebhook,
  github_issue: executeGithubIssue,
};

// ---------------------------------------------------------------------------
// Auth: internal dispatch secret OR admin JWT.
// ---------------------------------------------------------------------------

async function authorize(
  req: Request,
  supabaseAnon: () => SupabaseClient,
): Promise<{ ok: true } | { ok: false; res: Response }> {
  const cors = getCorsHeaders(req);
  const secret = Deno.env.get('AGENT_DISPATCH_SECRET');
  if (secret && req.headers.get('x-agent-dispatch-secret') === secret) {
    return { ok: true };
  }
  const auth = await authenticateRequest(req);
  if (auth.error) return { ok: false, res: auth.error };
  const admin = await isAdmin(supabaseAnon(), auth.user.id);
  if (!admin) {
    return { ok: false, res: json({ error: 'Forbidden: admin role required' }, 403, cors) };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handleCorsPreFlight(req);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const anonClient = () =>
    createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

  const authz = await authorize(req, anonClient);
  if (!authz.ok) return authz.res;

  // Service role for all DB writes (approvals table is admin-RLS; the executor
  // must update rows and insert audit/escalation entries regardless of caller).
  const db: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const body = await req.json().catch(() => ({}));

  try {
    // --- Expiry sweep (dispatcher calls this each cycle) --------------------
    if (body?.sweep === true) {
      const nowIso = new Date().toISOString();
      const { data: expired } = await db
        .from('agent_approvals')
        .update({ status: 'expired' })
        .eq('status', 'draft')
        .lt('expires_at', nowIso)
        .not('expires_at', 'is', null)
        .select('id');
      const count = expired?.length ?? 0;
      if (count > 0) {
        await db.from('agent_audit_log').insert({
          actor: 'approval-executor',
          action: 'approvals_expired',
          subject_type: 'agent_approval',
          detail: { count, swept_at: nowIso },
        });
      }
      return json({ swept: count }, 200, cors);
    }

    // --- Execute one approval ----------------------------------------------
    const approvalId = body?.approval_id;
    if (!approvalId || typeof approvalId !== 'string') {
      return json({ error: 'approval_id is required' }, 400, cors);
    }

    const { data: approval, error: loadErr } = await db
      .from('agent_approvals')
      .select('id, agent_id, run_id, action_type, payload, status')
      .eq('id', approvalId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!approval) return json({ error: 'approval not found' }, 404, cors);

    const decision = decideExecution(approval.status);
    if (decision.action === 'skip') {
      // Idempotent: already executed.
      return json({ status: 'executed', idempotent: true }, 200, cors);
    }
    if (decision.action === 'reject') {
      return json({ error: `cannot execute: ${decision.reason}` }, 409, cors);
    }

    const executor = EXECUTORS[approval.action_type];
    if (!executor) {
      return json({ error: `no executor for action_type '${approval.action_type}'` }, 400, cors);
    }

    const payload = (approval.payload ?? {}) as Record<string, unknown>;

    try {
      const result = await executor(payload);
      const newPayload = payloadWithSuccess(payload, result, new Date());
      await db
        .from('agent_approvals')
        .update({ status: 'executed', payload: newPayload })
        .eq('id', approval.id);
      await db.from('agent_audit_log').insert({
        actor: 'approval-executor',
        action: 'action_executed',
        subject_type: 'agent_approval',
        subject_id: approval.id,
        detail: { action_type: approval.action_type, result },
      });
      return json({ status: 'executed', result }, 200, cors);
    } catch (execErr) {
      const message = execErr instanceof Error ? execErr.message : String(execErr);
      const { payload: failedPayload, attempts } = payloadWithFailure(payload, message);
      // Keep status 'approved' so it can be retried; record the error.
      await db
        .from('agent_approvals')
        .update({ payload: failedPayload })
        .eq('id', approval.id);
      await db.from('agent_audit_log').insert({
        actor: 'approval-executor',
        action: 'action_execution_failed',
        subject_type: 'agent_approval',
        subject_id: approval.id,
        detail: { action_type: approval.action_type, error: message, attempts },
      });

      // Escalate after 3 failed attempts (idempotent-ish: only on the trip).
      if (shouldEscalateFailure(attempts)) {
        const { escalation, audit } = buildEscalation(
          {
            agentId: approval.agent_id,
            agentName: 'approval-executor',
            runId: approval.run_id,
            tier: 2,
            severity: 'high',
            domain: 'execution',
            title: `Approval execution failing: ${approval.action_type}`,
            context: { approval_id: approval.id, attempts, last_error: message },
          },
          new Date(),
        );
        const { data: escRow } = await db
          .from('agent_escalations')
          .insert(escalation)
          .select('id')
          .single();
        if (escRow) await db.from('agent_audit_log').insert({ ...audit, subject_id: escRow.id });
      }

      return json({ status: 'failed', error: message, attempts }, 502, cors);
    }
  } catch (err) {
    console.error('approval-executor error:', err);
    return json({ error: 'Internal server error' }, 500, cors);
  }
});
