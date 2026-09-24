/**
 * Calendar-day arithmetic for the Food Tracker ladder UI.
 *
 * Ladder dates are plain 'YYYY-MM-DD' keys in the parent's calendar. Passing
 * one to `new Date(iso)` parses it as UTC midnight, which is the previous
 * evening anywhere west of Greenwich, so "tomorrow" would read as "today".
 * Everything here works on the calendar parts instead.
 */

import { addIsoDays, toISODate } from '@/lib/date-utils';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since the epoch for a 'YYYY-MM-DD' key, or null when it is not one. */
function dayNumber(iso: string): number | null {
  const m = ISO_DATE.exec(iso.slice(0, 10));
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** Whole calendar days from `today` to `iso` (negative when in the past). */
export function daysBetween(today: string, iso: string): number | null {
  const a = dayNumber(today);
  const b = dayNumber(iso);
  return a === null || b === null ? null : b - a;
}

/** The local calendar date as 'YYYY-MM-DD', from local parts. */
export function localIsoDate(now: Date = new Date()): string {
  return toISODate(now);
}

/** `iso` shifted by `days` calendar days; a malformed key comes back unchanged. */
export function addDays(iso: string, days: number): string {
  return dayNumber(iso) === null ? iso : addIsoDays(iso, days);
}

/**
 * "today", "tomorrow", "in 3 days", "yesterday": relative to `today`, in the
 * given language. Falls back to the raw key when either date is malformed.
 */
export function formatRelativeDay(iso: string, today: string, language: string): string {
  const diff = daysBetween(today, iso);
  if (diff === null) return iso;
  try {
    return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(diff, 'day');
  } catch {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(diff, 'day');
  }
}
