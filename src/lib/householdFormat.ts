/**
 * Pure formatting helpers shared by the Household page, its dialogs and /join.
 *
 * Intl formatters are costly to build, so each is cached per locale at module
 * level. Nothing here touches React or the DOM.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
  let fmt = relativeFormatters.get(locale);
  if (!fmt) {
    fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    relativeFormatters.set(locale, fmt);
  }
  return fmt;
}

function dateFormatter(locale: string): Intl.DateTimeFormat {
  let fmt = dateFormatters.get(locale);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' });
    dateFormatters.set(locale, fmt);
  }
  return fmt;
}

/** Milliseconds since epoch, or NaN for anything Date cannot parse. */
function parseTime(iso: string | null | undefined): number {
  if (typeof iso !== 'string' || iso.trim() === '') return Number.NaN;
  return new Date(iso).getTime();
}

/**
 * "in 30 minutes", "in 3 hours", "in 2 days" (or the past forms). Returns ''
 * for an unparseable time so the caller can hide the label. A past time gets
 * the formatter's past value; deciding that means "expired" is the caller's job.
 */
export function formatRelativeFromNow(iso: string, locale: string, now: number = Date.now()): string {
  const time = parseTime(iso);
  if (Number.isNaN(time)) return '';
  const diff = time - now;
  const abs = Math.abs(diff);
  const fmt = relativeFormatter(locale);
  if (abs < HOUR_MS) return fmt.format(Math.round(diff / MINUTE_MS), 'minute');
  if (abs < DAY_MS) return fmt.format(Math.round(diff / HOUR_MS), 'hour');
  return fmt.format(Math.round(diff / DAY_MS), 'day');
}

/** "Jan 5, 2026" in en-US. Returns '' for an unparseable time. */
export function formatJoinedDate(iso: string, locale: string): string {
  const time = parseTime(iso);
  if (Number.isNaN(time)) return '';
  return dateFormatter(locale).format(time);
}

/** True when the time has passed, or when it cannot be parsed (fail closed). */
export function isExpired(iso: string, now: number = Date.now()): boolean {
  const time = parseTime(iso);
  if (Number.isNaN(time)) return true;
  return time <= now;
}

/**
 * Up to two uppercase initials from the words in `name`; the first letter of
 * `fallback` when the name is empty or missing.
 */
export function initialsFor(name: string | null, fallback: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    return words
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? '')
      .join('')
      .toUpperCase();
  }
  return (Array.from(fallback.trim())[0] ?? '').toUpperCase();
}
