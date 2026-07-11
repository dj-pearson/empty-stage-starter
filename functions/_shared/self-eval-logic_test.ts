/**
 * Unit tests for the self-eval aggregation (US-514).
 * Run with: `deno test functions/_shared/self-eval-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  aggregateFeedback,
  topRejectionReasons,
  normalizeReason,
  type FeedbackRecord,
} from './self-eval-logic.ts';

const rec = (over: Partial<FeedbackRecord>): FeedbackRecord => ({
  agent_id: 'a1',
  agent_name: 'blog-writer',
  decision: 'approved',
  edit_distance: null,
  rejection_reason: null,
  ...over,
});

Deno.test('normalizeReason trims, lowercases, collapses whitespace', () => {
  assertEquals(normalizeReason('  Too   Long  '), 'too long');
});

Deno.test('topRejectionReasons ranks by frequency then alphabetically', () => {
  const top = topRejectionReasons(['too long', 'Too long', 'off brand', 'wrong tone', 'off brand']);
  assertEquals(top, [
    { reason: 'off brand', count: 2 },
    { reason: 'too long', count: 2 },
    { reason: 'wrong tone', count: 1 },
  ]);
});

Deno.test('aggregateFeedback computes rates, edit distance, and cost per approved', () => {
  const records: FeedbackRecord[] = [
    rec({ decision: 'approved' }),
    rec({ decision: 'edited', edit_distance: 10 }),
    rec({ decision: 'edited', edit_distance: 20 }),
    rec({ decision: 'rejected', rejection_reason: 'off brand' }),
  ];
  const [m] = aggregateFeedback(records, { a1: 6 });
  assertEquals(m.total, 4);
  assertEquals(m.approved, 3); // approved + edited
  assertEquals(m.edited, 2);
  assertEquals(m.rejected, 1);
  assertEquals(m.approvalRate, 0.75);
  assertEquals(m.editRate, 0.5);
  assertEquals(m.avgEditDistance, 15);
  assertEquals(m.costPerApproved, 2); // 6 / 3 accepted
  assertEquals(m.topRejectionReasons, [{ reason: 'off brand', count: 1 }]);
});

Deno.test('avgEditDistance is null when nothing was edited', () => {
  const [m] = aggregateFeedback([rec({ decision: 'approved' }), rec({ decision: 'rejected', rejection_reason: 'x' })]);
  assertEquals(m.avgEditDistance, null);
});

Deno.test('costPerApproved is null when nothing was accepted', () => {
  const [m] = aggregateFeedback([rec({ decision: 'rejected', rejection_reason: 'x' })], { a1: 5 });
  assertEquals(m.approved, 0);
  assertEquals(m.costPerApproved, null);
  assertEquals(m.approvalRate, 0);
});

Deno.test('records without an agent_id are ignored', () => {
  const out = aggregateFeedback([rec({ agent_id: null })]);
  assertEquals(out.length, 0);
});

Deno.test('multiple agents are sorted worst-approval-rate first', () => {
  const records: FeedbackRecord[] = [
    // a1: 1 approved / 1 = 100%
    rec({ agent_id: 'a1', agent_name: 'good', decision: 'approved' }),
    // a2: 0 approved / 2 = 0%
    rec({ agent_id: 'a2', agent_name: 'bad', decision: 'rejected', rejection_reason: 'x' }),
    rec({ agent_id: 'a2', agent_name: 'bad', decision: 'rejected', rejection_reason: 'y' }),
  ];
  const out = aggregateFeedback(records);
  assertEquals(out.map((m) => m.agentName), ['bad', 'good']);
});
