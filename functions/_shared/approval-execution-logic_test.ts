/**
 * Unit tests for approval-execution logic (US-482).
 *
 * Run with: `deno test functions/_shared/approval-execution-logic_test.ts`
 *
 * Covers the status-transition guards, idempotency, attempt accounting, the
 * 3-strikes escalation threshold, and the expiry test — no DB or network.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decideExecution,
  readExecutionState,
  payloadWithSuccess,
  payloadWithFailure,
  shouldEscalateFailure,
  isExpired,
  MAX_EXECUTION_ATTEMPTS,
} from './approval-execution-logic.ts';

const NOW = new Date('2026-07-10T12:00:00Z');

// --- decideExecution (transition guards + idempotency) ---------------------

Deno.test('decideExecution: approved -> execute', () => {
  assertEquals(decideExecution('approved'), { action: 'execute' });
});

Deno.test('decideExecution: executed -> idempotent skip', () => {
  assertEquals(decideExecution('executed').action, 'skip');
});

Deno.test('decideExecution: draft/rejected/expired -> reject (illegal)', () => {
  assertEquals(decideExecution('draft').action, 'reject');
  assertEquals(decideExecution('rejected').action, 'reject');
  assertEquals(decideExecution('expired').action, 'reject');
});

Deno.test('decideExecution: unknown status -> reject', () => {
  assertEquals(decideExecution('bogus').action, 'reject');
});

// --- attempt accounting -----------------------------------------------------

Deno.test('readExecutionState: defaults to zero attempts', () => {
  assertEquals(readExecutionState(null).attempts, 0);
  assertEquals(readExecutionState({}).attempts, 0);
  assertEquals(readExecutionState({ _execution: { attempts: 2 } }).attempts, 2);
});

Deno.test('payloadWithSuccess: records result + executed_at, bumps attempts, keeps other fields', () => {
  const p = payloadWithSuccess({ subject: 'Hi', _execution: { attempts: 1 } }, { message_id: 'm1' }, NOW);
  assertEquals(p.subject, 'Hi');
  const ex = p._execution as Record<string, unknown>;
  assertEquals(ex.attempts, 2);
  assertEquals((ex.result as Record<string, unknown>).message_id, 'm1');
  assertEquals(ex.executed_at, '2026-07-10T12:00:00.000Z');
});

Deno.test('payloadWithFailure: increments attempts and records error', () => {
  const first = payloadWithFailure({ to: 'x' }, 'boom');
  assertEquals(first.attempts, 1);
  assertEquals((first.payload._execution as Record<string, unknown>).last_error, 'boom');

  const second = payloadWithFailure(first.payload, 'boom again');
  assertEquals(second.attempts, 2);
});

Deno.test('shouldEscalateFailure: escalates on the 3rd failure', () => {
  assertEquals(shouldEscalateFailure(1), false);
  assertEquals(shouldEscalateFailure(2), false);
  assertEquals(shouldEscalateFailure(MAX_EXECUTION_ATTEMPTS), true);
  assertEquals(shouldEscalateFailure(4), true);
});

Deno.test('failure accounting reaches escalation after exactly 3 attempts', () => {
  let payload: unknown = { to: 'x' };
  let attempts = 0;
  for (let i = 0; i < 3; i++) {
    const r = payloadWithFailure(payload, `err${i}`);
    payload = r.payload;
    attempts = r.attempts;
  }
  assertEquals(attempts, 3);
  assertEquals(shouldEscalateFailure(attempts), true);
});

// --- expiry sweep -----------------------------------------------------------

Deno.test('isExpired: draft past expiry is expired', () => {
  assertEquals(isExpired({ status: 'draft', expires_at: '2026-07-10T11:59:59Z' }, NOW), true);
});

Deno.test('isExpired: draft before expiry is not expired', () => {
  assertEquals(isExpired({ status: 'draft', expires_at: '2026-07-10T12:00:01Z' }, NOW), false);
});

Deno.test('isExpired: non-draft never expires via sweep', () => {
  assertEquals(isExpired({ status: 'approved', expires_at: '2020-01-01T00:00:00Z' }, NOW), false);
  assertEquals(isExpired({ status: 'executed', expires_at: '2020-01-01T00:00:00Z' }, NOW), false);
});

Deno.test('isExpired: null expiry never expires', () => {
  assertEquals(isExpired({ status: 'draft', expires_at: null }, NOW), false);
});
