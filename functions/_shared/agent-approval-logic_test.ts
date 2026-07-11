/**
 * Unit tests for draft-first approval/escalation builders (US-479).
 *
 * Run with: `deno test functions/_shared/agent-approval-logic_test.ts`
 *
 * Covers: draft created by default, auto-approve when the autonomy policy
 * allowlists the action type, and the audit entry written for each path —
 * with no DB or network.
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveApprovalStatus,
  buildApproval,
  buildEscalation,
  isOutwardActionType,
} from './agent-approval-logic.ts';

const NOW = new Date('2026-07-10T12:00:00Z');

Deno.test('resolveApprovalStatus: draft by default', () => {
  assertEquals(resolveApprovalStatus(null, 'send_email'), 'draft');
  assertEquals(resolveApprovalStatus({}, 'send_email'), 'draft');
  assertEquals(resolveApprovalStatus({ autoExecute: [] }, 'send_email'), 'draft');
  assertEquals(
    resolveApprovalStatus({ autoExecute: ['social_webhook'] }, 'send_email'),
    'draft',
  );
});

Deno.test('resolveApprovalStatus: approved when allowlisted (non-outward only)', () => {
  // Internal (no external side effect) actions may still auto-approve.
  assertEquals(
    resolveApprovalStatus({ autoExecute: ['content_topic'] }, 'content_topic'),
    'approved',
  );
});

Deno.test('resolveApprovalStatus: outward actions are ALWAYS draft, even if allowlisted (US-522)', () => {
  for (const t of ['send_email', 'github_issue', 'pr_comment', 'social_webhook', 'webhook']) {
    assert(isOutwardActionType(t));
    assertEquals(resolveApprovalStatus({ autoExecute: [t] }, t), 'draft');
  }
  // A non-outward internal action is not affected.
  assertEquals(isOutwardActionType('content_topic'), false);
});

Deno.test('buildApproval: default draft + approval_requested audit', () => {
  const { approval, audit } = buildApproval(
    {
      agentId: 'agent-1',
      agentName: 'support-answer',
      runId: 'run-1',
      actionType: 'send_email',
      payload: { subject: 'Hi' },
      expiresInHours: 48,
      autonomyPolicy: null,
    },
    NOW,
  );

  assertEquals(approval.status, 'draft');
  assertEquals(approval.action_type, 'send_email');
  assertEquals(approval.agent_id, 'agent-1');
  assertEquals(approval.run_id, 'run-1');
  assertEquals(approval.expires_at, '2026-07-12T12:00:00.000Z');
  assertEquals(audit.action, 'approval_requested');
  assertEquals(audit.subject_type, 'agent_approval');
  assertEquals(audit.actor, 'support-answer');
});

Deno.test('buildApproval: auto-approve when policy allowlists a NON-outward action', () => {
  const { approval, audit } = buildApproval(
    {
      agentId: 'agent-1',
      agentName: 'content-calendar',
      runId: 'run-2',
      actionType: 'content_topic',
      payload: {},
      autonomyPolicy: { autoExecute: ['content_topic'] },
    },
    NOW,
  );

  assertEquals(approval.status, 'approved');
  assertEquals(audit.action, 'auto-approved by policy');
});

Deno.test('buildApproval: outward action stays draft even when allowlisted (US-522)', () => {
  const { approval, audit } = buildApproval(
    {
      agentId: 'agent-1',
      agentName: 'weekly-digest',
      runId: 'run-2',
      actionType: 'send_email',
      payload: {},
      autonomyPolicy: { autoExecute: ['send_email'] },
    },
    NOW,
  );

  assertEquals(approval.status, 'draft');
  assertEquals(audit.action, 'approval_requested');
});

Deno.test('buildApproval: no expiry when expiresInHours omitted', () => {
  const { approval } = buildApproval(
    { agentId: 'a', agentName: 'x', runId: null, actionType: 'github_issue' },
    NOW,
  );
  assertEquals(approval.expires_at, null);
});

Deno.test('buildEscalation: always open + escalated audit', () => {
  const { escalation, audit } = buildEscalation(
    {
      agentId: 'agent-9',
      agentName: 'auth-anomaly',
      runId: null,
      tier: 3,
      severity: 'critical',
      domain: 'security',
      title: 'Credential stuffing detected',
      context: { ips: 3 },
    },
    NOW,
  );

  assertEquals(escalation.status, 'open');
  assertEquals(escalation.tier, 3);
  assertEquals(escalation.severity, 'critical');
  assertEquals(escalation.domain, 'security');
  assertEquals(audit.action, 'escalated');
  assertEquals(audit.subject_type, 'agent_escalation');
  assert(typeof escalation.title === 'string' && escalation.title.length > 0);
});
