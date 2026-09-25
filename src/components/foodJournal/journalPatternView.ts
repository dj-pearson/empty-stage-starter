/**
 * The patterns card's copy, built once and read two ways: JournalSummary
 * renders it, and the page's Share report prints it as plain lines. Keeping
 * both on one builder means the report a clinician reads says exactly what
 * the parent saw on screen.
 */
import '@/i18n/appLocale';
import { RUNGS } from '@/lib/exposureLadder';
import type { AmountTrend, JournalPatterns, Translate } from '@/lib/journalReport';
import type { KidProgressSummary } from '@/lib/kidProgress';

export interface KidPatternInput {
  kidId: string;
  name: string;
  patterns: JournalPatterns;
  progress: KidProgressSummary | undefined;
}

export interface KidPatternView {
  kidId: string;
  name: string;
  newFoods: string | null;
  closest: string | null;
  mostOffered: string[];
  allergens: string[];
  reactions: string[];
  trend: { value: Exclude<AmountTrend, null>; text: string } | null;
  empty: boolean;
}

export function buildKidPatternView(
  input: KidPatternInput,
  t: Translate,
  formatDate: (isoDate: string) => string
): KidPatternView {
  const { patterns, progress } = input;
  const unknown = t('foodJournal.unknownFood', { defaultValue: 'Unknown food' });

  const newFoods =
    progress && progress.newFoodsTried > 0
      ? t('foodJournal.page.patterns.newFoods', { count: progress.newFoodsTried, defaultValue: '{{count}} new foods tried' })
      : null;

  const top = progress?.activeLadder[0];
  const closest = top
    ? t('foodJournal.page.patterns.closest', {
        name: top.foodName ?? unknown,
        step: top.rung + 1,
        total: RUNGS.length,
        defaultValue: 'Closest to a win: {{name}}, step {{step}} of {{total}}',
      })
    : null;

  const mostOffered = patterns.mostOffered
    .filter((m) => m.offered > 1)
    .map((m) =>
      t('foodJournal.page.patterns.mostOffered', {
        name: m.name ?? unknown,
        offered: m.offered,
        tasted: m.ate + m.tasted,
        defaultValue: '{{name}}: offered {{offered}}, tasted {{tasted}}',
      })
    );

  const allergens = patterns.allergenHits.map((hit) => {
    const line = t('foodJournal.page.patterns.allergen', {
      allergen: hit.allergen,
      count: hit.count,
      defaultValue: '{{allergen}}: {{count}} meals',
    });
    return hit.names.length > 0 ? `${line} (${hit.names.join(', ')})` : line;
  });

  const reactions = patterns.reactions.map((r) =>
    t('foodJournal.page.patterns.reactionLine', {
      date: formatDate(r.date),
      name: r.name ?? unknown,
      text: r.text,
      defaultValue: '{{date}}, {{name}}: {{text}}',
    })
  );

  let trend: KidPatternView['trend'] = null;
  if (patterns.amountTrend) {
    const word =
      patterns.amountTrend === 'up'
        ? t('foodJournal.page.patterns.trendUp', { defaultValue: 'growing' })
        : patterns.amountTrend === 'down'
          ? t('foodJournal.page.patterns.trendDown', { defaultValue: 'shrinking' })
          : t('foodJournal.page.patterns.trendFlat', { defaultValue: 'steady' });
    trend = {
      value: patterns.amountTrend,
      text: t('foodJournal.page.patterns.trendLabel', { trend: word, defaultValue: 'Portions: {{trend}}' }),
    };
  }

  const empty =
    !newFoods && !closest && mostOffered.length === 0 && allergens.length === 0 && reactions.length === 0 && !trend;

  return { kidId: input.kidId, name: input.name, newFoods, closest, mostOffered, allergens, reactions, trend, empty };
}

/** The view as report lines, headed by the kid when there is more than one. */
export function patternViewLines(view: KidPatternView, t: Translate, withHeading: boolean): string[] {
  if (view.empty) return [];
  const out: string[] = [];
  out.push(
    withHeading
      ? t('foodJournal.page.patterns.titleKid', { name: view.name, defaultValue: 'Patterns for {{name}}' })
      : t('foodJournal.page.patterns.title', { defaultValue: 'Patterns' })
  );
  if (view.newFoods) out.push(`- ${view.newFoods}`);
  if (view.closest) out.push(`- ${view.closest}`);
  if (view.trend) out.push(`- ${view.trend.text}`);
  if (view.mostOffered.length > 0) {
    out.push(`- ${t('foodJournal.page.patterns.mostOfferedTitle', { defaultValue: 'Offered most' })}`);
    for (const line of view.mostOffered) out.push(`    ${line}`);
  }
  if (view.allergens.length > 0) {
    out.push(`- ${t('foodJournal.page.patterns.allergenTitle', { defaultValue: 'Allergen exposures' })}`);
    for (const line of view.allergens) out.push(`    ${line}`);
  }
  if (view.reactions.length > 0) {
    out.push(`- ${t('foodJournal.page.patterns.reactionsTitle', { defaultValue: 'Reactions' })}`);
    for (const line of view.reactions) out.push(`    ${line}`);
  }
  return out;
}
