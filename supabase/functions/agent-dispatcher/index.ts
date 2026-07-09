/**
 * Agentic OS — Agent Dispatcher (US-478)
 *
 * Runs on a pg_cron schedule (every 5 minutes). Loads enabled agents,
 * decides which are due, and invokes each due agent's own edge function
 * (`agent-<name>`). Blocked agents (disabled, globally paused, over cost cap,
 * already running) get a 'skipped' agent_runs row recording the reason.
 *
 * Auth: verify_jwt is false (see config.toml); the function instead requires
 * an internal shared secret (X-Cron-Secret == CRON_SECRET) or the service
 * role key in the Authorization header, matching the existing scheduler
 * convention (see backup-scheduler).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decideDispatch, type DispatchState, type SkipReason } from '../_shared/dispatch.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function startOfUtcDay(now: Date): Date {
  const d = new Date(now.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Read the global kill switch, tolerating the settings table not existing yet (US-480). */
async function readGlobalPause(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('agent_system_settings')
      .select('global_pause')
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.global_pause);
  } catch {
    return false;
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Internal shared-secret / service-role gate -------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET');
  const isServiceRole = serviceKey.length > 0 && authHeader.includes(serviceKey);
  const isCron = Boolean(cronSecret) && req.headers.get('X-Cron-Secret') === cronSecret;
  if (!isServiceRole && !isCron) {
    return new Response(JSON.stringify({ error: 'Unauthorized: scheduled jobs only' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const now = new Date();
  const dayStartIso = startOfUtcDay(now).toISOString();

  const summary = {
    now: now.toISOString(),
    invoked: [] as string[],
    skipped: [] as Array<{ agent: string; reason: SkipReason }>,
    errors: [] as Array<{ agent: string; error: string }>,
    expiredApprovals: 0,
  };

  try {
    const { data: agents, error: loadErr } = await supabase
      .from('agent_definitions')
      .select('id, name, schedule_cron, daily_cost_cap_usd, enabled')
      .eq('enabled', true);

    if (loadErr) throw new Error(`Failed to load agents: ${loadErr.message}`);

    const globalPause = await readGlobalPause(supabase);

    for (const agent of agents ?? []) {
      const agentId = agent.id as string;
      const agentName = agent.name as string;

      // Most recent run start (for due calculation).
      const { data: lastRun } = await supabase
        .from('agent_runs')
        .select('started_at')
        .eq('agent_id', agentId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Any unfinished run → treat as running (idempotency).
      const { count: runningCount } = await supabase
        .from('agent_runs')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId)
        .eq('status', 'running');

      // Today's accumulated spend for this agent.
      const { data: todayRuns } = await supabase
        .from('agent_runs')
        .select('cost_usd')
        .eq('agent_id', agentId)
        .gte('started_at', dayStartIso);
      const todaySpendUsd = (todayRuns ?? []).reduce(
        (sum, r) => sum + (Number(r.cost_usd) || 0),
        0,
      );

      const state: DispatchState = {
        enabled: agent.enabled as boolean,
        scheduleCron: agent.schedule_cron as string | null,
        lastRunAt: (lastRun?.started_at as string | undefined) ?? null,
        isRunning: (runningCount ?? 0) > 0,
        globalPause,
        todaySpendUsd,
        dailyCapUsd: agent.daily_cost_cap_usd as number | null,
      };

      const decision = decideDispatch(state, now);

      if (!decision.invoke) {
        // 'not_due' is the common, uninteresting case — do not log a row for it.
        if (decision.reason !== 'not_due') {
          await supabase.from('agent_runs').insert({
            agent_id: agentId,
            trigger: 'dispatcher',
            status: 'skipped',
            output: { reason: decision.reason },
            started_at: now.toISOString(),
            finished_at: now.toISOString(),
          });
          summary.skipped.push({ agent: agentName, reason: decision.reason });
        }
        continue;
      }

      // Invoke the agent's own edge function: agent-<name>.
      try {
        const invokeUrl = `${supabaseUrl}/functions/v1/agent-${agentName}`;
        const resp = await fetch(invokeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
            ...(cronSecret ? { 'X-Cron-Secret': cronSecret } : {}),
          },
          body: JSON.stringify({ trigger: 'dispatcher' }),
        });
        if (!resp.ok) {
          throw new Error(`agent-${agentName} responded ${resp.status}`);
        }
        summary.invoked.push(agentName);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // The agent function couldn't be reached — record a failed run so the
        // failure is visible in the runs dashboard.
        await supabase.from('agent_runs').insert({
          agent_id: agentId,
          trigger: 'dispatcher',
          status: 'failed',
          error: `dispatch invocation failed: ${message}`,
          started_at: now.toISOString(),
          finished_at: now.toISOString(),
        });
        summary.errors.push({ agent: agentName, error: message });
      }
    }

    // Expiry sweep: ask the approval-executor to expire stale drafts (US-482).
    try {
      const sweepResp = await fetch(`${supabaseUrl}/functions/v1/approval-executor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          ...(cronSecret ? { 'X-Cron-Secret': cronSecret } : {}),
        },
        body: JSON.stringify({ sweep: true }),
      });
      const sweepData = (await sweepResp.json().catch(() => ({}))) as { expired?: number };
      if (sweepResp.ok) summary.expiredApprovals = sweepData.expired ?? 0;
      else summary.errors.push({ agent: 'approval-executor:sweep', error: `status ${sweepResp.status}` });
    } catch (err) {
      summary.errors.push({
        agent: 'approval-executor:sweep',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message, summary }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};
