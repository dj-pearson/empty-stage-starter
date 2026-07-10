/**
 * Pure execution-decision logic for the approval executor (US-482).
 *
 * Separated from the edge function so the status-transition guards, idempotency,
 * attempt accounting, and expiry test are unit-testable without a database,
 * network, or side effects. The executor (index.ts) performs the actual Resend /
 * webhook / GitHub calls and DB writes; it asks these functions WHAT to do.
 *
 * Execution bookkeeping lives under payload._execution so no schema change is
 * needed: { attempts, last_error?, result?, executed_at? }.
 */

export type ApprovalStatus = 'draft' | 'approved' | 'rejected' | 'executed' | 'expired';

/** Max failed attempts before a tier-2 escalation is filed. */
export const MAX_EXECUTION_ATTEMPTS = 3;

export interface ExecutionState {
  attempts: number;
  last_error?: string;
  result?: unknown;
  executed_at?: string;
}

export type ExecuteDecision =
  | { action: 'execute' }
  | { action: 'skip'; reason: string } // already executed — idempotent no-op
  | { action: 'reject'; reason: string }; // illegal transition

/**
 * Decide whether an approval in `status` may be executed.
 *
 * Only 'approved' is executable. 'executed' is an idempotent skip (never
 * re-executed). Every other status is an illegal transition — the executor
 * enforces draft -> approved -> executed and refuses to run a draft, a rejected,
 * or an expired approval.
 */
export function decideExecution(status: string): ExecuteDecision {
  switch (status) {
    case 'approved':
      return { action: 'execute' };
    case 'executed':
      return { action: 'skip', reason: 'already executed' };
    case 'draft':
      return { action: 'reject', reason: 'approval is still a draft (must be approved first)' };
    case 'rejected':
      return { action: 'reject', reason: 'approval was rejected' };
    case 'expired':
      return { action: 'reject', reason: 'approval has expired' };
    default:
      return { action: 'reject', reason: `unknown status '${status}'` };
  }
}

/** Read the execution bookkeeping out of a payload (defaults to zero attempts). */
export function readExecutionState(payload: unknown): ExecutionState {
  const p = (payload ?? {}) as Record<string, unknown>;
  const ex = (p._execution ?? {}) as Record<string, unknown>;
  return {
    attempts: typeof ex.attempts === 'number' ? ex.attempts : 0,
    last_error: typeof ex.last_error === 'string' ? ex.last_error : undefined,
    result: ex.result,
    executed_at: typeof ex.executed_at === 'string' ? ex.executed_at : undefined,
  };
}

/** Merge a successful result into the payload's _execution block. */
export function payloadWithSuccess(
  payload: unknown,
  result: unknown,
  now: Date,
): Record<string, unknown> {
  const p = { ...((payload ?? {}) as Record<string, unknown>) };
  const prev = readExecutionState(payload);
  p._execution = {
    attempts: prev.attempts + 1,
    result,
    executed_at: now.toISOString(),
  };
  return p;
}

/**
 * Merge a failure into the payload's _execution block, incrementing attempts.
 * Returns the new payload and the new attempt count so the caller can decide to
 * escalate.
 */
export function payloadWithFailure(
  payload: unknown,
  error: string,
): { payload: Record<string, unknown>; attempts: number } {
  const p = { ...((payload ?? {}) as Record<string, unknown>) };
  const prev = readExecutionState(payload);
  const attempts = prev.attempts + 1;
  p._execution = { attempts, last_error: error };
  return { payload: p, attempts };
}

/** After a failed attempt, should we file a tier-2 escalation? (>= 3 attempts). */
export function shouldEscalateFailure(attempts: number): boolean {
  return attempts >= MAX_EXECUTION_ATTEMPTS;
}

/** Is a draft approval past its expiry (for the sweep)? */
export function isExpired(
  row: { status: string; expires_at: string | null },
  now: Date,
): boolean {
  if (row.status !== 'draft') return false;
  if (!row.expires_at) return false;
  return new Date(row.expires_at).getTime() <= now.getTime();
}
