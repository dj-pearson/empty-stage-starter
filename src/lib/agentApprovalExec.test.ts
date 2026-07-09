import { describe, it, expect } from 'vitest';

/**
 * US-482: unit tests for approval-execution guards (status machine,
 * idempotency, expiry, retry/escalation). Pure logic shared with the Deno
 * approval-executor.
 */
import {
  canExecute,
  isExpired,
  currentAttempts,
  shouldEscalateAfterFailure,
  withExecSuccess,
  withExecFailure,
  MAX_EXEC_ATTEMPTS,
} from '../../supabase/functions/_shared/approval-exec';

const now = new Date('2026-07-09T12:00:00Z');

describe('canExecute (status transition guard)', () => {
  it('allows an approved row', () => {
    expect(canExecute('approved')).toEqual({ ok: true });
  });

  it('treats an already-executed row as idempotent no-op', () => {
    expect(canExecute('executed')).toEqual({ ok: false, alreadyExecuted: true });
  });

  it('refuses draft, rejected, and expired rows', () => {
    for (const s of ['draft', 'rejected', 'expired'] as const) {
      const g = canExecute(s);
      expect(g.ok).toBe(false);
      if (!g.ok && !g.alreadyExecuted) expect(g.reason).toContain(s);
    }
  });
});

describe('isExpired (sweep)', () => {
  it('is true for a draft past its expiry', () => {
    expect(isExpired('draft', '2026-07-09T11:00:00Z', now)).toBe(true);
  });

  it('is false for a draft not yet expired', () => {
    expect(isExpired('draft', '2026-07-09T13:00:00Z', now)).toBe(false);
  });

  it('never expires non-draft rows', () => {
    expect(isExpired('approved', '2000-01-01T00:00:00Z', now)).toBe(false);
    expect(isExpired('executed', '2000-01-01T00:00:00Z', now)).toBe(false);
  });

  it('is false with no/invalid expiry', () => {
    expect(isExpired('draft', null, now)).toBe(false);
    expect(isExpired('draft', 'nonsense', now)).toBe(false);
  });
});

describe('attempt counting + escalation', () => {
  it('reads current attempts (default 0)', () => {
    expect(currentAttempts(null)).toBe(0);
    expect(currentAttempts({})).toBe(0);
    expect(currentAttempts({ _exec: { attempts: 2 } })).toBe(2);
  });

  it('escalates only once the retry budget is exhausted', () => {
    expect(MAX_EXEC_ATTEMPTS).toBe(3);
    expect(shouldEscalateAfterFailure(1)).toBe(false);
    expect(shouldEscalateAfterFailure(2)).toBe(false);
    expect(shouldEscalateAfterFailure(3)).toBe(true);
  });
});

describe('payload merge helpers', () => {
  it('withExecSuccess records result + increments attempts + stamps time', () => {
    const out = withExecSuccess({ subject: 'Hi' }, { messageId: 'm1' }, now);
    expect(out.subject).toBe('Hi');
    expect(out._exec).toEqual({
      attempts: 1,
      result: { messageId: 'm1' },
      executedAt: '2026-07-09T12:00:00.000Z',
    });
  });

  it('withExecFailure increments attempts and records the error', () => {
    const first = withExecFailure({ subject: 'Hi' }, 'boom');
    expect(first.attempts).toBe(1);
    expect((first.payload._exec as { lastError: string }).lastError).toBe('boom');

    // A second failure builds on the first.
    const second = withExecFailure(first.payload, 'boom again');
    expect(second.attempts).toBe(2);
  });
});
