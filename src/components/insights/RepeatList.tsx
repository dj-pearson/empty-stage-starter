import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { KidRepeats, RepeatItem } from '@/lib/insights';
import '@/i18n/appLocale';

/**
 * What a child has been served most often lately, meals and ingredients
 * apart. Presentational only: it never writes the fatigue snapshot (that is
 * VarietyFatigueBanner's job on the planner) and holds no state.
 */
export interface RepeatListProps {
  repeats: KidRepeats;
  kidName: string;
}

function countLine(t: TFunction, item: RepeatItem): string {
  if (item.shortWindowCount > 0) {
    return t('insightsVariety.repeats.thisWeek', {
      name: item.name,
      count: item.shortWindowCount,
      defaultValue: '{{name}}: {{count}}x this week',
    });
  }
  return t('insightsVariety.repeats.fourWeeks', {
    name: item.name,
    count: item.longWindowCount,
    defaultValue: '{{name}}: {{count}}x in 4 weeks',
  });
}

function Group({ title, items, t }: { title: string; items: readonly RepeatItem[]; t: TFunction }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="text-sm">
            {countLine(t, item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RepeatListImpl({ repeats, kidName }: RepeatListProps) {
  const { t } = useTranslation();
  if (repeats.meals.length === 0 && repeats.ingredients.length === 0) return null;
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div>
        <h3 className="text-base font-semibold">
          {t('insightsVariety.repeats.title', { defaultValue: 'On repeat lately' })}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('insightsVariety.repeats.hint', {
            name: kidName,
            defaultValue: "Familiar meals help. Swapping one side keeps {{name}}'s week from feeling the same.",
          })}
        </p>
      </div>
      <Group
        t={t}
        title={t('insightsVariety.repeats.meals', { defaultValue: 'Meals' })}
        items={repeats.meals.slice(0, 5)}
      />
      <Group
        t={t}
        title={t('insightsVariety.repeats.ingredients', { defaultValue: 'Ingredients' })}
        items={repeats.ingredients.slice(0, 5)}
      />
      <Link
        to="/dashboard/planner"
        className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {t('insightsVariety.repeats.cta', { defaultValue: 'Mix up the week in the planner' })}
      </Link>
    </div>
  );
}

export const RepeatList = memo(RepeatListImpl);
