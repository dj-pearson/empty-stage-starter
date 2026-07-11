/**
 * Lifecycle event detector (US-496).
 *
 * Runs hourly (dispatcher). Detects lifecycle events from existing tables and
 * inserts them into agent_events (once-only events deduped by a partial unique
 * index; inactivity events re-arm). Deterministic — no LLM calls.
 *
 * Batched: a handful of set-based queries over a bounded household batch, not
 * per-household N+1.
 *
 * POST /agent-event-detector  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  missingOnceEvents,
  inactivityEventsToEmit,
  type PriorEvent,
} from '../_shared/event-detector-logic.ts';

const AGENT_NAME = 'event-detector';
const HOUSEHOLD_BATCH = 100;

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
    handler: async () => {
      const now = new Date();
      const { data: households } = await db
        .from('households')
        .select('id, created_at')
        .order('created_at', { ascending: true })
        .limit(HOUSEHOLD_BATCH);

      const hh = (households ?? []) as Array<{ id: string; created_at: string | null }>;
      if (hh.length === 0) return { households: 0, events: 0 };
      const ids = hh.map((h) => h.id);

      // Set-based fetches over the batch.
      const [events, kids, plans, groceries, members] = await Promise.all([
        db.from('agent_events').select('household_id, event_type, created_at').in('household_id', ids),
        db.from('kids').select('household_id').in('household_id', ids),
        db.from('plan_entries').select('household_id, created_at').in('household_id', ids),
        db.from('grocery_lists').select('household_id, created_at').in('household_id', ids),
        db.from('household_members').select('household_id, user_id').in('household_id', ids),
      ]);

      // Per-household aggregates.
      const existingTypes = new Map<string, Set<string>>();
      const priorInactivity = new Map<string, PriorEvent[]>();
      for (const e of (events.data ?? []) as Array<{ household_id: string; event_type: string; created_at: string }>) {
        (existingTypes.get(e.household_id) ?? existingTypes.set(e.household_id, new Set()).get(e.household_id)!).add(e.event_type);
        if (e.event_type.startsWith('inactive_')) {
          const arr = priorInactivity.get(e.household_id) ?? priorInactivity.set(e.household_id, []).get(e.household_id)!;
          arr.push({ event_type: e.event_type, created_at: e.created_at });
        }
      }
      const hasKids = new Set((kids.data ?? []).map((r: { household_id: string }) => r.household_id));
      const lastActivity = new Map<string, string | null>();
      const hasPlans = new Set<string>();
      const hasGrocery = new Set<string>();
      for (const p of (plans.data ?? []) as Array<{ household_id: string; created_at: string | null }>) {
        hasPlans.add(p.household_id);
        lastActivity.set(p.household_id, maxIso(lastActivity.get(p.household_id) ?? null, p.created_at));
      }
      for (const g of (groceries.data ?? []) as Array<{ household_id: string; created_at: string | null }>) {
        hasGrocery.add(g.household_id);
        lastActivity.set(g.household_id, maxIso(lastActivity.get(g.household_id) ?? null, g.created_at));
      }
      const membersByHousehold = new Map<string, string[]>();
      const userToHousehold = new Map<string, string>();
      for (const m of (members.data ?? []) as Array<{ household_id: string; user_id: string }>) {
        (membersByHousehold.get(m.household_id) ?? membersByHousehold.set(m.household_id, []).get(m.household_id)!).push(m.user_id);
        userToHousehold.set(m.user_id, m.household_id);
      }

      // Subscription state per household (from member users).
      const allUserIds = [...userToHousehold.keys()];
      const subActive = new Map<string, string>(); // household -> user
      const subCanceled = new Map<string, string>();
      if (allUserIds.length > 0) {
        const { data: subs } = await db
          .from('user_subscriptions')
          .select('user_id, status')
          .in('user_id', allUserIds);
        for (const s of (subs ?? []) as Array<{ user_id: string; status: string }>) {
          const hid = userToHousehold.get(s.user_id);
          if (!hid) continue;
          if (['active', 'trialing', 'past_due'].includes(s.status)) subActive.set(hid, s.user_id);
          if (['canceled', 'cancelled'].includes(s.status)) subCanceled.set(hid, s.user_id);
        }
      }

      // Build new events per household.
      const rows: Array<{ household_id: string; user_id: string | null; event_type: string; payload: Json }> = [];
      for (const h of hh) {
        const existing = existingTypes.get(h.id) ?? new Set<string>();

        const onceCandidates = ['signup'];
        if (hasKids.has(h.id)) onceCandidates.push('first_kid_added');
        if (hasPlans.has(h.id)) onceCandidates.push('first_plan_created');
        if (hasGrocery.has(h.id)) onceCandidates.push('first_grocery_list');
        if (subActive.has(h.id)) onceCandidates.push('subscription_started');
        if (subCanceled.has(h.id)) onceCandidates.push('subscription_canceled');

        for (const type of missingOnceEvents(onceCandidates, existing)) {
          const userId = type === 'subscription_started'
            ? subActive.get(h.id) ?? null
            : type === 'subscription_canceled'
              ? subCanceled.get(h.id) ?? null
              : null;
          rows.push({ household_id: h.id, user_id: userId, event_type: type, payload: {} });
        }

        const lastActive = lastActivity.get(h.id) ?? h.created_at;
        if (lastActive) {
          for (const type of inactivityEventsToEmit(lastActive, now, priorInactivity.get(h.id) ?? [])) {
            rows.push({ household_id: h.id, user_id: null, event_type: type, payload: { last_active: lastActive } });
          }
        }
      }

      // Insert new events; tolerate unique violations (concurrent runs).
      let inserted = 0;
      for (const row of rows) {
        const { error } = await db.from('agent_events').insert(row);
        if (!error) inserted++;
        else if (!/duplicate|unique|23505/i.test(`${error.code} ${error.message}`)) {
          console.error('event insert failed:', error.message);
        }
      }

      return { households: hh.length, events: inserted };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
