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
import { withTicketToken, canTransition } from '../_shared/support-status-logic.ts';
import {
  parseRepoAllowlist,
  isAllowedRepo,
  isValidEmailRecipient,
} from '../_shared/outward-payload-validation.ts';

/** Repo allowlist for GitHub writes (GITHUB_ALLOWED_REPOS csv, falling back to GITHUB_REPO). */
function githubRepoAllowlist(): string[] {
  return parseRepoAllowlist(
    Deno.env.get('GITHUB_ALLOWED_REPOS') ?? Deno.env.get('GITHUB_REPO') ?? '',
  );
}
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
  let subject = payload.subject as string | undefined;
  const html = (payload.html ?? payload.body) as string | undefined;
  if (!to || !subject || !html) {
    throw new Error('send_email payload requires to, subject, and html/body');
  }
  // Defense-in-depth (US-522): reject malformed / header-injected recipients.
  if (!isValidEmailRecipient(to)) {
    throw new Error('send_email payload.to is not a valid email recipient');
  }

  // Support replies embed a subject token so inbound replies match the ticket.
  if (typeof payload.ticket_id === 'string') {
    subject = withTicketToken(subject, payload.ticket_id);
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
  // Allowlist the target repo (US-522): a payload-supplied repo must be owned.
  if (!isAllowedRepo(repo, githubRepoAllowlist())) {
    throw new Error(`github_issue repo not allowlisted: ${repo}`);
  }

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

/**
 * content_topic: an internal (no external side effect) action — approving a
 * proposed content topic just advances its content_calendar row to 'approved'
 * (US-502), gating any downstream generation spend.
 */
async function executeContentTopic(payload: Record<string, unknown>): Promise<unknown> {
  const calendarId = payload.calendar_id;
  if (typeof calendarId !== 'string') throw new Error('content_topic requires calendar_id');
  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
  const { error } = await db.from('content_calendar').update({ status: 'approved' }).eq('id', calendarId);
  if (error) throw new Error(`content_topic approve failed: ${error.message}`);
  return { calendar_id: calendarId, status: 'approved' };
}

/**
 * blog_post: publish an approved blog draft (US-503) through the blog_posts
 * table (the BlogPost page renders JSON-LD via ArticleSchema), and advance the
 * source content_calendar row to 'published'.
 */
async function executeBlogPost(payload: Record<string, unknown>): Promise<unknown> {
  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
  const title = payload.title as string | undefined;
  const slug = payload.slug as string | undefined;
  const body = payload.body as string | undefined;
  if (!title || !slug || !body) throw new Error('blog_post requires title, slug, body');

  const hero = (payload.hero_image_url as string) ?? null;
  const { data: post, error } = await db
    .from('blog_posts')
    .insert({
      title,
      slug,
      content: body,
      excerpt: (payload.excerpt as string) ?? null,
      meta_description: (payload.meta_description as string) ?? null,
      featured_image_url: hero,
      og_image_url: hero,
      reading_time_minutes: (payload.reading_time_minutes as number) ?? null,
      status: 'published',
      published_at: new Date().toISOString(),
      ai_generated: true,
    })
    .select('id, slug')
    .single();
  if (error || !post) throw new Error(`blog publish failed: ${error?.message ?? 'unknown'}`);

  if (typeof payload.calendar_id === 'string') {
    await db.from('content_calendar').update({ status: 'published' }).eq('id', payload.calendar_id);
  }
  return { post_id: post.id, slug: post.slug, url: `https://tryeatpal.com/blog/${post.slug}` };
}

/** pr_comment: post a comment to a pull request via the GitHub REST API (US-508). */
async function executePrComment(payload: Record<string, unknown>): Promise<unknown> {
  const token = Deno.env.get('GITHUB_TOKEN');
  const repo = payload.repo as string | undefined;
  const prNumber = payload.pr_number;
  const body = payload.body as string | undefined;
  if (!token) throw new Error('GITHUB_TOKEN is not configured');
  if (!repo || typeof prNumber !== 'number' || !body) {
    throw new Error('pr_comment requires repo, pr_number, body');
  }
  // Allowlist the target repo (US-522): a payload-supplied repo must be owned.
  if (!isAllowedRepo(repo, githubRepoAllowlist())) {
    throw new Error(`pr_comment repo not allowlisted: ${repo}`);
  }
  const res = await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'eatpal-agentic-os',
    },
    body: JSON.stringify({ body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return { comment_url: (data as { html_url?: string }).html_url ?? null };
}

const EXECUTORS: Record<string, (p: Record<string, unknown>) => Promise<unknown>> = {
  send_email: executeSendEmail,
  social_webhook: executeSocialWebhook,
  github_issue: executeGithubIssue,
  content_topic: executeContentTopic,
  blog_post: executeBlogPost,
  pr_comment: executePrComment,
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

      const ticketId = (payload as Record<string, unknown>).ticket_id;

      // Write a github_issue URL back to its source support ticket as an
      // internal note (US-493), so the ticket thread links to the filed issue.
      const issueUrl = (result as { issue_url?: string } | null)?.issue_url;
      if (approval.action_type === 'github_issue' && typeof ticketId === 'string' && issueUrl) {
        await db.from('support_messages').insert({
          ticket_id: ticketId,
          sender: 'agent',
          body: `Bug filed as a GitHub issue: ${issueUrl}`,
          metadata: { internal: true, kind: 'bug_issue', issue_url: issueUrl },
        });
      }

      // Social post published (US-504): advance its source calendar row.
      if (approval.action_type === 'social_webhook' && typeof (payload as Record<string, unknown>).calendar_id === 'string') {
        await db
          .from('content_calendar')
          .update({ status: 'published' })
          .eq('id', (payload as Record<string, unknown>).calendar_id as string);
      }

      // Support reply sent (US-494): append the agent message to the thread and
      // move the ticket to 'awaiting_user' (guarded transition).
      if (approval.action_type === 'send_email' && typeof ticketId === 'string') {
        const replyBody = ((payload as Record<string, unknown>).body ??
          (payload as Record<string, unknown>).html) as string | undefined;
        await db.from('support_messages').insert({
          ticket_id: ticketId,
          sender: 'agent',
          body: replyBody ?? '(reply sent)',
          metadata: { kind: 'reply', approval_id: approval.id },
        });
        const { data: t } = await db
          .from('support_tickets')
          .select('status')
          .eq('id', ticketId)
          .maybeSingle();
        if (t && canTransition(t.status, 'awaiting_user')) {
          await db.from('support_tickets').update({ status: 'awaiting_user' }).eq('id', ticketId);
        }
      }

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
