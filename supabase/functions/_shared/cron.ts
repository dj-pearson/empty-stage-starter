/**
 * Agentic OS — pure cron scheduling helpers (US-478)
 *
 * Dependency-free (no Deno / esm.sh imports) so it can be imported by BOTH
 * the Deno agent-dispatcher edge function and the Node/Vitest unit tests in
 * src/lib/agentSchedule.test.ts.
 *
 * Standard 5-field cron: `minute hour day-of-month month day-of-week`.
 * All evaluation is done in UTC — pg_cron on Supabase runs in UTC, and the
 * dispatcher compares against `agent_runs.started_at` which is stored UTC.
 */

export interface CronFields {
  minute: string;
  hour: string;
  dom: string; // day-of-month
  month: string;
  dow: string; // day-of-week (0-6, 0 = Sunday; 7 also accepted for Sunday)
}

/** Parse a 5-field cron string. Throws on the wrong number of fields. */
export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression (expected 5 fields): "${expr}"`);
  }
  const [minute, hour, dom, month, dow] = parts;
  return { minute, hour, dom, month, dow };
}

/** True if the given cron expression is syntactically valid. */
export function isValidCron(expr: string): boolean {
  try {
    const f = parseCron(expr);
    // Probe every field against its range so malformed tokens are rejected.
    fieldMatches(f.minute, 0, 0, 59);
    fieldMatches(f.hour, 0, 0, 23);
    fieldMatches(f.dom, 1, 1, 31);
    fieldMatches(f.month, 1, 1, 12);
    fieldMatches(f.dow, 0, 0, 7); // dow allows 0-7 (0 and 7 both = Sunday)
    return true;
  } catch {
    return false;
  }
}

/**
 * Does a single cron field match `value`?
 * Supports: star, step (slash-n), ranges (a-b, a-b/n), comma lists, and
 * single numbers. `min`/`max` bound the field's legal range (to expand star).
 */
export function fieldMatches(spec: string, value: number, min: number, max: number): boolean {
  for (const part of spec.split(',')) {
    if (partMatches(part, value, min, max)) return true;
  }
  return false;
}

function partMatches(part: string, value: number, min: number, max: number): boolean {
  let range = part;
  let step = 1;

  const slash = part.indexOf('/');
  if (slash !== -1) {
    range = part.slice(0, slash);
    step = Number(part.slice(slash + 1));
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Invalid step in cron field: "${part}"`);
    }
  }

  let lo: number;
  let hi: number;
  if (range === '*') {
    lo = min;
    hi = max;
  } else if (range.includes('-')) {
    const [a, b] = range.split('-');
    lo = Number(a);
    hi = Number(b);
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
      throw new Error(`Invalid range in cron field: "${part}"`);
    }
  } else {
    const n = Number(range);
    if (!Number.isInteger(n)) throw new Error(`Invalid number in cron field: "${part}"`);
    if (n < min || n > max) {
      throw new Error(`Cron field out of range: "${part}" (allowed ${min}-${max})`);
    }
    // A bare number with no step must match exactly.
    if (slash === -1) return n === value;
    lo = n;
    hi = max;
  }

  if (lo < min || hi > max || lo > hi) {
    throw new Error(`Cron field out of range: "${part}" (allowed ${min}-${max})`);
  }
  if (value < lo || value > hi) return false;
  return (value - lo) % step === 0;
}

/** Does the cron expression fire at the exact minute of `date` (UTC)? */
export function cronMatches(fields: CronFields, date: Date): boolean {
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dom = date.getUTCDate();
  const month = date.getUTCMonth() + 1; // JS months are 0-based
  let dow = date.getUTCDay(); // 0 = Sunday

  const minuteOk = fieldMatches(fields.minute, minute, 0, 59);
  const hourOk = fieldMatches(fields.hour, hour, 0, 23);
  const monthOk = fieldMatches(fields.month, month, 1, 12);
  if (!minuteOk || !hourOk || !monthOk) return false;

  // Normalize cron's optional 7-as-Sunday by also testing dow=7 form.
  const domRestricted = fields.dom.trim() !== '*';
  const dowRestricted = fields.dow.trim() !== '*';
  const domOk = fieldMatches(fields.dom, dom, 1, 31);
  const dowOk =
    fieldMatches(fields.dow, dow, 0, 7) ||
    (dow === 0 && fieldMatches(fields.dow, 7, 0, 7));

  // Vixie-cron semantics: when BOTH day fields are restricted, match on either.
  if (domRestricted && dowRestricted) return domOk || dowOk;
  return domOk && dowOk;
}

/**
 * The most recent minute at or before `from` at which `expr` fires, or null
 * if none within `maxLookbackDays`. Scans minute-by-minute (cheap integer
 * math); the dispatcher only calls this every few minutes.
 */
export function previousFireTime(expr: string, from: Date, maxLookbackDays = 366): Date | null {
  const fields = parseCron(expr);
  // Truncate to minute precision.
  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);
  const limitMinutes = maxLookbackDays * 24 * 60;
  for (let i = 0; i < limitMinutes; i++) {
    if (cronMatches(fields, cursor)) return new Date(cursor.getTime());
    cursor.setUTCMinutes(cursor.getUTCMinutes() - 1);
  }
  return null;
}

/**
 * Decide whether an agent is due to run now.
 *
 * Due when: it has a schedule, a scheduled fire time has occurred at or
 * before `now`, and that fire time is strictly after the agent's last run
 * (or it has never run). Agents with no schedule are never auto-dispatched.
 */
export function isAgentDue(
  scheduleCron: string | null | undefined,
  lastRunAt: string | Date | null | undefined,
  now: Date,
): boolean {
  if (!scheduleCron || !scheduleCron.trim()) return false;
  if (!isValidCron(scheduleCron)) return false;

  const prevFire = previousFireTime(scheduleCron, now);
  if (!prevFire) return false;

  if (lastRunAt == null) return true;
  const lastRun = lastRunAt instanceof Date ? lastRunAt : new Date(lastRunAt);
  if (Number.isNaN(lastRun.getTime())) return true; // unparseable → treat as never ran
  return prevFire.getTime() > lastRun.getTime();
}
