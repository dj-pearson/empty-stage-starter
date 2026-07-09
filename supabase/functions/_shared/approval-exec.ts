/**
 * Agentic OS — pure approval-execution guards (US-482)
 *
 * Dependency-free so they are shared by the Deno approval-executor and the
 * Node/Vitest unit tests. These enforce the status machine and idempotency;
 * the executor performs the actual side effect exactly once.
 *
 * Status machine: draft -> approved -> executed. Drafts past expiry -> expired.
 * Rejected is terminal. Only 'approved' may execute; 'executed' is a no-op.
 */

export type ApprovalStatus = 'draft' | 'approved' | 'rejected' | 'executed' | 'expired';
export type ActionType = 'send_email' | 'social_webhook' | 'github_issue';

export const MAX_EXEC_ATTEMPTS = 3;

export type ExecuteGuard =
  | { ok: true }
  | { ok: false; alreadyExecuted: true }
  | { ok: false; alreadyExecuted: false; reason: string };

/** Decide whether an approval in `status` may be executed now. */
export function canExecute(status: ApprovalStatus): ExecuteGuard {
  if (status === 'executed') return { ok: false, alreadyExecuted: true };
  if (status === 'approved') return { ok: true };
  return {
    ok: false,
    alreadyExecuted: false,
    reason: `cannot execute an approval in status '${status}' (must be 'approved')`,
  };
}

/** A draft whose expiry has passed should be swept to 'expired'. */
export function isExpired(
  status: ApprovalStatus,
  expiresAt: string | Date | null | undefined,
  now: Date,
): boolean {
  if (status !== 'draft' || expiresAt == null) return false;
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return false;
  return exp.getTime() < now.getTime();
}

interface ExecMeta {
  attempts?: number;
  lastError?: string;
  result?: unknown;
  executedAt?: string;
}

/** Read the execution attempt count already recorded on a payload. */
export function currentAttempts(payload: unknown): number {
  const meta = (payload as { _exec?: ExecMeta } | null)?._exec;
  return typeof meta?.attempts === 'number' ? meta.attempts : 0;
}

/** After a failed attempt, has the retry budget been exhausted? */
export function shouldEscalateAfterFailure(attempts: number): boolean {
  return attempts >= MAX_EXEC_ATTEMPTS;
}

/** Merge a successful execution result into the approval payload. */
export function withExecSuccess(payload: unknown, result: unknown, now: Date): Record<string, unknown> {
  const base = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const prev = (base._exec as ExecMeta) ?? {};
  return {
    ...base,
    _exec: { ...prev, attempts: (prev.attempts ?? 0) + 1, result, executedAt: now.toISOString() },
  };
}

/** Merge a failed-attempt record (incremented count + error) into the payload. */
export function withExecFailure(payload: unknown, error: string): {
  payload: Record<string, unknown>;
  attempts: number;
} {
  const base = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const prev = (base._exec as ExecMeta) ?? {};
  const attempts = (prev.attempts ?? 0) + 1;
  return {
    payload: { ...base, _exec: { ...prev, attempts, lastError: error } },
    attempts,
  };
}
