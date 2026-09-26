/**
 * Wording for the care report, shared by the PDF and the /care/:token page so
 * the two say the same thing about the same numbers. `t` is passed in; the
 * appLocale import registers the copy it resolves.
 */
import '@/i18n/appLocale';
import { RUNG_META, type Rung } from '@/lib/exposureLadder';
import type { CareReport } from '@/lib/careReport';
import type { CareReportPdfStrings } from '@/lib/careReportPdf';

export type Translate = (key: string, vars?: Record<string, unknown>) => string;

/** A 'YYYY-MM-DD' day in the reader's locale, never shifted by time zone. */
export function formatReportDay(iso: string, language: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeZone: 'UTC' };
  try {
    return new Intl.DateTimeFormat(language || undefined, opts).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, opts).format(date);
  }
}

export function reportRangeLabel(report: Pick<CareReport, 'from' | 'to'>, language: string): string {
  return `${formatReportDay(report.from, language)} - ${formatReportDay(report.to, language)}`;
}

/** The summary as sentences. Refusals and distress are stated, not hidden. */
export function careSummaryLines(report: CareReport, t: Translate): string[] {
  const s = report.summary;
  return [
    t('careReport.summary.days', { defaultValue: 'Logged on {{count}} days', count: s.daysLogged }),
    t('careReport.summary.offers', {
      defaultValue: '{{count}} offers across {{foods}} foods',
      count: s.offers,
      foods: s.foodsOffered,
    }),
    t('careReport.summary.outcomes', {
      defaultValue: 'Accepted (ate or partly ate): {{accepted}} · Refused: {{refused}} · Distress: {{distress}}',
      accepted: s.accepted,
      refused: s.refused,
      distress: s.distress,
    }),
    t('careReport.summary.newFoods', {
      defaultValue: '{{count}} foods offered for the first time',
      count: s.newFoodsOffered,
    }),
  ];
}

export function rungName(rung: Rung, t: Translate): string {
  return t(`foodLadder.rungs.${rung}`, { defaultValue: RUNG_META[rung].label });
}

export function statusName(status: string, t: Translate): string {
  switch (status) {
    case 'active':
      return t('foodLadder.sections.active.title');
    case 'paused':
      return t('foodLadder.sections.paused.title');
    case 'backed_off':
      return t('foodLadder.sections.backed_off.title');
    case 'mastered':
      return t('foodLadder.sections.mastered.title');
    default:
      return status;
  }
}

export function newFoodLine(food: CareReport['newFoods'][number], t: Translate, language: string): string {
  return t('careReport.newFoodLine', {
    defaultValue: '{{food}}: first offered {{date}}, {{offers}} offers, {{accepted}} accepted',
    food: food.name,
    date: formatReportDay(food.firstOfferedOn, language),
    offers: food.offers,
    accepted: food.accepted,
  });
}

export function careReportPdfStrings(report: CareReport, t: Translate, language: string): CareReportPdfStrings {
  const percent = new Intl.NumberFormat(language || undefined, { style: 'percent', maximumFractionDigits: 0 });
  return {
    title: t('careReport.title', { defaultValue: 'Care report' }),
    rangeLabel: reportRangeLabel(report, language),
    summaryHeading: t('careReport.headings.summary', { defaultValue: 'Summary' }),
    summaryLines: careSummaryLines(report, t),
    safeHeading: t('careReport.headings.safe', { defaultValue: 'Safe foods now' }),
    safeEmpty: t('careReport.empty.safe', { defaultValue: 'None recorded yet.' }),
    newHeading: t('careReport.headings.new', { defaultValue: 'New foods offered' }),
    newEmpty: t('careReport.empty.new', { defaultValue: 'No first-time offers in this range.' }),
    newLine: (food) => newFoodLine(food, t, language),
    ladderHeading: t('careReport.headings.ladder', { defaultValue: 'Exposure ladder' }),
    ladderEmpty: t('careReport.empty.ladder', { defaultValue: 'No foods on the ladder.' }),
    currentRungLabel: t('foodLadder.report.currentRung'),
    historyLabel: t('foodLadder.report.history'),
    attemptsLabel: t('foodLadder.report.attempts'),
    prepsLabel: t('foodLadder.report.preps'),
    outcomes: {
      success: t('foodLadder.report.outcomeSuccess'),
      partial: t('foodLadder.report.outcomePartial'),
      refused: t('foodLadder.report.outcomeRefused'),
      tantrum: t('foodLadder.report.outcomeTantrum'),
    },
    statusLabel: (status) => statusName(status, t),
    rungLabel: (rung) => rungName(rung, t),
    formatDate: (iso) => formatReportDay(iso, language),
    formatPercent: (rate) => percent.format(rate),
    notesHeading: t('careReport.headings.notes', { defaultValue: "Parent's notes" }),
    disclaimer: t('foodLadder.disclaimer'),
    generatedNote: t('careReport.generatedNote', {
      defaultValue: 'Made in EatPal from what the family logged. The child appears by first name only.',
    }),
  };
}
