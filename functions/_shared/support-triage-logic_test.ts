/**
 * Unit tests for the support triage classification-to-escalation mapping (US-490).
 * Run with: `deno test functions/_shared/support-triage-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classificationToEscalation,
  type TicketClassification,
} from './support-triage-logic.ts';

const base: TicketClassification = {
  category: 'other',
  sentiment: 'neutral',
  priority: 'low',
  tier: 1,
};

Deno.test('routine ticket -> no escalation', () => {
  assertEquals(classificationToEscalation(base), null);
  assertEquals(classificationToEscalation({ ...base, category: 'how_to', priority: 'medium' }), null);
});

Deno.test('urgent priority -> tier 3 high', () => {
  const e = classificationToEscalation({ ...base, priority: 'urgent' });
  assertEquals(e?.tier, 3);
  assertEquals(e?.severity, 'high');
  assertEquals(e?.reasons, ['urgent priority']);
});

Deno.test('account_data category -> tier 3 high', () => {
  const e = classificationToEscalation({ ...base, category: 'account_data' });
  assertEquals(e?.tier, 3);
  assertEquals(e?.severity, 'high');
});

Deno.test('angry sentiment -> tier 2 medium', () => {
  const e = classificationToEscalation({ ...base, sentiment: 'angry' });
  assertEquals(e?.tier, 2);
  assertEquals(e?.severity, 'medium');
  assertEquals(e?.reasons, ['angry sentiment']);
});

Deno.test('billing category -> tier 2 medium', () => {
  const e = classificationToEscalation({ ...base, category: 'billing' });
  assertEquals(e?.tier, 2);
  assertEquals(e?.severity, 'medium');
});

Deno.test('multiple conditions -> highest tier, all reasons', () => {
  const e = classificationToEscalation({
    category: 'billing',
    sentiment: 'angry',
    priority: 'urgent',
    tier: 3,
  });
  assertEquals(e?.tier, 3);
  assertEquals(e?.severity, 'high');
  // urgent + angry + billing all recorded
  assertEquals(e?.reasons.includes('urgent priority'), true);
  assertEquals(e?.reasons.includes('angry sentiment'), true);
  assertEquals(e?.reasons.includes('billing issue'), true);
});
