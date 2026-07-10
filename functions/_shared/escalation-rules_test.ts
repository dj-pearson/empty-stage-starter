/**
 * Unit tests for the declarative escalation rules engine (US-492).
 * Run with: `deno test functions/_shared/escalation-rules_test.ts`
 *
 * Covers each SEEDED rule plus the no-match case.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  evaluateEscalationRules,
  topEscalation,
  type EscalationRule,
  type RuleInput,
} from './escalation-rules.ts';

// Mirror of the seeded rules (see 20260709000009_escalation_rules.sql).
const RULES: EscalationRule[] = [
  {
    id: 'billing',
    domain: 'customer_service',
    condition: { any: [{ field: 'category', in: ['billing'] }, { anyKeyword: ['refund'] }] },
    tier: 2,
    severity: 'medium',
    enabled: true,
    description: 'Billing or refund request',
  },
  {
    id: 'legal',
    domain: 'customer_service',
    condition: {
      any: [
        { field: 'category', in: ['account_data'] },
        { anyKeyword: ['legal', 'data deletion', 'delete my account', 'gdpr', 'ccpa'] },
      ],
    },
    tier: 3,
    severity: 'high',
    enabled: true,
    description: 'Legal or data-deletion request',
  },
  {
    id: 'security',
    domain: 'security',
    condition: { anyKeyword: ['breach', 'hacked', 'vulnerability', 'data leak'] },
    tier: 3,
    severity: 'critical',
    enabled: true,
    description: 'Security concern',
  },
  {
    id: 'angry',
    domain: 'customer_service',
    condition: { field: 'sentiment', equals: 'angry' },
    tier: 2,
    severity: 'medium',
    enabled: true,
    description: 'Angry customer',
  },
  {
    id: 'sla',
    domain: 'customer_service',
    condition: { olderThanHours: 24, statusIn: ['new', 'triaged', 'awaiting_reply'] },
    tier: 2,
    severity: 'medium',
    enabled: true,
    description: 'No reply after 24h (SLA breach)',
  },
];

const base: RuleInput = { category: 'how_to', sentiment: 'neutral', priority: 'low', status: 'triaged', text: 'how do i add a kid', ageHours: 0 };
const ids = (i: RuleInput) => evaluateEscalationRules(i, RULES).map((m) => m.rule_id);

Deno.test('billing category OR refund keyword', () => {
  assertEquals(ids({ ...base, category: 'billing' }), ['billing']);
  assertEquals(ids({ ...base, text: 'i want a refund please' }), ['billing']);
});

Deno.test('legal / data-deletion via category or keyword', () => {
  assertEquals(ids({ ...base, category: 'account_data' }), ['legal']);
  assertEquals(ids({ ...base, text: 'please delete my account under gdpr' }).includes('legal'), true);
});

Deno.test('security keywords -> critical tier 3', () => {
  const m = evaluateEscalationRules({ ...base, text: 'i think there was a data breach' }, RULES);
  assertEquals(m[0].rule_id, 'security');
  assertEquals(m[0].tier, 3);
  assertEquals(m[0].severity, 'critical');
});

Deno.test('angry sentiment', () => {
  assertEquals(ids({ ...base, sentiment: 'angry' }), ['angry']);
});

Deno.test('SLA: old ticket in an owed status', () => {
  assertEquals(ids({ ...base, ageHours: 30, status: 'awaiting_reply' }), ['sla']);
  // Not owed (awaiting_user) or too recent -> no SLA match.
  assertEquals(ids({ ...base, ageHours: 30, status: 'awaiting_user' }), []);
  assertEquals(ids({ ...base, ageHours: 5, status: 'triaged' }), []);
});

Deno.test('no-match case', () => {
  assertEquals(ids(base), []);
});

Deno.test('topEscalation: highest tier/severity wins, all reasons kept', () => {
  const matches = evaluateEscalationRules(
    { ...base, category: 'billing', sentiment: 'angry', text: 'refund and a breach' },
    RULES,
  );
  const top = topEscalation(matches);
  assertEquals(top?.tier, 3);
  assertEquals(top?.severity, 'critical');
  assertEquals(top!.reasons.length >= 2, true);
});

Deno.test('topEscalation: null when nothing matched', () => {
  assertEquals(topEscalation([]), null);
});

Deno.test('disabled rules are ignored', () => {
  const disabled = RULES.map((r) => (r.id === 'angry' ? { ...r, enabled: false } : r));
  assertEquals(
    evaluateEscalationRules({ ...base, sentiment: 'angry' }, disabled).map((m) => m.rule_id),
    [],
  );
});
