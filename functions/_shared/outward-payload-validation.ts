/**
 * Payload allowlisting for outward-facing approval execution (US-522).
 *
 * Even though outward actions are draft-first and human-approved, the executor
 * validates repo/recipient at execution time as defense-in-depth: an approver
 * skimming a draft should not be able to (accidentally or via a hidden payload)
 * fire a GitHub write to an arbitrary repo or an email to a header-injected
 * recipient. Pure + dependency-free so it is unit-testable.
 */

/** Parse a comma-separated repo allowlist ("owner/name"), lower-cased. */
export function parseRepoAllowlist(configured?: string | null): string[] {
  if (!configured) return [];
  return configured
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True if `repo` ("owner/name") is in the allowlist. An empty allowlist rejects
 * everything (fail closed — the caller must configure GITHUB_ALLOWED_REPOS or
 * GITHUB_REPO).
 */
export function isAllowedRepo(repo: string | undefined | null, allow: string[]): boolean {
  if (!repo || allow.length === 0) return false;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return false;
  return allow.includes(repo.toLowerCase());
}

const EMAIL_RE = /^[^\s@,;:<>"]+@[^\s@,;:<>"]+\.[^\s@,;:<>"]+$/;

/** True if a single recipient is a syntactically valid, injection-free email. */
export function isValidEmailAddress(addr: unknown): boolean {
  if (typeof addr !== 'string') return false;
  if (/[\r\n\t]/.test(addr)) return false; // header-injection guard
  return EMAIL_RE.test(addr.trim());
}

/**
 * Validate a send_email `to` field: a single address or a non-empty array of
 * addresses, each valid. Returns false for anything else (objects, empties,
 * header-injection attempts).
 */
export function isValidEmailRecipient(to: unknown): boolean {
  if (Array.isArray(to)) {
    return to.length > 0 && to.every(isValidEmailAddress);
  }
  return isValidEmailAddress(to);
}
