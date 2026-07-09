/**
 * Agentic OS — pure dispatch decision logic (US-478)
 *
 * Dependency-free so it is shared by the Deno agent-dispatcher edge function
 * and the Node/Vitest unit tests. Given an agent's current state, decide
 * whether to invoke it now or skip it (and why). Recording a 'skipped'
 * agent_runs row with the returned reason keeps blocked agents observable.
 */

import { isAgentDue } from './cron.ts';

export type SkipReason =
  | 'disabled'
  | 'global_pause'
  | 'cost_cap'
  | 'already_running'
  | 'not_due';

export interface DispatchState {
  enabled: boolean;
  scheduleCron: string | null | undefined;
  lastRunAt: string | Date | null | undefined;
  /** An unfinished ('running') run already exists for this agent. */
  isRunning: boolean;
  /** Global kill switch (agent_system_settings.global_pause). */
  globalPause: boolean;
  /** Sum of today's cost_usd for this agent. */
  todaySpendUsd: number;
  /** Per-agent daily cap (agent_definitions.daily_cost_cap_usd). */
  dailyCapUsd: number | null | undefined;
}

export type DispatchDecision =
  | { invoke: true }
  | { invoke: false; reason: SkipReason };

/**
 * Precedence: an agent is invoked only when enabled, not globally paused,
 * under its daily cost cap, not already running, and actually due. The first
 * failing gate wins and names the skip reason.
 */
export function decideDispatch(state: DispatchState, now: Date): DispatchDecision {
  if (!state.enabled) return { invoke: false, reason: 'disabled' };
  if (state.globalPause) return { invoke: false, reason: 'global_pause' };

  const cap = state.dailyCapUsd;
  if (cap != null && cap >= 0 && state.todaySpendUsd >= cap) {
    return { invoke: false, reason: 'cost_cap' };
  }

  if (!isAgentDue(state.scheduleCron, state.lastRunAt, now)) {
    return { invoke: false, reason: 'not_due' };
  }

  // Idempotency: never double-invoke an agent that is still running.
  if (state.isRunning) return { invoke: false, reason: 'already_running' };

  return { invoke: true };
}
