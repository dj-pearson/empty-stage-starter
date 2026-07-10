/**
 * Agent dispatcher edge function (US-478).
 *
 * Runs on a 5-minute pg_cron schedule (see the accompanying migration). Each
 * cycle it:
 *   1. loads scheduled agent_definitions,
 *   2. for each, gathers runtime facts (global pause, last run, in-flight run,
 *      today's spend) and asks the pure decideDispatch() what to do,
 *   3. records a 'skipped' agent_runs row (with reason) for blocked agents,
 *   4. invokes the handler function for due, clear agents.
 *
 * Auth: verify_jwt = false (config.toml). Because it is publicly reachable, the
 * function requires an internal shared secret (AGENT_DISPATCH_SECRET) supplied
 * by the pg_cron caller — no JWT, but not open either.
 *
 * Idempotent: an agent that already has a 'running' run is never re-invoked.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  decideDispatch,
  type DispatchAgent,
  type DispatchFacts,
} from '../_shared/agent-dispatch-logic.ts';

interface AgentRow extends DispatchAgent {
  system_prompt: string | null;
}

const FUNCTIONS_BASE = () =>
  Deno.env.get('SUPABASE_URL')
    ? `${Deno.env.get('SUPABASE_URL')}/functions/v1`
    : (Deno.env.get('FUNCTIONS_URL') ?? '');

/** Start of the current UTC day, for summing today's spend. */
function startOfUtcDay(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

serve(async (req) => {
  // Internal shared-secret gate (no JWT; called by pg_cron/pg_net).
  const expected = Deno.env.get('AGENT_DISPATCH_SECRET');
  const provided = req.headers.get('x-agent-dispatch-secret');
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const now = new Date();

  try {
    // Global kill switch (agent_system_settings arrives in US-480; tolerate its absence).
    let globalPause = false;
    try {
      const { data: settings } = await supabase
        .from('agent_system_settings')
        .select('global_pause')
        .limit(1)
        .maybeSingle();
      globalPause = settings?.global_pause ?? false;
    } catch {
      globalPause = false;
    }

    // Load agents that have a schedule (enabled or not — disabled ones still get
    // a 'skipped' row when due, per US-478 AC).
    const { data: agents, error } = await supabase
      .from('agent_definitions')
      .select('id, name, enabled, schedule_cron, daily_cost_cap_usd, system_prompt')
      .not('schedule_cron', 'is', null);

    if (error) throw error;

    const dayStart = startOfUtcDay(now);
    const results: Array<{ agent: string; action: string; reason?: string }> = [];

    for (const agent of (agents ?? []) as AgentRow[]) {
      // Last run + in-flight detection.
      const { data: lastRun } = await supabase
        .from('agent_runs')
        .select('started_at, status')
        .eq('agent_id', agent.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count: runningCount } = await supabase
        .from('agent_runs')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .eq('status', 'running');

      // Today's spend for the cost-cap decision.
      const { data: todayRuns } = await supabase
        .from('agent_runs')
        .select('cost_usd')
        .eq('agent_id', agent.id)
        .gte('started_at', dayStart);
      const todaySpendUsd = (todayRuns ?? []).reduce(
        (sum: number, r: { cost_usd: number | null }) => sum + (r.cost_usd ?? 0),
        0,
      );

      const facts: DispatchFacts = {
        globalPause,
        lastRunAt: lastRun?.started_at ?? null,
        hasRunningRun: (runningCount ?? 0) > 0,
        todaySpendUsd,
      };

      const decision = decideDispatch(agent, facts, now);

      if (decision.action === 'noop') continue;

      if (decision.action === 'skip') {
        await supabase.from('agent_runs').insert({
          agent_id: agent.id,
          trigger: 'dispatcher',
          status: 'skipped',
          input: {},
          output: { skipped_reason: decision.reason },
          finished_at: now.toISOString(),
        });
        results.push({ agent: agent.name, action: 'skipped', reason: decision.reason });
        continue;
      }

      // Invoke the agent's handler function (convention: agent-<name>).
      // The handler opens its own 'running' run via the shared runtime.
      const url = `${FUNCTIONS_BASE()}/agent-${agent.name}`;
      try {
        await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-agent-dispatch-secret': expected,
          },
          body: JSON.stringify({ trigger: 'dispatcher', agent_id: agent.id }),
        });
        results.push({ agent: agent.name, action: 'invoked' });
      } catch (err) {
        // Delegation failure is not fatal for the cycle; log and continue.
        console.error(`dispatch invoke failed for ${agent.name}:`, err);
        results.push({ agent: agent.name, action: 'invoke_failed' });
      }
    }

    return new Response(JSON.stringify({ ran_at: now.toISOString(), results }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('agent-dispatcher error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
