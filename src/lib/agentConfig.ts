/**
 * Pure agent-config validation + helpers for the config UI (US-515).
 *
 * Dependency-free so the cron/cap validation and the autonomy-policy allowlist
 * transforms are unit-testable in isolation.
 */

/** Outward-facing action types an agent can be allowed to auto-approve. */
export const KNOWN_ACTION_TYPES = [
  'send_email',
  'social_webhook',
  'github_issue',
  'content_topic',
  'blog_post',
  'pr_comment',
] as const;

export type ActionType = (typeof KNOWN_ACTION_TYPES)[number];

/** Selectable models for an agent (kept in sync with the platform's Claude tier). */
export const AGENT_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-5',
  'claude-opus-4-8',
] as const;

/**
 * Validate a 5-field cron expression (minute hour day-of-month month day-of-week).
 * Accepts `*`, ranges (`1-5`), lists (`1,2,3`), and steps (`*\/5`, `1-30/2`) within
 * each field's numeric bounds. Deliberately strict — the dispatcher parses these.
 */
export function isValidCron(expr: string): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return false;
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) return false;

  const bounds: Array<[number, number]> = [
    [0, 59], // minute
    [0, 23], // hour
    [1, 31], // day of month
    [1, 12], // month
    [0, 6], // day of week
  ];

  return fields.every((field, i) => isValidCronField(field, bounds[i][0], bounds[i][1]));
}

function isValidCronField(field: string, min: number, max: number): boolean {
  // Comma-separated list of terms; each term is a value/range with optional step.
  return field.split(',').every((term) => isValidCronTerm(term, min, max));
}

function isValidCronTerm(term: string, min: number, max: number): boolean {
  if (term === '') return false;
  const [range, stepStr, ...rest] = term.split('/');
  if (rest.length > 0) return false; // more than one '/'
  if (stepStr !== undefined) {
    const step = Number(stepStr);
    if (!Number.isInteger(step) || step <= 0) return false;
  }
  if (range === '*') return true;

  const [loStr, hiStr, ...extra] = range.split('-');
  if (extra.length > 0) return false;
  const lo = Number(loStr);
  if (!inBounds(lo, min, max)) return false;
  if (hiStr === undefined) return true; // single value
  const hi = Number(hiStr);
  return inBounds(hi, min, max) && hi >= lo;
}

function inBounds(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

export interface CapValidation {
  ok: boolean;
  value?: number;
  error?: string;
}

/** A daily cost cap must be a finite, non-negative number. */
export function validateCap(input: string | number): CapValidation {
  const n = typeof input === 'number' ? input : Number(input.trim());
  if (input === '' || Number.isNaN(n)) return { ok: false, error: 'notANumber' };
  if (!Number.isFinite(n)) return { ok: false, error: 'notFinite' };
  if (n < 0) return { ok: false, error: 'negative' };
  return { ok: true, value: n };
}

/** The action types currently allowlisted for auto-approval in a policy. */
export function getAllowlist(policy: Record<string, unknown> | null | undefined): string[] {
  const list = (policy as { autoExecute?: unknown } | null | undefined)?.autoExecute;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Return a new policy object with `actionType` added to / removed from the
 * autoExecute allowlist. Preserves any other policy keys.
 */
export function toggleAllowlist(
  policy: Record<string, unknown> | null | undefined,
  actionType: string,
  on: boolean,
): Record<string, unknown> {
  const base = policy && typeof policy === 'object' ? { ...policy } : {};
  const current = new Set(getAllowlist(policy));
  if (on) current.add(actionType);
  else current.delete(actionType);
  return { ...base, autoExecute: [...current].sort() };
}
