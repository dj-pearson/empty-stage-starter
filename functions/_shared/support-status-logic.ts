/**
 * Pure support-ticket lifecycle logic (US-494).
 *
 * The status-transition guard and the subject-embedded ticket token are free of
 * runtime/DB/network so they are fully unit-testable.
 */

export const SUPPORT_STATUSES = [
  'new',
  'triaged',
  'awaiting_reply',
  'awaiting_user',
  'resolved',
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/**
 * Allowed forward transitions in the Agentic OS support workflow:
 *   new → triaged (triage) | resolved (admin close)
 *   triaged → awaiting_reply (draft) | awaiting_user (admin reply) | resolved | new
 *   awaiting_reply → awaiting_user (reply sent) | resolved | new
 *   awaiting_user → new (user replied → re-triage) | awaiting_reply | resolved
 *   resolved → new (reopen on a new user reply)
 * A no-op (from === to) is always allowed.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  new: ['triaged', 'resolved'],
  triaged: ['awaiting_reply', 'awaiting_user', 'resolved', 'new'],
  awaiting_reply: ['awaiting_user', 'resolved', 'new'],
  awaiting_user: ['new', 'awaiting_reply', 'resolved'],
  resolved: ['new'],
};

export function canTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Subject-embedded ticket token: lets an inbound email reply be matched back to
// its ticket even without a reply-to address. Format: [EPT-<uuid>].
// ---------------------------------------------------------------------------

const TOKEN_RE = /\[EPT-([0-9a-fA-F-]{36})\]/;

/** Ensure the subject carries the ticket token exactly once. */
export function withTicketToken(subject: string, ticketId: string): string {
  if (parseTicketToken(subject) === ticketId) return subject;
  return `${subject} [EPT-${ticketId}]`;
}

/** Extract the ticket id from a subject line, or null if absent. */
export function parseTicketToken(subject: string): string | null {
  const m = subject.match(TOKEN_RE);
  return m ? m[1].toLowerCase() : null;
}
