/**
 * Shared bits for the per-food history list and its sheet: the outcome label
 * key (with an English default) and a relative time for "last tried".
 */

/** i18n leaf under foodTracker.history.outcome for a stored outcome. */
export function outcomeLabelKey(outcome: string): string {
  return ['success', 'partial', 'refused', 'tantrum'].includes(outcome) ? outcome : 'unknown';
}

export const OUTCOME_LABEL_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  success: 'Took it',
  partial: 'Partway',
  refused: 'Not today',
  tantrum: 'Hard time',
  unknown: 'Not recorded',
});

const RELATIVE_STEPS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

/** "2 days ago", "yesterday", in the given locale. */
export function formatRelative(iso: string, locale: string, now: number = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const fmt = new Intl.RelativeTimeFormat(locale || undefined, { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(seconds) >= size) return fmt.format(Math.round(seconds / size), unit);
  }
  return fmt.format(0, 'minute');
}
