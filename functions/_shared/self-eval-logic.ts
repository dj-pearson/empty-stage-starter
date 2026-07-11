/**
 * Pure per-agent quality aggregation for the self-eval agent (US-514).
 *
 * DB-free: takes the week's agent_feedback rows (+ per-agent cost) and computes
 * approval rate, edit rate, average edit distance, top rejection reasons, and
 * cost per approved action. Unit-testable against fixtures.
 */

export interface FeedbackRecord {
  agent_id: string | null;
  agent_name?: string | null;
  decision: 'approved' | 'edited' | 'rejected';
  edit_distance: number | null;
  rejection_reason: string | null;
}

export interface AgentQualityMetrics {
  agentId: string;
  agentName: string;
  total: number;
  approved: number; // approved + edited (an edit is still an accepted action)
  edited: number;
  rejected: number;
  /** (approved + edited) / total. */
  approvalRate: number;
  /** edited / total. */
  editRate: number;
  /** Mean edit distance over edited actions; null when none were edited. */
  avgEditDistance: number | null;
  topRejectionReasons: Array<{ reason: string; count: number }>;
  /** Cost per accepted (approved+edited) action; null when none accepted. */
  costPerApproved: number | null;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Normalize a rejection reason for grouping (trim + lowercase + collapse ws). */
export function normalizeReason(reason: string): string {
  return reason.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Top-N rejection reasons by frequency (ties broken alphabetically). */
export function topRejectionReasons(reasons: string[], n = 3): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of reasons) {
    const key = normalizeReason(r);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([reason, count]) => ({ reason, count }));
}

/**
 * Aggregate feedback into per-agent metrics. `costByAgent` maps agent_id → total
 * agent spend for the window (used for cost-per-approved-action).
 */
export function aggregateFeedback(
  records: FeedbackRecord[],
  costByAgent: Record<string, number> = {},
): AgentQualityMetrics[] {
  const groups = new Map<string, FeedbackRecord[]>();
  for (const r of records) {
    if (!r.agent_id) continue;
    const arr = groups.get(r.agent_id) ?? [];
    arr.push(r);
    groups.set(r.agent_id, arr);
  }

  const out: AgentQualityMetrics[] = [];
  for (const [agentId, rows] of groups) {
    const approvedOnly = rows.filter((r) => r.decision === 'approved').length;
    const edited = rows.filter((r) => r.decision === 'edited').length;
    const rejected = rows.filter((r) => r.decision === 'rejected').length;
    const total = rows.length;
    const accepted = approvedOnly + edited;

    const editDistances = rows
      .filter((r) => r.decision === 'edited' && typeof r.edit_distance === 'number')
      .map((r) => r.edit_distance as number);
    const avgEditDistance = editDistances.length
      ? round(editDistances.reduce((s, x) => s + x, 0) / editDistances.length)
      : null;

    const cost = costByAgent[agentId] ?? 0;

    out.push({
      agentId,
      agentName: rows.find((r) => r.agent_name)?.agent_name ?? agentId,
      total,
      approved: accepted,
      edited,
      rejected,
      approvalRate: total ? round(accepted / total) : 0,
      editRate: total ? round(edited / total) : 0,
      avgEditDistance,
      topRejectionReasons: topRejectionReasons(
        rows.filter((r) => r.decision === 'rejected' && r.rejection_reason).map((r) => r.rejection_reason as string),
      ),
      costPerApproved: accepted > 0 ? round(cost / accepted) : null,
    });
  }

  // Worst approval rate first — the agents most in need of prompt work.
  return out.sort((a, b) => a.approvalRate - b.approvalRate || b.total - a.total);
}
