import { describe, it, expect } from 'vitest';

/**
 * US-479: unit tests for draft-first approval / escalation row builders.
 * Pure logic shared with the Deno agent-runtime.
 */
import {
  isAutoExecuteAllowed,
  approvalOutcome,
  expiresAtIso,
  buildApprovalRow,
  buildEscalationRow,
  buildAuditRow,
  DEFAULT_APPROVAL_TTL_HOURS,
} from '../../supabase/functions/_shared/agent-approvals';

const now = new Date('2026-07-09T10:00:00Z');

describe('isAutoExecuteAllowed', () => {
  it('is false when no policy or empty allowlist', () => {
    expect(isAutoExecuteAllowed(null, 'send_email')).toBe(false);
    expect(isAutoExecuteAllowed({}, 'send_email')).toBe(false);
    expect(isAutoExecuteAllowed({ autoExecute: [] }, 'send_email')).toBe(false);
  });

  it('is true only when the action type is allowlisted', () => {
    expect(isAutoExecuteAllowed({ autoExecute: ['send_email'] }, 'send_email')).toBe(true);
    expect(isAutoExecuteAllowed({ autoExecute: ['github_issue'] }, 'send_email')).toBe(false);
  });
});

describe('approvalOutcome', () => {
  it('defaults to a draft awaiting human review', () => {
    expect(approvalOutcome(null, 'send_email')).toEqual({
      status: 'draft',
      auditAction: 'agent.approval_drafted',
      reviewNote: null,
    });
  });

  it('auto-approves when the policy allowlists the action type', () => {
    expect(approvalOutcome({ autoExecute: ['send_email'] }, 'send_email')).toEqual({
      status: 'approved',
      auditAction: 'agent.approval_auto_approved',
      reviewNote: 'auto-approved by policy',
    });
  });
});

describe('expiresAtIso', () => {
  it('defaults to the 72h TTL', () => {
    expect(expiresAtIso(now)).toBe('2026-07-12T10:00:00.000Z');
    expect(DEFAULT_APPROVAL_TTL_HOURS).toBe(72);
  });

  it('honors a custom TTL', () => {
    expect(expiresAtIso(now, 1)).toBe('2026-07-09T11:00:00.000Z');
  });
});

describe('buildApprovalRow', () => {
  const params = {
    runId: 'run-1',
    agentId: 'agent-1',
    actionType: 'send_email',
    payload: { subject: 'Hi' },
  };

  it('builds a draft row by default (no reviewed_at)', () => {
    const row = buildApprovalRow({ ...params, policy: null }, now);
    expect(row.status).toBe('draft');
    expect(row.review_note).toBeNull();
    expect(row.reviewed_at).toBeNull();
    expect(row.action_type).toBe('send_email');
    expect(row.payload).toEqual({ subject: 'Hi' });
    expect(row.expires_at).toBe('2026-07-12T10:00:00.000Z');
  });

  it('builds an approved row stamped reviewed_at when policy allowlists it', () => {
    const row = buildApprovalRow({ ...params, policy: { autoExecute: ['send_email'] } }, now);
    expect(row.status).toBe('approved');
    expect(row.review_note).toBe('auto-approved by policy');
    expect(row.reviewed_at).toBe('2026-07-09T10:00:00.000Z');
  });

  it('defaults an empty payload to {}', () => {
    const row = buildApprovalRow({ ...params, payload: undefined, policy: null }, now);
    expect(row.payload).toEqual({});
  });
});

describe('buildEscalationRow', () => {
  it('builds an open escalation with defaults', () => {
    const row = buildEscalationRow(
      { runId: null, agentId: 'agent-1', tier: 3, severity: 'critical', title: 'Breach' },
      now,
    );
    expect(row).toEqual({
      run_id: null,
      agent_id: 'agent-1',
      tier: 3,
      severity: 'critical',
      domain: null,
      title: 'Breach',
      context: {},
      status: 'open',
      created_at: '2026-07-09T10:00:00.000Z',
    });
  });
});

describe('buildAuditRow', () => {
  it('builds an audit row for the draft path', () => {
    const row = buildAuditRow(
      {
        actor: 'support-triage',
        action: 'agent.approval_drafted',
        subjectType: 'agent_approval',
        subjectId: 'appr-1',
        detail: { actionType: 'send_email' },
      },
      now,
    );
    expect(row).toEqual({
      actor: 'support-triage',
      action: 'agent.approval_drafted',
      subject_type: 'agent_approval',
      subject_id: 'appr-1',
      detail: { actionType: 'send_email' },
      created_at: '2026-07-09T10:00:00.000Z',
    });
  });

  it('defaults detail to {}', () => {
    const row = buildAuditRow(
      { actor: 'x', action: 'y', subjectType: 'z', subjectId: null },
      now,
    );
    expect(row.detail).toEqual({});
  });
});
