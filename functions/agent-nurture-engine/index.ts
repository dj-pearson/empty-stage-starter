/**
 * Nurture sequence engine (US-498).
 *
 * Runs via the dispatcher. Each cycle:
 *   1. ENROLL households on trigger agent_events (dedup: one active enrollment
 *      per sequence+household).
 *   2. ADVANCE due enrollments — for the current step, decide send / exit /
 *      suppress (unsubscribe, exit-event, open ticket, 72h frequency cap), then
 *      draft a send_email approval (templated) and advance / complete.
 *
 * Draft-first: every send goes through requestApproval; the engine performs no
 * outward email itself.
 *
 * POST /agent-nurture-engine  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  shouldEnroll,
  decideStepAction,
  advanceEnrollment,
  computeNextStepAt,
  signEmailToken,
  type NurtureSequence,
  type NurtureEnrollment,
} from '../_shared/nurture-logic.ts';
import {
  renderTemplate,
  NURTURE_TEMPLATES,
  isGenerativeTemplate,
  wrapGenerativeBody,
  type TemplateContext,
} from '../_shared/nurture-templates.ts';
import {
  winbackFrequencyBlocked,
  becameActiveSince,
  REACTIVATED_EVENT,
} from '../_shared/winback-logic.ts';

const EncouragementSchema = z.object({ encouragement: z.string() });
const WinbackSchema = z.object({ subject: z.string().min(1), body: z.string().min(1) });

const AGENT_NAME = 'nurture-engine';
const ENROLL_LOOKBACK_HOURS = 26;
const DUE_LIMIT = 100;
const OPEN_TICKET_STATUSES = ['new', 'triaged', 'awaiting_reply', 'awaiting_user', 'in_progress', 'waiting_user'];

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

  const tokenSecret = Deno.env.get('CSAT_TOKEN_SECRET') ?? expected;

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const now = new Date();

      const { data: seqRows } = await db
        .from('nurture_sequences')
        .select('id, name, trigger_event, steps, enabled')
        .eq('enabled', true);
      const sequences = (seqRows ?? []) as NurtureSequence[];
      const seqById = new Map(sequences.map((s) => [s.id, s]));
      const triggers = [...new Set(sequences.map((s) => s.trigger_event))];

      // --- 1. Enroll on recent trigger events ------------------------------
      let enrolled = 0;
      if (triggers.length > 0) {
        const since = new Date(now.getTime() - ENROLL_LOOKBACK_HOURS * 3_600_000).toISOString();
        const { data: eventRows } = await db
          .from('agent_events')
          .select('household_id, user_id, event_type, created_at')
          .in('event_type', triggers)
          .gte('created_at', since);
        const events = (eventRows ?? []) as Array<{ household_id: string | null; user_id: string | null; event_type: string }>;

        for (const ev of events) {
          if (!ev.household_id) continue;
          for (const seq of sequences.filter((s) => s.trigger_event === ev.event_type)) {
            const { count } = await db
              .from('nurture_enrollments')
              .select('id', { count: 'exact', head: true })
              .eq('sequence_id', seq.id)
              .eq('household_id', ev.household_id)
              .eq('status', 'active');
            if (!shouldEnroll(seq, (count ?? 0) > 0)) continue;

            // Win-back frequency cap (US-500): don't re-contact a lapsed household
            // with a win-back campaign more than once per 30 days.
            if (seq.trigger_event.startsWith('inactive_')) {
              const { data: lastWinback } = await db
                .from('agent_approvals')
                .select('created_at')
                .eq('action_type', 'send_email')
                .eq('payload->>kind', 'nurture')
                .eq('payload->>household_id', ev.household_id)
                .like('payload->>template_key', 'winback%')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (winbackFrequencyBlocked(lastWinback?.created_at ?? null, now)) continue;
            }
            const nextAt = computeNextStepAt(seq.steps[0]?.delay_hours ?? 0, now);
            const { error } = await db.from('nurture_enrollments').insert({
              sequence_id: seq.id,
              household_id: ev.household_id,
              user_id: ev.user_id,
              current_step: 0,
              status: 'active',
              next_step_at: nextAt,
            });
            if (!error) enrolled++;
          }
        }
      }

      // --- 2. Advance due enrollments --------------------------------------
      const { data: dueRows } = await db
        .from('nurture_enrollments')
        .select('id, sequence_id, household_id, user_id, current_step, status, next_step_at, created_at')
        .eq('status', 'active')
        .lte('next_step_at', now.toISOString())
        .order('next_step_at', { ascending: true })
        .limit(DUE_LIMIT);
      const due = (dueRows ?? []) as Array<NurtureEnrollment & { created_at: string }>;

      const emailCache = new Map<string, string | null>();
      async function householdEmail(householdId: string, userId: string | null): Promise<string | null> {
        if (emailCache.has(householdId)) return emailCache.get(householdId)!;
        let uid = userId;
        if (!uid) {
          const { data: m } = await db.from('household_members').select('user_id').eq('household_id', householdId).limit(1).maybeSingle();
          uid = m?.user_id ?? null;
        }
        let email: string | null = null;
        if (uid) {
          try {
            const { data } = await db.auth.admin.getUserById(uid);
            email = data?.user?.email ?? null;
          } catch {
            email = null;
          }
        }
        emailCache.set(householdId, email);
        return email;
      }

      let sent = 0;
      let exited = 0;
      let suppressed = 0;

      for (const enr of due) {
        const seq = seqById.get(enr.sequence_id);
        if (!seq || enr.current_step >= seq.steps.length) {
          await db.from('nurture_enrollments').update({ status: 'completed', next_step_at: null }).eq('id', enr.id);
          continue;
        }
        const step = seq.steps[enr.current_step];
        const hid = enr.household_id!;

        // Recent events since enrollment (for exit checks).
        const { data: sinceEvents } = await db
          .from('agent_events')
          .select('event_type')
          .eq('household_id', hid)
          .gte('created_at', enr.created_at);
        const recentTypes = (sinceEvents ?? []).map((e: { event_type: string }) => e.event_type);

        // Win-back exits when the household becomes active again (US-500): inject
        // the 'reactivated' sentinel so decideStepAction exits on it.
        const [recentPlan, recentGrocery] = await Promise.all([
          db.from('plan_entries').select('created_at').eq('household_id', hid).gt('created_at', enr.created_at).limit(1).maybeSingle(),
          db.from('grocery_lists').select('created_at').eq('household_id', hid).gt('created_at', enr.created_at).limit(1).maybeSingle(),
        ]);
        if (becameActiveSince(enr.created_at, [recentPlan.data?.created_at ?? null, recentGrocery.data?.created_at ?? null])) {
          recentTypes.push(REACTIVATED_EVENT);
        }

        const email = await householdEmail(hid, enr.user_id);

        // Suppression flags.
        let emailSuppressed = false;
        if (email) {
          const { count } = await db.from('email_suppressions').select('id', { count: 'exact', head: true }).eq('email', email.toLowerCase());
          emailSuppressed = (count ?? 0) > 0;
        }
        const { data: membersForTickets } = await db.from('household_members').select('user_id').eq('household_id', hid);
        const memberIds = (membersForTickets ?? []).map((m: { user_id: string }) => m.user_id);
        let hasOpenTicket = false;
        if (memberIds.length > 0) {
          const { count } = await db.from('support_tickets').select('id', { count: 'exact', head: true }).in('user_id', memberIds).in('status', OPEN_TICKET_STATUSES);
          hasOpenTicket = (count ?? 0) > 0;
        }
        const cap72 = new Date(now.getTime() - 72 * 3_600_000).toISOString();
        const { count: recentNurture } = await db
          .from('agent_approvals')
          .select('id', { count: 'exact', head: true })
          .eq('action_type', 'send_email')
          .eq('payload->>kind', 'nurture')
          .eq('payload->>household_id', hid)
          .gte('created_at', cap72);

        const action = decideStepAction(step, recentTypes, {
          emailSuppressed,
          hasOpenTicket,
          recentNurtureSent: (recentNurture ?? 0) > 0,
        });

        if (action === 'exit') {
          await db.from('nurture_enrollments').update({ status: 'exited', next_step_at: null }).eq('id', enr.id);
          exited++;
          continue;
        }
        if (action === 'suppress') {
          await db.from('nurture_enrollments').update({ status: 'suppressed', next_step_at: null }).eq('id', enr.id);
          suppressed++;
          continue;
        }

        // action === 'send' — draft the templated email, then advance.
        if (email) {
          const token = await signEmailToken(email, tokenSecret);
          const unsubscribeUrl = `${functionsBase()}/nurture-unsubscribe?t=${encodeURIComponent(token)}`;

          let rendered: { subject: string; body: string; templated: boolean };

          if (isGenerativeTemplate(step.template_key)) {
            // Win-back (US-500): Claude writes the whole email from the
            // household's own data; reviewed individually (templated:false).
            const [kids, foods, lastPlan] = await Promise.all([
              db.from('kids').select('always_eats_foods, favorite_foods').eq('household_id', hid).limit(5),
              db.from('foods').select('id', { count: 'exact', head: true }).eq('household_id', hid),
              db.from('plan_entries').select('date').eq('household_id', hid).order('date', { ascending: false }).limit(1).maybeSingle(),
            ]);
            const safeFoods = [
              ...new Set(
                ((kids.data ?? []) as Array<{ always_eats_foods: string[] | null; favorite_foods: string[] | null }>)
                  .flatMap((k) => [...(k.always_eats_foods ?? []), ...(k.favorite_foods ?? [])]),
              ),
            ].slice(0, 8);
            const winCtx: TemplateContext = { unsubscribeUrl };
            try {
              const out = await ctx.structuredOutput<{ subject: string; body: string }>({
                schema: WinbackSchema,
                prompt:
                  `Write a short, warm win-back email (HTML body, no <html>/<body> wrapper) for a lapsed EatPal parent. ` +
                  `Reference their own data: safe foods = ${JSON.stringify(safeFoods)}; ` +
                  `last meal plan date = ${lastPlan.data?.date ?? 'none'}; foods added = ${foods.count ?? 0}. ` +
                  `Be encouraging, low-pressure, and invite them back to make a quick plan. ` +
                  `JSON: {"subject": "...", "body": "<p>...</p>"}.`,
              });
              rendered = { subject: out.subject, body: wrapGenerativeBody(out.body, winCtx), templated: false };
            } catch {
              rendered = renderTemplate(step.template_key, winCtx); // generic fallback, templated:false
            }
          } else {
            // Personalize known static templates: merge fields + a short Claude line.
            let mergeCtx: TemplateContext = { unsubscribeUrl };
            if (step.template_key in NURTURE_TEMPLATES) {
              const [kids, foods] = await Promise.all([
                db.from('kids').select('id', { count: 'exact', head: true }).eq('household_id', hid),
                db.from('foods').select('id', { count: 'exact', head: true }).eq('household_id', hid),
              ]);
              const kidCount = kids.count ?? 0;
              const foodsAdded = foods.count ?? 0;
              let encouragement = '';
              try {
                const out = await ctx.structuredOutput<{ encouragement: string }>({
                  schema: EncouragementSchema,
                  prompt:
                    `Write at most 2 warm, specific sentences of encouragement for an EatPal parent ` +
                    `receiving the "${step.template_key}" onboarding email. They have added ${foodsAdded} ` +
                    `food(s) and ${kidCount} child profile(s). No greeting or signature — just the encouragement. JSON: {"encouragement": "..."}.`,
                });
                encouragement = out.encouragement;
              } catch {
                encouragement = '';
              }
              mergeCtx = { unsubscribeUrl, kidCount, foodsAdded, encouragement };
            }
            rendered = renderTemplate(step.template_key, mergeCtx);
          }
          await ctx.requestApproval({
            actionType: 'send_email',
            payload: {
              to: email,
              subject: rendered.subject,
              body: rendered.body,
              html: rendered.body,
              template_key: step.template_key,
              household_id: hid,
              user_id: enr.user_id,
              kind: 'nurture',
              templated: rendered.templated,
            } as unknown as Json,
            expiresInHours: 72,
          });
          sent++;
        }
        const adv = advanceEnrollment({ current_step: enr.current_step }, seq.steps, now);
        await db.from('nurture_enrollments').update(adv).eq('id', enr.id);
      }

      return { enrolled, sent, exited, suppressed, due: due.length };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
