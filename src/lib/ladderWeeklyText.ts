/**
 * Rendering for the weekly ladder narrative (US-604).
 *
 * `summarizeLadderWeek` decides which sentences a week earns; this turns those
 * decisions into copy. Kept separate and `t`-injected so the counting module
 * stays free of wording, and so the same lines can be rendered into the card,
 * the PDF and the share text without three versions of the prose.
 *
 * List joining goes through `Intl.ListFormat` rather than a hardcoded " and ",
 * so switching locale localizes the connectives too (US-347).
 */

import { RUNG_META, type Rung } from './exposureLadder';
import type { LadderFoodMove, LadderWeekSummary } from './ladderWeekly';

/** Minimal shape of i18next's `t`, so this module does not depend on it. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface LadderWeeklyText {
  title: string;
  headline: string;
  lines: string[];
}

/** Beyond this many foods a sentence stops being prose and becomes a list. */
const MAX_NAMED_FOODS = 3;

function rungLabel(t: Translate, rung: Rung): string {
  return t(`foodLadder.rungs.${rung}`, { defaultValue: RUNG_META[rung].label });
}

/**
 * `Intl.ListFormat` is ES2021 and the project's lib is ES2020, so it is
 * reached through a narrow declared shape rather than by widening the lib for
 * one call (or reaching for `any`).
 */
interface ListFormatLike {
  format(items: string[]): string;
}
type ListFormatCtor = new (
  locale: string,
  options?: { style?: string; type?: string }
) => ListFormatLike;

function joinList(items: string[], locale: string): string {
  if (items.length <= 1) return items[0] ?? '';
  const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat;
  if (!ListFormat) return items.join(', ');
  try {
    return new ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    // An unknown locale tag would throw; a readable list beats an exception.
    return items.join(', ');
  }
}

function namedFoods(
  t: Translate,
  locale: string,
  foods: LadderFoodMove[],
  describe: (move: LadderFoodMove) => string
): string {
  const shown = foods.slice(0, MAX_NAMED_FOODS).map(describe);
  const extra = foods.length - shown.length;
  if (extra > 0) shown.push(t('foodLadder.weekly.andMore', { count: extra }));
  return joinList(shown, locale);
}

export function renderLadderWeekly(
  summary: LadderWeekSummary,
  t: Translate,
  opts: { kidName: string; locale?: string }
): LadderWeeklyText {
  const locale = opts.locale ?? 'en';
  const name = opts.kidName.trim() || t('foodLadder.weekly.defaultChild');

  const headline =
    summary.headline.kind === 'empty_week'
      ? t('foodLadder.weekly.headlineEmpty', { name })
      : t(
          summary.headline.advanced > 0
            ? 'foodLadder.weekly.headlineAdvanced'
            : 'foodLadder.weekly.headline',
          {
            name,
            exposures: t('foodLadder.weekly.exposureCount', { count: summary.headline.exposures }),
            foods: t('foodLadder.weekly.foodCount', { count: summary.headline.foods }),
            advanced: summary.headline.advanced,
          }
        );

  const lines = summary.narrative.map((line) => {
    switch (line.kind) {
      case 'moved_up':
        return t('foodLadder.weekly.movedUp', {
          foods: namedFoods(t, locale, line.foods, (m) =>
            t('foodLadder.weekly.moveWithRungs', {
              food: m.foodName,
              from: rungLabel(t, m.fromRung),
              to: rungLabel(t, m.toRung),
            })
          ),
        });
      case 'mastered':
        return t('foodLadder.weekly.mastered', {
          foods: namedFoods(t, locale, line.foods, (m) => m.foodName),
          count: line.foods.length,
        });
      case 'held':
        return t('foodLadder.weekly.held', {
          foods: namedFoods(t, locale, line.foods, (m) =>
            t('foodLadder.weekly.moveAtRung', { food: m.foodName, rung: rungLabel(t, m.toRung) })
          ),
        });
      case 'backed_off':
        return t('foodLadder.weekly.backedOff', {
          foods: namedFoods(t, locale, line.foods, (m) =>
            t('foodLadder.weekly.moveToRung', { food: m.foodName, rung: rungLabel(t, m.toRung) })
          ),
        });
      case 'no_advancement':
        return t('foodLadder.weekly.noAdvancement', { name });
      case 'nothing_logged':
        return t('foodLadder.weekly.nothingLogged', { name });
      case 'mastered_total':
        return t('foodLadder.weekly.masteredTotal', { count: line.count });
    }
  });

  return { title: t('foodLadder.weekly.title'), headline, lines };
}
