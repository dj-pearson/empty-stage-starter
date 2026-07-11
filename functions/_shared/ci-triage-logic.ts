/**
 * Pure logic for the CI failure triage agent (US-508).
 * DB/network-free so payload parsing, the failure fingerprint, and the
 * flake/real decision are unit-testable.
 */

export interface WorkflowRunInfo {
  repo: string | null;
  runId: number | null;
  conclusion: string | null;
  workflow: string | null;
  prNumber: number | null;
  headBranch: string | null;
}

/** Normalize a GitHub `workflow_run` webhook body. */
export function parseWorkflowRun(body: Record<string, unknown>): WorkflowRunInfo {
  const wr = (body.workflow_run ?? {}) as Record<string, unknown>;
  const repo = ((body.repository as { full_name?: string })?.full_name) ?? null;
  const prs = (wr.pull_requests as Array<{ number?: number }>) ?? [];
  return {
    repo,
    runId: typeof wr.id === 'number' ? wr.id : null,
    conclusion: (wr.conclusion as string) ?? null,
    workflow: (wr.name as string) ?? null,
    prNumber: prs[0]?.number ?? null,
    headBranch: (wr.head_branch as string) ?? null,
  };
}

export interface CiClassification {
  is_flake: boolean;
  failing_step: string;
  likely_cause: string;
  suggested_fix: string;
  confidence: 'low' | 'medium' | 'high';
}

/** A real failure drafts a PR comment; a flake is recorded only. */
export function classificationToAction(c: CiClassification): 'draft' | 'record' {
  return c.is_flake ? 'record' : 'draft';
}

/** Stable fingerprint for 24h dedup of identical real failures. */
export function failureFingerprint(info: { workflow: string | null; prNumber: number | null; failingStep: string }): string {
  return `${info.workflow ?? '?'}|${info.prNumber ?? '?'}|${info.failingStep}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Trim a job log to a bounded tail excerpt for the model. */
export function logExcerpt(log: string, maxChars = 6000): string {
  if (log.length <= maxChars) return log;
  return `…(truncated)…\n${log.slice(log.length - maxChars)}`;
}
