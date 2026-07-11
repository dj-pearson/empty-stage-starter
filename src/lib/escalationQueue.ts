/**
 * Pure helpers for the agent escalation queue (US-485).
 *
 * React/Supabase-free so the tier/severity ordering and the context-flattening
 * are unit-testable (see escalationQueue.test.ts).
 */

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface EscalationLike {
  id: string;
  tier: number;
  severity: string;
  domain: string | null;
  title: string;
  context: unknown;
  status: string;
  created_at: string;
}

/** Higher number = more urgent. Unknown severities sort last. */
export const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function severityRank(severity: string): number {
  return SEVERITY_RANK[severity] ?? 0;
}

/**
 * Sort escalations by tier desc, then severity desc, then created_at desc
 * (newest first). Pure and stable-ish: returns a new array, never mutates.
 */
export function sortEscalations<T extends EscalationLike>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;
    const sev = severityRank(b.severity) - severityRank(a.severity);
    if (sev !== 0) return sev;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export interface ContextPair {
  key: string;
  value: string;
}

/** Humanize a snake_case / camelCase key into a Title Case label. */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Render a single value compactly (objects/arrays as JSON, primitives as text). */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Flatten a context jsonb into readable key/value pairs for the detail view,
 * instead of dumping raw JSON. Non-object contexts become a single "Detail"
 * pair. Nested objects/arrays are rendered as compact JSON values.
 */
export function flattenContext(context: unknown): ContextPair[] {
  if (context === null || context === undefined) return [];
  if (typeof context !== 'object' || Array.isArray(context)) {
    return [{ key: 'Detail', value: renderValue(context) }];
  }
  return Object.entries(context as Record<string, unknown>).map(([key, value]) => ({
    key: humanizeKey(key),
    value: renderValue(value),
  }));
}

/** Distinct, sorted domains present in a set of escalations (for the filter). */
export function distinctDomains(rows: EscalationLike[]): string[] {
  const set = new Set<string>();
  for (const r of rows) if (r.domain) set.add(r.domain);
  return [...set].sort();
}
