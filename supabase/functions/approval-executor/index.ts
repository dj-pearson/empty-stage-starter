/**
 * Agentic OS — Approval Executor (US-482)
 *
 * The single, audited place where approved agent actions produce external
 * side effects. Two modes:
 *   - POST {approvalId}: execute one 'approved' agent_approvals row by
 *     action_type (send_email | social_webhook | github_issue).
 *   - POST {sweep: true}: mark 'draft' rows past expires_at as 'expired'
 *     (invoked by the dispatcher each cycle).
 *
 * Idempotent: an 'executed' row is never re-executed; only 'approved' rows
 * execute. On failure the row stays 'approved', the error is recorded, and a
 * tier-2 escalation is raised once the retry budget (3) is exhausted.
 *
 * Auth (verify_jwt=false in config.toml): allow the service role or the
 * internal X-Cron-Secret (dispatcher/UI service calls), otherwise require a
 * valid admin JWT.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  canExecute,
  shouldEscalateAfterFailure,
  withExecSuccess,
  withExecFailure,
  type ActionType,
} from '../_shared/approval-exec.ts';
import { buildEscalationRow, buildAuditRow } from '../_shared/agent-approvals.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// --- Action handlers: each returns a small result object stored on the row ---

async function sendEmail(payload: Record<string, unknown>): Promise<{ messageId: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') ?? 'EatPal <noreply@tryeatpal.com>';
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  const to = payload.to;
  const subject = payload.subject;
  if (!to || !subject) throw new Error('send_email requires payload.to and payload.subject');

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject,
      html: payload.html ?? payload.body ?? '',
      text: payload.text ?? payload.body ?? '',
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Resend error: ${data.message ?? resp.status}`);
  return { messageId: data.id as string };
}

async function postSocial(payload: Record<string, unknown>): Promise<{ webhookStatus: number }> {
  const webhookUrl = Deno.env.get('SOCIAL_WEBHOOK_URL');
  if (!webhookUrl) throw new Error('SOCIAL_WEBHOOK_URL not configured');
  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'social_post_published',
      title: payload.title ?? '',
      instagram: payload.instagram ?? null,
      pinterest: payload.pinterest ?? null,
      short_form: payload.caption ?? payload.short_form ?? '',
      images: payload.images ?? (payload.imageUrl ? [payload.imageUrl] : []),
      url: payload.url ?? null,
      published_at: new Date().toISOString(),
    }),
  });
  if (!resp.ok) throw new Error(`Social webhook error ${resp.status}: ${await resp.text()}`);
  return { webhookStatus: resp.status };
}

async function createGithubIssue(payload: Record<string, unknown>): Promise<{ issueUrl: string }> {
  const token = Deno.env.get('GITHUB_TOKEN');
  const repo = (payload.repo as string) ?? Deno.env.get('GITHUB_REPO');
  if (!token) throw new Error('GITHUB_TOKEN not configured');
  if (!repo) throw new Error('github_issue requires payload.repo or GITHUB_REPO');
  if (!payload.title) throw new Error('github_issue requires payload.title');

  const resp = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'eatpal-agentic-os',
    },
    body: JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      labels: payload.labels ?? undefined,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`GitHub error: ${data.message ?? resp.status}`);
  return { issueUrl: data.html_url as string };
}

async function performAction(actionType: ActionType, payload: Record<string, unknown>): Promise<unknown> {
  switch (actionType) {
    case 'send_email':
      return await sendEmail(payload);
    case 'social_webhook':
      return await postSocial(payload);
    case 'github_issue':
      return await createGithubIssue(payload);
    default:
      throw new Error(`unknown action_type: ${actionType}`);
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET');

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // --- Auth: service role / cron secret, else a verified admin JWT ---------
  const authHeader = req.headers.get('Authorization') ?? '';
  const isServiceRole = serviceKey.length > 0 && authHeader.includes(serviceKey);
  const isCron = Boolean(cronSecret) && req.headers.get('X-Cron-Secret') === cronSecret;
  if (!isServiceRole && !isCron) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) return json({ error: 'Forbidden: admin role required' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // --- Sweep mode: expire stale drafts -----------------------------------
  if (body.sweep === true) {
    const nowIso = new Date().toISOString();
    const { data: expired, error } = await admin
      .from('agent_approvals')
      .update({ status: 'expired' })
      .eq('status', 'draft')
      .lt('expires_at', nowIso)
      .select('id');
    if (error) return json({ error: error.message }, 500);
    return json({ mode: 'sweep', expired: expired?.length ?? 0 });
  }

  // --- Execute mode ------------------------------------------------------
  const approvalId = body.approvalId;
  if (typeof approvalId !== 'string') return json({ error: 'approvalId is required' }, 400);

  const { data: approval, error: loadErr } = await admin
    .from('agent_approvals')
    .select('id, agent_id, run_id, action_type, payload, status')
    .eq('id', approvalId)
    .maybeSingle();
  if (loadErr) return json({ error: loadErr.message }, 500);
  if (!approval) return json({ error: 'approval not found' }, 404);

  const guard = canExecute(approval.status);
  if (!guard.ok) {
    if (guard.alreadyExecuted) return json({ approvalId, alreadyExecuted: true });
    return json({ error: guard.reason }, 409);
  }

  const payload = (approval.payload ?? {}) as Record<string, unknown>;
  const actorName = await agentName(admin, approval.agent_id as string | null);

  try {
    const result = await performAction(approval.action_type as ActionType, payload);
    const now = new Date();
    const nextPayload = withExecSuccess(payload, result, now);
    await admin
      .from('agent_approvals')
      .update({ status: 'executed', payload: nextPayload })
      .eq('id', approvalId);
    await admin.from('agent_audit_log').insert(
      buildAuditRow(
        {
          actor: actorName,
          action: 'approval.executed',
          subjectType: 'agent_approval',
          subjectId: approvalId,
          detail: { actionType: approval.action_type, result },
        },
        now,
      ),
    );
    return json({ approvalId, status: 'executed', result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date();
    const { payload: failedPayload, attempts } = withExecFailure(payload, message);
    // Row stays 'approved' so it can be retried.
    await admin.from('agent_approvals').update({ payload: failedPayload }).eq('id', approvalId);
    await admin.from('agent_audit_log').insert(
      buildAuditRow(
        {
          actor: actorName,
          action: 'approval.execution_failed',
          subjectType: 'agent_approval',
          subjectId: approvalId,
          detail: { actionType: approval.action_type, error: message, attempts },
        },
        now,
      ),
    );
    if (shouldEscalateAfterFailure(attempts)) {
      await admin.from('agent_escalations').insert(
        buildEscalationRow(
          {
            runId: (approval.run_id as string | null) ?? null,
            agentId: (approval.agent_id as string | null) ?? null,
            tier: 2,
            severity: 'high',
            domain: 'agent_ops',
            title: `Approval execution failed ${attempts}x: ${approval.action_type}`,
            context: { approvalId, error: message, attempts },
          },
          now,
        ),
      );
    }
    return json({ approvalId, status: 'approved', error: message, attempts }, 502);
  }
};

/** Resolve an agent's name for the audit actor, falling back gracefully. */
async function agentName(
  admin: ReturnType<typeof createClient>,
  agentId: string | null,
): Promise<string> {
  if (!agentId) return 'approval-executor';
  const { data } = await admin
    .from('agent_definitions')
    .select('name')
    .eq('id', agentId)
    .maybeSingle();
  return (data?.name as string | undefined) ?? 'approval-executor';
}
