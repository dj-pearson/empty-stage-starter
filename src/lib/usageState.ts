/**
 * Where one usage meter sits against its plan limit, and how to read the
 * timestamps get_usage_stats returns. Pure, so the billing page, the upgrade
 * prompts and the tests all agree on what "near" and "full" mean.
 */

export type UsageState = 'unlimited' | 'not_included' | 'ok' | 'near' | 'full' | 'over';

/**
 * 'count' is a standing total (children, pantry foods); 'quota' resets on a
 * schedule (AI coach questions per day, food tracker entries per month). The
 * thresholds are the same today; the kind is part of the signature so a caller
 * never has to guess which one it is holding.
 */
export type UsageKind = 'count' | 'quota';

export function usageState(current: number, limit: number | null, _kind: UsageKind): UsageState {
  // NULL in subscription_plans means the plan sets no cap.
  if (limit === null) return 'unlimited';
  // 0 means the plan does not include the feature at all. It is never 'full':
  // a family that has used nothing of a feature they don't have is not at a
  // limit they can wait out.
  if (limit <= 0) return 'not_included';
  if (current > limit) return 'over';
  if (current === limit) return 'full';
  const remaining = limit - current;
  if (remaining <= Math.max(1, Math.ceil(limit * 0.2))) return 'near';
  return 'ok';
}

/**
 * Parse a timestamp from the database.
 *
 * The DB clock is UTC. get_usage_stats builds resets_at as
 * `(CURRENT_DATE + INTERVAL '1 day')::TEXT`, which renders as
 * '2026-09-25 00:00:00' with no zone, and `new Date()` would read that as
 * local time (and Safari refuses the space entirely). A string without a zone
 * is therefore taken as UTC. ISO strings that carry a zone ('Z' or an offset)
 * are parsed as given. Anything else returns null.
 */
export function parseServerTimestamp(s: string | null | undefined): Date | null {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(trimmed);
  if (!m) return null;
  const [, date, time, zone] = m;
  let iso = `${date}T${time ?? '00:00:00'}`;
  if (!zone) {
    iso += 'Z';
  } else if (/^[+-]\d{2}$/.test(zone)) {
    // Postgres prints a whole-hour offset as '+00'; Date wants '+00:00'.
    iso += `${zone}:00`;
  } else if (/^[+-]\d{4}$/.test(zone)) {
    iso += `${zone.slice(0, 3)}:${zone.slice(3)}`;
  } else {
    iso += zone.toUpperCase();
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
