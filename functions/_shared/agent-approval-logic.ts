/**
 * Pure builders for draft-first approvals and escalations (US-479).
 *
 * The runtime's requestApproval()/escalate() delegate row construction here so
 * the important policy decision — draft vs auto-approve, and the audit entry
 * written for each path — is unit-testable without a database or network.
 *
 * No esm.sh imports: tests run offline.
 */

export interface AutonomyPolicy {
  /** Action types the agent is allowed to auto-approve (still executed by the executor). */
  autoExecute?: string[];
  [key: string]: unknown;
}

export type ApprovalStatus = 'draft' | 'approved';

/** Draft by default; 'approved' only when the policy allowlists this action type. */
export function resolveApprovalStatus(
  policy: AutonomyPolicy | null | undefined,
  actionType: string,
): ApprovalStatus {
  const list = policy?.autoExecute;
  if (Array.isArray(list) && list.includes(actionType)) return 'approved';
  return 'draft';
}

export interface ApprovalInsert {
  run_id: string | null;
  agent_id: string | null;
  action_type: string;
  payload: unknown;
  status: ApprovalStatus;
  expires_at: string | null;
}

export interface EscalationInsert {
  run_id: string | null;
  agent_id: string | null;
  tier: number;
  severity: string;
  domain: string | null;
  title: string;
  context: unknown;
  status: 'open';
}

export interface AuditInsert {
  actor: string;
  action: string;
  subject_type: string;
  detail: unknown;
}

export interface BuildApprovalParams {
  agentId: string | null;
  agentName: string;
  runId: string | null;
  actionType: string;
  payload?: unknown;
  expiresInHours?: number;
  autonomyPolicy?: AutonomyPolicy | null;
}

/**
 * Build the agent_approvals row and its audit entry. When the policy
 * auto-approves the action type the row is created 'approved' and audited as
 * 'auto-approved by policy'; otherwise a 'draft' audited as 'approval_requested'.
 */
export function buildApproval(
  params: BuildApprovalParams,
  now: Date,
): { approval: ApprovalInsert; audit: AuditInsert } {
  const status = resolveApprovalStatus(params.autonomyPolicy, params.actionType);
  const expiresAt =
    typeof params.expiresInHours === 'number'
      ? new Date(now.getTime() + params.expiresInHours * 3_600_000).toISOString()
      : null;

  return {
    approval: {
      run_id: params.runId,
      agent_id: params.agentId,
      action_type: params.actionType,
      payload: params.payload ?? {},
      status,
      expires_at: expiresAt,
    },
    audit: {
      actor: params.agentName,
      action: status === 'approved' ? 'auto-approved by policy' : 'approval_requested',
      subject_type: 'agent_approval',
      detail: { action_type: params.actionType, status },
    },
  };
}

export interface BuildEscalationParams {
  agentId: string | null;
  agentName: string;
  runId: string | null;
  tier: number;
  severity: string;
  domain?: string | null;
  title: string;
  context?: unknown;
}

/** Build the agent_escalations row (always status 'open') and its audit entry. */
export function buildEscalation(
  params: BuildEscalationParams,
  _now: Date,
): { escalation: EscalationInsert; audit: AuditInsert } {
  return {
    escalation: {
      run_id: params.runId,
      agent_id: params.agentId,
      tier: params.tier,
      severity: params.severity,
      domain: params.domain ?? null,
      title: params.title,
      context: params.context ?? {},
      status: 'open',
    },
    audit: {
      actor: params.agentName,
      action: 'escalated',
      subject_type: 'agent_escalation',
      detail: { tier: params.tier, severity: params.severity, domain: params.domain ?? null },
    },
  };
}
