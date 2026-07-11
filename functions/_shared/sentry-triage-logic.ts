/**
 * Pure logic for the Sentry error triage agent (US-506).
 * DB/network-free so fingerprinting, the crash-spike test, and issue-body
 * construction are unit-testable.
 */

export interface SentryEvent {
  fingerprint?: string[] | null;
  title?: string | null;
  culprit?: string | null;
  release?: string | null;
  route?: string | null;
  count?: number | null;
  level?: string | null;
  stack?: string | null;
}

/** Stable fingerprint for dedup: prefer Sentry's fingerprint, else culprit/title. */
export function sentryFingerprint(e: SentryEvent): string {
  const base =
    (Array.isArray(e.fingerprint) && e.fingerprint.length ? e.fingerprint.join(':') : '') ||
    e.culprit ||
    e.title ||
    'unknown';
  return base.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Crash-rate spike when the occurrence count meets the configured threshold. */
export function isCrashRateSpike(count: number | null | undefined, threshold: number): boolean {
  return typeof count === 'number' && count >= threshold;
}

/** Read the crash-spike threshold from the agent's autonomy_policy (default 100). */
export function crashSpikeThreshold(autonomyPolicy: Record<string, unknown> | null | undefined): number {
  const t = autonomyPolicy?.crash_spike_threshold;
  return typeof t === 'number' && t > 0 ? t : 100;
}

export interface Assessment {
  severity: 'low' | 'medium' | 'high' | 'critical';
  user_impact: string;
}

/** GitHub issue title for a triaged error. */
export function buildIssueTitle(e: SentryEvent): string {
  const t = (e.title ?? e.culprit ?? 'Unhandled error').slice(0, 120);
  return `[sentry] ${t}`;
}

/** GitHub issue body: stack, release, affected route, occurrence count, assessment. */
export function buildIssueBody(e: SentryEvent, a: Assessment): string {
  const lines = [
    `**Severity:** ${a.severity}`,
    `**User impact:** ${a.user_impact}`,
    '',
    `**Release:** ${e.release ?? 'unknown'}`,
    `**Affected route:** ${e.route ?? e.culprit ?? 'unknown'}`,
    `**Occurrences:** ${e.count ?? 1}`,
    '',
    '### Stack / context',
    '```',
    (e.stack ?? '(no stack captured)').slice(0, 4000),
    '```',
    '',
    '_Filed automatically from a Sentry alert._',
  ];
  return lines.join('\n');
}
