/**
 * Pure logic for the bug-report-to-GitHub-issue agent (US-493).
 *
 * Free of runtime/DB/network: the duplicate fingerprint and the issue-body
 * markdown are unit-testable in isolation.
 */

/**
 * Normalize a ticket subject into a duplicate-detection fingerprint:
 * lowercase, strip a leading "bug:"/"[bug]" prefix, drop punctuation, and
 * collapse whitespace. Two reports of the same problem map to the same string.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^\s*(\[bug\]|bug:)\s*/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Is this fingerprint already present among known (open) fingerprints? */
export function isDuplicateFingerprint(fingerprint: string, existing: string[]): boolean {
  return existing.includes(fingerprint);
}

export interface BugDraft {
  title: string;
  repro_steps: string;
  expected: string;
  actual: string;
  device_platform?: string | null;
  severity: string;
}

/** Render the structured bug draft into a GitHub-issue markdown body. */
export function buildIssueBody(draft: BugDraft, ticketReference: string): string {
  const lines = [
    '### Steps to reproduce',
    draft.repro_steps.trim() || '_Not provided_',
    '',
    '### Expected',
    draft.expected.trim() || '_Not provided_',
    '',
    '### Actual',
    draft.actual.trim() || '_Not provided_',
  ];
  if (draft.device_platform && draft.device_platform.trim()) {
    lines.push('', '### Device / platform', draft.device_platform.trim());
  }
  lines.push('', `**Severity:** ${draft.severity}`, '', `_Filed from support ticket ${ticketReference}._`);
  return lines.join('\n');
}
