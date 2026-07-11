/**
 * Churn-risk scoring agent (US-497).
 *
 * Weekly (dispatcher). For a bounded page of households, computes activity
 * features (days since last plan / grocery, subscription state, setup) and has
 * Claude (haiku) produce a 0-100 score + risk band + top reasons + suggested
 * action via structured output. A household newly crossing into 'high' risk
 * gets a tier-2 escalation.
 *
 * POST /agent-churn-score  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  computeFeatures,
  crossedIntoHigh,
  clampScore,
  type ChurnRisk,
} from '../_shared/churn-logic.ts';

const AGENT_NAME = 'churn-score';
const PAGE_SIZE = 25;

const ScoreSchema = z.object({
  score: z.number(),
  risk: z.enum(['low', 'medium', 'high']),
  reasons: z.array(z.string()).min(1).max(5),
  suggested_action: z.string(),
});
interface ScoreOut {
  score: number;
  risk: ChurnRisk;
  reasons: string[];
  suggested_action: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
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

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const now = new Date();
      const { data: households } = await db
        .from('households')
        .select('id, created_at')
        .order('created_at', { ascending: true })
        .limit(PAGE_SIZE);
      const hh = (households ?? []) as Array<{ id: string; created_at: string | null }>;
      if (hh.length === 0) return { households: 0, scored: 0, escalated: 0 };
      const ids = hh.map((h) => h.id);

      const [plans, groceries, kids, members, prior] = await Promise.all([
        db.from('plan_entries').select('household_id, created_at').in('household_id', ids),
        db.from('grocery_lists').select('household_id, created_at').in('household_id', ids),
        db.from('kids').select('household_id').in('household_id', ids),
        db.from('household_members').select('household_id, user_id').in('household_id', ids),
        db.from('agent_churn_scores').select('household_id, risk, scored_at').in('household_id', ids)
          .order('scored_at', { ascending: false }),
      ]);

      const lastPlan = new Map<string, string | null>();
      const lastGrocery = new Map<string, string | null>();
      const kidsCount = new Map<string, number>();
      const userToHousehold = new Map<string, string>();
      const prevRisk = new Map<string, ChurnRisk>();

      for (const p of (plans.data ?? []) as Array<{ household_id: string; created_at: string | null }>) {
        lastPlan.set(p.household_id, maxIso(lastPlan.get(p.household_id) ?? null, p.created_at));
      }
      for (const g of (groceries.data ?? []) as Array<{ household_id: string; created_at: string | null }>) {
        lastGrocery.set(g.household_id, maxIso(lastGrocery.get(g.household_id) ?? null, g.created_at));
      }
      for (const k of (kids.data ?? []) as Array<{ household_id: string }>) {
        kidsCount.set(k.household_id, (kidsCount.get(k.household_id) ?? 0) + 1);
      }
      for (const m of (members.data ?? []) as Array<{ household_id: string; user_id: string }>) {
        userToHousehold.set(m.user_id, m.household_id);
      }
      // Most recent prior risk per household (rows are ordered scored_at desc).
      for (const r of (prior.data ?? []) as Array<{ household_id: string; risk: ChurnRisk }>) {
        if (!prevRisk.has(r.household_id)) prevRisk.set(r.household_id, r.risk);
      }

      // Subscription status per household (first member sub found).
      const subStatus = new Map<string, string>();
      const userIds = [...userToHousehold.keys()];
      if (userIds.length > 0) {
        const { data: subs } = await db
          .from('user_subscriptions')
          .select('user_id, status')
          .in('user_id', userIds);
        for (const s of (subs ?? []) as Array<{ user_id: string; status: string }>) {
          const hid = userToHousehold.get(s.user_id);
          if (hid && !subStatus.has(hid)) subStatus.set(hid, s.status);
        }
      }

      let scored = 0;
      let escalated = 0;

      for (const h of hh) {
        const features = computeFeatures(
          {
            lastPlanAt: lastPlan.get(h.id) ?? null,
            lastGroceryAt: lastGrocery.get(h.id) ?? null,
            subscriptionStatus: subStatus.get(h.id) ?? null,
            kidsCount: kidsCount.get(h.id) ?? 0,
            signupAt: h.created_at,
          },
          now,
        );

        const out = await ctx.structuredOutput<ScoreOut>({
          schema: ScoreSchema,
          prompt:
            `Assess churn risk for this EatPal household from these features:\n` +
            `${JSON.stringify(features, null, 2)}\n\n` +
            `Return JSON: score (0-100, higher = more likely to churn), risk (low|medium|high), ` +
            `reasons (2-4 short strings), suggested_action (one retention action).`,
        });

        const score = clampScore(out.score);
        await db.from('agent_churn_scores').insert({
          household_id: h.id,
          score,
          risk: out.risk,
          reasons: out.reasons as unknown as Json,
        });
        scored++;

        if (crossedIntoHigh(prevRisk.get(h.id) ?? null, out.risk)) {
          await ctx.escalate({
            tier: 2,
            severity: 'medium',
            domain: 'growth',
            title: `Household newly at high churn risk`,
            context: {
              household_id: h.id,
              score,
              reasons: out.reasons,
              suggested_action: out.suggested_action,
              features,
            } as unknown as Json,
          });
          escalated++;
        }
      }

      return { households: hh.length, scored, escalated };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
