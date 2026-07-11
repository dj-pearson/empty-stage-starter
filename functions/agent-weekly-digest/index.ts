/**
 * Weekly household digest agent (US-501).
 *
 * Weekly (dispatcher). For opted-in households with activity this week, renders
 * a mostly-deterministic recap (plans made, new foods tried, active days) and
 * asks Claude only for a 1-2 sentence encouragement line, then drafts a
 * templated:true send_email approval so the admin can bulk-approve the week's
 * digests in one action. Households with no activity are skipped (no empty
 * digests). Suppressed/unsubscribed emails are honored.
 *
 * POST /agent-weekly-digest  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import { computeWeeklyStats, hasActivity, renderDigest } from '../_shared/weekly-digest-logic.ts';
import { signEmailToken } from '../_shared/nurture-logic.ts';
import { resolveCsatTokenSecret } from '../_shared/csat-logic.ts';

const AGENT_NAME = 'weekly-digest';
const HOUSEHOLD_BATCH = 200;
const EncouragementSchema = z.object({ encouragement: z.string() });

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function functionsBase(): string {
  const url = Deno.env.get('SUPABASE_URL');
  return url ? `${url}/functions/v1` : (Deno.env.get('FUNCTIONS_URL') ?? '');
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

  // Fail closed: unsubscribe links must be signed with the dedicated secret (US-521).
  const tokenSecret = resolveCsatTokenSecret(Deno.env.get('CSAT_TOKEN_SECRET'));
  if (!tokenSecret) {
    return json({ error: 'CSAT_TOKEN_SECRET is not configured' }, 500);
  }

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const now = new Date();
      const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();

      const { data: households } = await db
        .from('households')
        .select('id')
        .eq('weekly_digest_opt_in', true)
        .limit(HOUSEHOLD_BATCH);
      const hh = (households ?? []) as Array<{ id: string }>;
      if (hh.length === 0) return { households: 0, drafted: 0, skipped: 0 };

      const emailCache = new Map<string, string | null>();
      async function householdEmail(hid: string): Promise<string | null> {
        if (emailCache.has(hid)) return emailCache.get(hid)!;
        const { data: m } = await db.from('household_members').select('user_id').eq('household_id', hid).limit(1).maybeSingle();
        let email: string | null = null;
        if (m?.user_id) {
          try {
            const { data } = await db.auth.admin.getUserById(m.user_id);
            email = data?.user?.email ?? null;
          } catch {
            email = null;
          }
        }
        emailCache.set(hid, email);
        return email;
      }

      let drafted = 0;
      let skipped = 0;

      for (const h of hh) {
        const [plans, foods] = await Promise.all([
          db.from('plan_entries').select('created_at').eq('household_id', h.id).gte('created_at', weekStart),
          db.from('foods').select('id', { count: 'exact', head: true }).eq('household_id', h.id).gte('created_at', weekStart),
        ]);
        const stats = computeWeeklyStats(
          ((plans.data ?? []) as Array<{ created_at: string }>).map((p) => p.created_at),
          foods.count ?? 0,
        );
        if (!hasActivity(stats)) {
          skipped++;
          continue;
        }

        const email = await householdEmail(h.id);
        if (!email) {
          skipped++;
          continue;
        }
        const { count: suppressed } = await db
          .from('email_suppressions')
          .select('id', { count: 'exact', head: true })
          .eq('email', email.toLowerCase());
        if ((suppressed ?? 0) > 0) {
          skipped++;
          continue;
        }

        let encouragement = '';
        try {
          const out = await ctx.structuredOutput<{ encouragement: string }>({
            schema: EncouragementSchema,
            prompt:
              `Write at most 2 warm sentences of encouragement for a family's weekly EatPal recap. ` +
              `This week: ${stats.plansMade} meal(s) planned, ${stats.newFoodsTried} new food(s) tried, ` +
              `${stats.activeDays} active day(s). No greeting or signature. JSON: {"encouragement":"..."}.`,
          });
          encouragement = out.encouragement;
        } catch {
          encouragement = '';
        }

        const token = await signEmailToken(email, tokenSecret);
        const unsubscribeUrl = `${functionsBase()}/nurture-unsubscribe?t=${encodeURIComponent(token)}`;
        const digest = renderDigest(stats, { unsubscribeUrl, encouragement });

        await ctx.requestApproval({
          actionType: 'send_email',
          payload: {
            to: email,
            subject: digest.subject,
            body: digest.body,
            html: digest.body,
            template_key: 'weekly_digest',
            household_id: h.id,
            kind: 'digest',
            templated: true,
            stats,
          } as unknown as Json,
          expiresInHours: 72,
        });
        drafted++;
      }

      return { households: hh.length, drafted, skipped };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
