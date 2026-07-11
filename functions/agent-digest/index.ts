/**
 * Agent digest edge function (US-488).
 *
 * Two modes:
 *   - 'instant': fired by a DB trigger when a tier-3 escalation is inserted;
 *     emails digest recipients immediately with the escalation summary + a deep
 *     link to the Command Center.
 *   - 'daily': fired by pg_cron once a day; emails a summary of open tier-2
 *     escalations, pending approvals by action_type, yesterday's agent spend,
 *     and the failed-run count. Sends nothing when there is nothing to report.
 *
 * POST /agent-digest  { "mode": "daily" }
 *                     { "mode": "instant", "escalation_id": "uuid" }
 *
 * Auth: verify_jwt=false; gated by the internal AGENT_DISPATCH_SECRET header
 * (the same secret the dispatcher uses), since only pg_cron / DB triggers call
 * it. Recipients + all sends are recorded in agent_audit_log.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildInstantEmail,
  buildDailyDigest,
  groupApprovalsByActionType,
  dailyHasContent,
  yesterdayUtcWindow,
  type DailyStats,
  type EmailBody,
} from '../_shared/agent-digest-logic.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function appBaseUrl(): string {
  return Deno.env.get('APP_BASE_URL') ?? 'https://tryeatpal.com';
}

/** Send an email to every recipient via Resend. Returns the provider message ids. */
async function sendEmail(recipients: string[], body: EmailBody): Promise<string[]> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const from = Deno.env.get('EMAIL_FROM') ?? 'noreply@tryeatpal.com';

  const ids: string[] = [];
  for (const to of recipients) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: body.subject, html: body.html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
    ids.push((data as { id?: string }).id ?? '');
  }
  return ids;
}

async function digestRecipients(db: SupabaseClient): Promise<string[]> {
  const { data } = await db
    .from('agent_system_settings')
    .select('digest_emails')
    .limit(1)
    .maybeSingle();
  return Array.isArray(data?.digest_emails) ? data.digest_emails.filter(Boolean) : [];
}

async function audit(db: SupabaseClient, action: string, detail: unknown): Promise<void> {
  await db.from('agent_audit_log').insert({
    actor: 'agent-digest',
    action,
    subject_type: 'agent_digest',
    detail: detail ?? {},
  });
}

serve(async (req) => {
  const expected = Deno.env.get('AGENT_DISPATCH_SECRET');
  if (!expected || req.headers.get('x-agent-dispatch-secret') !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const db: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode;

  try {
    if (mode === 'instant') {
      const escalationId = body?.escalation_id;
      if (!escalationId) return json({ error: 'escalation_id is required' }, 400);

      const { data: esc } = await db
        .from('agent_escalations')
        .select('title, severity, domain, tier')
        .eq('id', escalationId)
        .maybeSingle();
      if (!esc) return json({ error: 'escalation not found' }, 404);
      if (esc.tier !== 3) return json({ skipped: 'not tier-3' }, 200);

      const recipients = await digestRecipients(db);
      if (recipients.length === 0) {
        await audit(db, 'digest_skipped', { mode: 'instant', reason: 'no recipients', escalationId });
        return json({ skipped: 'no recipients' }, 200);
      }

      const email = buildInstantEmail(esc, appBaseUrl());
      const ids = await sendEmail(recipients, email);
      await audit(db, 'digest_sent', { mode: 'instant', escalationId, recipients: recipients.length, ids });
      return json({ sent: recipients.length }, 200);
    }

    if (mode === 'daily') {
      const { start, end } = yesterdayUtcWindow(new Date());

      const [tier2, approvals, yRuns] = await Promise.all([
        db
          .from('agent_escalations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open')
          .eq('tier', 2),
        db.from('agent_approvals').select('action_type').eq('status', 'draft'),
        db.from('agent_runs').select('cost_usd, status').gte('started_at', start).lt('started_at', end),
      ]);

      const runs = (yRuns.data ?? []) as Array<{ cost_usd: number | null; status: string }>;
      const stats: DailyStats = {
        openTier2: tier2.count ?? 0,
        pendingApprovalsByType: groupApprovalsByActionType(
          (approvals.data ?? []) as Array<{ action_type: string }>,
        ),
        yesterdaySpendUsd: runs.reduce((s, r) => s + (r.cost_usd ?? 0), 0),
        failedRunsCount: runs.filter((r) => r.status === 'failed').length,
      };

      if (!dailyHasContent(stats)) {
        await audit(db, 'digest_skipped', { mode: 'daily', reason: 'nothing to report' });
        return json({ skipped: 'nothing to report' }, 200);
      }

      const recipients = await digestRecipients(db);
      if (recipients.length === 0) {
        await audit(db, 'digest_skipped', { mode: 'daily', reason: 'no recipients' });
        return json({ skipped: 'no recipients' }, 200);
      }

      const email = buildDailyDigest(stats, appBaseUrl());
      const ids = await sendEmail(recipients, email);
      await audit(db, 'digest_sent', { mode: 'daily', recipients: recipients.length, stats, ids });
      return json({ sent: recipients.length, stats }, 200);
    }

    return json({ error: "mode must be 'instant' or 'daily'" }, 400);
  } catch (err) {
    console.error('agent-digest error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
