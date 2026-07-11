/**
 * Unit tests for the nurture engine logic (US-498).
 * Run with: `deno test functions/_shared/nurture-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeNextStepAt,
  shouldEnroll,
  decideStepAction,
  advanceEnrollment,
  signEmailToken,
  verifyEmailToken,
  type NurtureSequence,
  type NurtureStep,
} from './nurture-logic.ts';

const NOW = new Date('2026-07-10T00:00:00Z');
const seq: NurtureSequence = {
  id: 's1',
  name: 'onboarding',
  trigger_event: 'signup',
  enabled: true,
  steps: [
    { delay_hours: 0, template_key: 'welcome' },
    { delay_hours: 24, template_key: 'add_kid', exit_on_events: ['first_kid_added'] },
    { delay_hours: 48, template_key: 'first_plan', exit_on_events: ['first_plan_created'] },
  ],
};
const noFlags = { emailSuppressed: false, hasOpenTicket: false, recentNurtureSent: false };

Deno.test('computeNextStepAt', () => {
  assertEquals(computeNextStepAt(24, NOW), '2026-07-11T00:00:00.000Z');
  assertEquals(computeNextStepAt(0, NOW), '2026-07-10T00:00:00.000Z');
});

Deno.test('shouldEnroll: enabled + not already active', () => {
  assertEquals(shouldEnroll(seq, false), true);
  assertEquals(shouldEnroll(seq, true), false); // already enrolled
  assertEquals(shouldEnroll({ ...seq, enabled: false }, false), false);
});

Deno.test('decideStepAction: send when nothing blocks', () => {
  assertEquals(decideStepAction(seq.steps[0], [], noFlags), 'send');
});

Deno.test('decideStepAction: exit when the step exit event fired', () => {
  assertEquals(decideStepAction(seq.steps[1], ['first_kid_added'], noFlags), 'exit');
});

Deno.test('decideStepAction: suppress on unsubscribe / open ticket / recent send', () => {
  assertEquals(decideStepAction(seq.steps[0], [], { ...noFlags, emailSuppressed: true }), 'suppress');
  assertEquals(decideStepAction(seq.steps[0], [], { ...noFlags, hasOpenTicket: true }), 'suppress');
  assertEquals(decideStepAction(seq.steps[0], [], { ...noFlags, recentNurtureSent: true }), 'suppress');
});

Deno.test('decideStepAction: unsubscribe beats exit; exit beats ticket/frequency', () => {
  // unsubscribe wins even if exit event present
  assertEquals(decideStepAction(seq.steps[1], ['first_kid_added'], { ...noFlags, emailSuppressed: true }), 'suppress');
  // exit wins over open ticket
  assertEquals(decideStepAction(seq.steps[1], ['first_kid_added'], { ...noFlags, hasOpenTicket: true }), 'exit');
});

Deno.test('advanceEnrollment: mid-sequence schedules next; last completes', () => {
  const mid = advanceEnrollment({ current_step: 0 }, seq.steps, NOW);
  assertEquals(mid.current_step, 1);
  assertEquals(mid.status, 'active');
  assertEquals(mid.next_step_at, '2026-07-11T00:00:00.000Z'); // +24h

  const last = advanceEnrollment({ current_step: 2 }, seq.steps, NOW);
  assertEquals(last.status, 'completed');
  assertEquals(last.next_step_at, null);
});

Deno.test('unsubscribe token round-trips and rejects tampering', async () => {
  const t = await signEmailToken('User@Example.com', 'sec');
  // normalized to lowercase
  assertEquals(await verifyEmailToken(t, 'sec'), 'user@example.com');
  assertEquals(await verifyEmailToken(t, 'other'), null);
  assertEquals(await verifyEmailToken('garbage', 'sec'), null);
});
