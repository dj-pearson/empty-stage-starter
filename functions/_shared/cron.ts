/**
 * Minimal standard 5-field cron evaluation for the agent dispatcher (US-478).
 *
 * Fields: minute hour day-of-month month day-of-week
 * Supports: wildcard, step (slash-n), range (a-b), and list (a,b,c) forms.
 * Day-of-week: 0-6 (Sun-Sat), with 7 also accepted as Sunday.
 * When BOTH day-of-month and day-of-week are restricted, a date matches if
 * EITHER matches (standard Vixie-cron semantics).
 *
 * All evaluation is in UTC so due-checks are stable regardless of server TZ.
 *
 * Pure module — no imports — so it is unit-testable without network access.
 */

export interface CronField {
  /** Sorted set of allowed values, or null for `*` (any). */
  values: Set<number> | null;
  /** True when the field was `*` (used for dom/dow OR semantics). */
  isWildcard: boolean;
}

export interface CronExpr {
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
}

function parseField(raw: string, min: number, max: number): CronField {
  if (raw === '*') return { values: null, isWildcard: true };

  const values = new Set<number>();
  for (const part of raw.split(',')) {
    // step form: <range-or-*>/<n>
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const [, rangePart, stepStr] = stepMatch;
      const step = Number(stepStr);
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`Invalid cron step '${part}'`);
      }
      let lo = min;
      let hi = max;
      if (rangePart !== '*') {
        const rm = rangePart.match(/^(\d+)(?:-(\d+))?$/);
        if (!rm) throw new Error(`Invalid cron range '${rangePart}'`);
        lo = Number(rm[1]);
        hi = rm[2] !== undefined ? Number(rm[2]) : max;
      }
      for (let v = lo; v <= hi; v += step) values.add(v);
      continue;
    }

    // range form: a-b
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const lo = Number(rangeMatch[1]);
      const hi = Number(rangeMatch[2]);
      for (let v = lo; v <= hi; v++) values.add(v);
      continue;
    }

    // single value
    if (!/^\d+$/.test(part)) throw new Error(`Invalid cron value '${part}'`);
    values.add(Number(part));
  }

  // Normalize: dow 7 -> 0 (Sunday).
  if (min === 0 && max === 6 && values.has(7)) {
    values.delete(7);
    values.add(0);
  }

  for (const v of values) {
    if (v < min || v > max) throw new Error(`Cron value ${v} out of range ${min}-${max}`);
  }
  return { values, isWildcard: false };
}

/** Parse a 5-field cron expression. Throws on malformed input. */
export function parseCron(expr: string): CronExpr {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${parts.length}: '${expr}'`);
  }
  const [minute, hour, dom, month, dow] = parts;
  return {
    minute: parseField(minute, 0, 59),
    hour: parseField(hour, 0, 23),
    dom: parseField(dom, 1, 31),
    month: parseField(month, 1, 12),
    dow: parseField(dow, 0, 6),
  };
}

function fieldMatches(field: CronField, value: number): boolean {
  return field.values === null || field.values.has(value);
}

/** True when `date` (to the minute, UTC) satisfies the cron expression. */
export function matchesCron(expr: string | CronExpr, date: Date): boolean {
  const c = typeof expr === 'string' ? parseCron(expr) : expr;
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dom = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const dow = date.getUTCDay(); // 0-6, Sun-Sat

  if (!fieldMatches(c.minute, minute)) return false;
  if (!fieldMatches(c.hour, hour)) return false;
  if (!fieldMatches(c.month, month)) return false;

  // dom/dow OR semantics when both restricted; AND (both must pass) when one is wildcard.
  const domRestricted = !c.dom.isWildcard;
  const dowRestricted = !c.dow.isWildcard;
  const domOk = fieldMatches(c.dom, dom);
  const dowOk = fieldMatches(c.dow, dow);
  if (domRestricted && dowRestricted) return domOk || dowOk;
  return domOk && dowOk;
}

const MINUTE_MS = 60_000;

/**
 * The most recent minute at or before `now` that matches the cron, or null if
 * none within `maxLookbackDays`. Steps backward minute-by-minute (bounded).
 */
export function previousMatch(
  expr: string | CronExpr,
  now: Date,
  maxLookbackDays = 366,
): Date | null {
  const c = typeof expr === 'string' ? parseCron(expr) : expr;
  // Floor to the start of the current minute.
  const start = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;
  const limit = maxLookbackDays * 24 * 60;
  for (let i = 0; i <= limit; i++) {
    const d = new Date(start - i * MINUTE_MS);
    if (matchesCron(c, d)) return d;
  }
  return null;
}

/**
 * Is an agent due to run now?
 *
 * Due iff the most recent scheduled slot at/before `now` is strictly after the
 * last run — i.e. a scheduled occurrence has elapsed that we have not run yet.
 * A null/empty cron is never due (manual/event-driven agents).
 */
export function isDue(
  cronExpr: string | null | undefined,
  lastRunAt: string | Date | null | undefined,
  now: Date,
): boolean {
  if (!cronExpr || cronExpr.trim() === '') return false;
  const prev = previousMatch(cronExpr, now);
  if (!prev) return false;
  if (!lastRunAt) return true;
  const last = lastRunAt instanceof Date ? lastRunAt : new Date(lastRunAt);
  return last.getTime() < prev.getTime();
}
