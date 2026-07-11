/**
 * Approval feedback recording for the agent feedback loop (US-514).
 *
 * Every approval decision (approve / edit / reject) writes an agent_feedback row
 * linked to the originating run, so the weekly self-eval agent can turn real
 * human feedback into per-agent quality metrics. When a draft was edited before
 * approval, the Levenshtein distance between the draft and the approved payload
 * is captured as a proxy for "how wrong" the agent's first attempt was.
 *
 * Like audit logging, these writes are best-effort: a failure must never block
 * the reviewer's actual decision.
 */

import { supabase } from '@/integrations/supabase/client';

export { levenshtein, payloadEditDistance } from './editDistance';

export interface ApprovalFeedback {
  approvalId: string;
  runId?: string | null;
  agentId?: string | null;
  actionType?: string | null;
  decision: 'approved' | 'edited' | 'rejected';
  /** Draft-vs-approved edit distance; only meaningful when decision is 'edited'. */
  editDistance?: number | null;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
}

export async function recordApprovalFeedback(fb: ApprovalFeedback): Promise<void> {
  try {
    await supabase.from('agent_feedback').insert({
      approval_id: fb.approvalId,
      run_id: fb.runId ?? null,
      agent_id: fb.agentId ?? null,
      action_type: fb.actionType ?? null,
      decision: fb.decision,
      edit_distance: fb.decision === 'edited' ? fb.editDistance ?? null : null,
      rejection_reason: fb.rejectionReason ?? null,
      reviewed_by: fb.reviewedBy ?? null,
    });
  } catch (err) {
    console.error('agent feedback write failed (non-blocking):', err);
  }
}
