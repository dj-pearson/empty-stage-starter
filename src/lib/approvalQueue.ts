/**
 * Pure helpers for the agent approval queue (US-484).
 *
 * Kept free of React and Supabase so the bulk-approve gate and the
 * per-action-type field extraction are unit-testable (see approvalQueue.test.ts).
 */

export type ActionType = 'send_email' | 'social_webhook' | 'github_issue' | string;

export interface ApprovalLike {
  id: string;
  action_type: ActionType;
  payload: Record<string, unknown> | null;
}

/** Read a string field from a payload, tolerating missing/non-string values. */
export function payloadString(payload: Record<string, unknown> | null, key: string): string {
  const v = payload?.[key];
  return typeof v === 'string' ? v : '';
}

/** Is this approval flagged as templated (safe for bulk approval)? */
export function isTemplated(payload: Record<string, unknown> | null): boolean {
  return payload?.templated === true;
}

/**
 * Bulk-approve is allowed only when every selected row shares the same
 * action_type AND is flagged templated:true. Ad-hoc (non-templated) drafts must
 * be reviewed one at a time.
 */
export function canBulkApprove(
  selected: ApprovalLike[],
): { ok: boolean; reason?: string } {
  if (selected.length < 2) {
    return { ok: false, reason: 'select at least two drafts' };
  }
  const firstType = selected[0].action_type;
  if (!selected.every((a) => a.action_type === firstType)) {
    return { ok: false, reason: 'all selected drafts must share the same action type' };
  }
  if (!selected.every((a) => isTemplated(a.payload))) {
    return { ok: false, reason: 'all selected drafts must be templated' };
  }
  return { ok: true };
}

/** The editable payload fields for each known action type. */
export const EDITABLE_FIELDS: Record<string, string[]> = {
  send_email: ['subject', 'body'],
  social_webhook: ['caption'],
  github_issue: ['title', 'body'],
};

/**
 * Merge edited field values back into a payload, preserving every other key.
 * `send_email` bodies live under `body` but some drafts use `html`; when the
 * original used `html`, the edit is written back to `html` too so the executor
 * (which reads html ?? body) stays consistent.
 */
export function applyEdits(
  payload: Record<string, unknown> | null,
  edits: Record<string, string>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(payload ?? {}) };
  for (const [key, value] of Object.entries(edits)) {
    next[key] = value;
    if (key === 'body' && typeof next.html === 'string') {
      next.html = value;
    }
  }
  return next;
}
