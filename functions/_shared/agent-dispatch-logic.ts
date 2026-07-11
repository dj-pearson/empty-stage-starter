/**
 * Pure dispatch decision logic for the agent dispatcher (US-478).
 *
 * Separated from the edge function so the due/not-due/blocked decision is
 * unit-testable without a database or network. The dispatcher (index.ts)
 * gathers the runtime facts (global pause, last run, running run, today's
 * spend) and asks decideDispatch() what to do with each agent.
 *
 * Imports only the local cron module — no esm.sh — so tests run offline.
 */

import { isDue } from './cron.ts';

/** Minimal shape of an agent_definitions row the decision needs. */
export interface DispatchAgent {
  id: string;
  name: string;
  enabled: boolean;
  schedule_cron: string | null;
  daily_cost_cap_usd: number;
}

/** Runtime facts the dispatcher supplies per agent. */
export interface DispatchFacts {
  /** Global kill switch (agent_system_settings.global_pause). */
  globalPause: boolean;
  /** Most recent run start time, or null if never run. */
  lastRunAt: string | Date | null;
  /** True if the agent currently has a run in status 'running'. */
  hasRunningRun: boolean;
  /** Sum of today's cost_usd for this agent. */
  todaySpendUsd: number;
}

export type DispatchAction = 'invoke' | 'skip' | 'noop';

export interface DispatchDecision {
  action: DispatchAction;
  /** Skip reason recorded on the skipped agent_runs row (when action === 'skip'). */
  reason?: string;
}

/**
 * Decide what to do with one agent this cycle.
 *
 * - not scheduled / not due  -> noop (nothing recorded)
 * - due but already running   -> noop (idempotent: never double-invoke)
 * - due but disabled          -> skip 'disabled'
 * - due but globally paused    -> skip 'global pause'
 * - due but over daily cap     -> skip 'cost cap'
 * - due and clear              -> invoke
 *
 * Blocking checks are evaluated before the running check ONLY for reason
 * fidelity; a running agent is always a noop regardless of blockers.
 */
export function decideDispatch(
  agent: DispatchAgent,
  facts: DispatchFacts,
  now: Date,
): DispatchDecision {
  if (!isDue(agent.schedule_cron, facts.lastRunAt, now)) {
    return { action: 'noop' };
  }
  // Idempotency wins: an in-flight run must never be double-invoked or skip-logged.
  if (facts.hasRunningRun) {
    return { action: 'noop' };
  }
  if (!agent.enabled) {
    return { action: 'skip', reason: 'disabled' };
  }
  if (facts.globalPause) {
    return { action: 'skip', reason: 'global pause' };
  }
  if (facts.todaySpendUsd >= agent.daily_cost_cap_usd) {
    return { action: 'skip', reason: 'cost cap' };
  }
  return { action: 'invoke' };
}
