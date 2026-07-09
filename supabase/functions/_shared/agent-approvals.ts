/**
 * Agentic OS — pure draft-first approval / escalation logic (US-479)
 *
 * Dependency-free so it is shared by the Deno agent-runtime and the
 * Node/Vitest unit tests. These builders decide the SHAPE of the rows that
 * requestApproval()/escalate() insert; the runtime does the actual inserts.
 *
 * Draft-first invariant: an approval is 'draft' unless the agent's
 * autonomy_policy explicitly allowlists the action type, in which case it is
 * created 'approved' (still executed only by the approval-executor, US-482).
 */

export interface AutonomyPolicy {
  /** Action types the agent may auto-approve (skips human review). */
  autoExecute?: string[];
  [key: string]: unknown;
}

export type ApprovalStatus = 'draft' | 'approved';

export interface ApprovalOutcome {
  status: ApprovalStatus;
  /** agent_audit_log.action for this approval path. */
  auditAction: string;
  /** review_note stored on an auto-approved row (null for a plain draft). */
  reviewNote: string | null;
}

export const DEFAULT_APPROVAL_TTL_HOURS = 72;

/** True when the policy allowlists auto-execution of `actionType`. */
export function isAutoExecuteAllowed(
  policy: AutonomyPolicy | null | undefined,
  actionType: string,
): boolean {
  const list = policy?.autoExecute;
  return Array.isArray(list) && list.includes(actionType);
}

/** Decide the approval status + audit label for an action under a policy. */
export function approvalOutcome(
  policy: AutonomyPolicy | null | undefined,
  actionType: string,
): ApprovalOutcome {
  if (isAutoExecuteAllowed(policy, actionType)) {
    return {
      status: 'approved',
      auditAction: 'agent.approval_auto_approved',
      reviewNote: 'auto-approved by policy',
    };
  }
  return { status: 'draft', auditAction: 'agent.approval_drafted', reviewNote: null };
}

/** ISO timestamp `hours` after `now`. */
export function expiresAtIso(now: Date, hours: number = DEFAULT_APPROVAL_TTL_HOURS): string {
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export interface ApprovalRow {
  run_id: string | null;
  agent_id: string | null;
  action_type: string;
  payload: unknown;
  status: ApprovalStatus;
  review_note: string | null;
  reviewed_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface BuildApprovalParams {
  runId: string | null;
  agentId: string | null;
  actionType: string;
  payload: unknown;
  policy: AutonomyPolicy | null | undefined;
  expiresInHours?: number;
}

/** Build the agent_approvals insert row for an approval request. */
export function buildApprovalRow(params: BuildApprovalParams, now: Date): ApprovalRow {
  const outcome = approvalOutcome(params.policy, params.actionType);
  return {
    run_id: params.runId,
    agent_id: params.agentId,
    action_type: params.actionType,
    payload: params.payload ?? {},
    status: outcome.status,
    review_note: outcome.reviewNote,
    // Auto-approved rows are stamped reviewed now; drafts await a human.
    reviewed_at: outcome.status === 'approved' ? now.toISOString() : null,
    expires_at: expiresAtIso(now, params.expiresInHours),
    created_at: now.toISOString(),
  };
}

export type EscalationTier = 2 | 3;
export type EscalationSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface EscalationRow {
  run_id: string | null;
  agent_id: string | null;
  tier: EscalationTier;
  severity: EscalationSeverity;
  domain: string | null;
  title: string | null;
  context: unknown;
  status: 'open';
  created_at: string;
}

export interface BuildEscalationParams {
  runId: string | null;
  agentId: string | null;
  tier: EscalationTier;
  severity: EscalationSeverity;
  domain?: string | null;
  title?: string | null;
  context?: unknown;
}

/** Build the agent_escalations insert row. Always 'open' on creation. */
export function buildEscalationRow(params: BuildEscalationParams, now: Date): EscalationRow {
  return {
    run_id: params.runId,
    agent_id: params.agentId,
    tier: params.tier,
    severity: params.severity,
    domain: params.domain ?? null,
    title: params.title ?? null,
    context: params.context ?? {},
    status: 'open',
    created_at: now.toISOString(),
  };
}

export interface AuditRow {
  actor: string;
  action: string;
  subject_type: string;
  subject_id: string | null;
  detail: unknown;
  created_at: string;
}

/** Build an agent_audit_log insert row. */
export function buildAuditRow(
  params: { actor: string; action: string; subjectType: string; subjectId: string | null; detail?: unknown },
  now: Date,
): AuditRow {
  return {
    actor: params.actor,
    action: params.action,
    subject_type: params.subjectType,
    subject_id: params.subjectId,
    detail: params.detail ?? {},
    created_at: now.toISOString(),
  };
}
