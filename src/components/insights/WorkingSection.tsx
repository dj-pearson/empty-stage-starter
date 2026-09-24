import { Fragment, memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { useFoods, usePlan } from '@/contexts/AppContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useSafeFoodInsurance } from '@/hooks/useSafeFoodInsurance';
import { addIsoDays } from '@/lib/date-utils';
import { buildResultIndex, selectReliableFoods } from '@/lib/kidFit';
import { selectSlippingSafeFoods, type SafeFoodRisk } from '@/lib/safeFoodRisk';
import type { Kid } from '@/types';
import '@/i18n/appLocale';

/**
 * "What is working" for one child over the last four weeks: the foods they
 * reliably eat, by logged results, and (with the exposure ladder on) every
 * safe food that is starting to slip, stated as plain counts.
 *
 * Home's SafeFoodInsuranceCard shows at most two slipping foods, can be
 * dismissed, and offers a backup. This list is the full, read-only picture:
 * no cap, no dismissals, no backup lookups, and no alarm styling.
 */
export interface WorkingSectionProps {
  kid: Kid;
  todayIso: string;
}

/** Days in the window, today included: [today-27, today]. */
const WINDOW_DAYS = 28;

const linkClass =
  'rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * Whole outcomes from a window's rates. Acceptance counts a taste as half, so
 * with n results, r of them refused: accepted = 2 * acceptance * n - (n - r).
 * The rates are rounded to two places, so round back to whole servings.
 */
function outcomeCounts(n: number, acceptanceRate: number, refusalRate: number): { eaten: number; total: number } {
  if (n <= 0) return { eaten: 0, total: 0 };
  const refused = Math.round(refusalRate * n);
  const eaten = Math.round(2 * acceptanceRate * n - (n - refused));
  return { eaten: Math.min(n, Math.max(0, eaten)), total: n };
}

const SlippingRow = memo(function SlippingRow({ risk }: { risk: SafeFoodRisk }) {
  const { t } = useTranslation();

  if (risk.insufficientData || risk.observations.baseline === 0) {
    return (
      <li className="text-sm text-muted-foreground">
        {t('insightsWorking.slipping.notEnough', {
          food: risk.foodName,
          defaultValue: '{{food}}: not enough history yet',
        })}
      </li>
    );
  }

  const recent = outcomeCounts(risk.observations.recent, risk.recentAcceptanceRate, risk.recentRefusalRate);
  const before = outcomeCounts(risk.observations.baseline, risk.baselineAcceptanceRate, risk.baselineRefusalRate);
  const overServed = risk.signals.some((s) => s.kind === 'over_served');

  return (
    <li>
      <p className="text-sm">
        {t('insightsWorking.slipping.recent', {
          food: risk.foodName,
          eaten: recent.eaten,
          total: recent.total,
          defaultValue: '{{food}}: eaten {{eaten}} of the last {{total}} times',
        })}
      </p>
      <p className="text-sm text-muted-foreground">
        {t('insightsWorking.slipping.before', {
          eaten: before.eaten,
          total: before.total,
          defaultValue: 'Before that: {{eaten}} of {{total}}',
        })}
        {overServed && (
          <>
            {'. '}
            {t('insightsWorking.slipping.overServed', { defaultValue: 'On the plate often lately' })}
          </>
        )}
      </p>
    </li>
  );
});

interface SlippingProps {
  kid: Kid;
  todayIso: string;
}

/** Only mounted with the ladder flag on, so Home-only reads never run otherwise. */
const SlippingSafeFoods = memo(function SlippingSafeFoods({ kid, todayIso }: SlippingProps) {
  const { t } = useTranslation();
  const { foods } = useFoods();
  const { planEntries } = usePlan();

  const insuranceFoods = useMemo(
    () => foods.map((f) => ({ id: f.id, name: f.name, isSafe: Boolean(f.is_safe), allergens: f.allergens ?? null })),
    [foods],
  );
  const kidPlanEntries = useMemo(
    () =>
      planEntries
        .filter((e) => e.kid_id === kid.id)
        .map((e) => ({
          recipeId: e.recipe_id ?? null,
          foodId: e.food_id ?? null,
          date: e.date,
          result: e.result ?? null,
        })),
    [planEntries, kid.id],
  );

  const { rows, loading } = useSafeFoodInsurance({
    kidId: kid.id,
    foods: insuranceFoods,
    planEntries: kidPlanEntries,
    kidAllergens: kid.allergens ?? null,
    today: todayIso,
    skipBackups: true,
  });

  const slipping = useMemo(() => selectSlippingSafeFoods(rows), [rows]);
  const allThin = rows.length > 0 && rows.every((r) => r.insufficientData);

  if (rows.length === 0 && !loading) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-base font-medium">
        {t('insightsWorking.slipping.title', { defaultValue: 'Safe foods to watch' })}
      </h3>
      {loading ? (
        <div aria-busy="true" data-testid="slipping-loading">
          <Skeleton className="h-5 w-2/3" />
        </div>
      ) : slipping.length > 0 ? (
        <ul className="space-y-2">
          {slipping.map((risk) => (
            <SlippingRow key={risk.foodId} risk={risk} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {allThin
            ? t('insightsWorking.slipping.thinHistory', {
                defaultValue: 'Not enough history yet to tell whether a safe food is slipping.',
              })
            : t('insightsWorking.slipping.steady', {
                name: kid.name,
                defaultValue: "{{name}}'s safe foods are holding steady.",
              })}
        </p>
      )}
    </div>
  );
});

export const WorkingSection = memo(function WorkingSection({ kid, todayIso }: WorkingSectionProps) {
  const { t } = useTranslation();
  const ladderOn = useFeatureFlag('exposure_ladder', false);
  const { foods } = useFoods();
  const { planEntries } = usePlan();

  const reliable = useMemo(() => {
    const start = addIsoDays(todayIso, -(WINDOW_DAYS - 1));
    const windowed = planEntries.filter((e) => {
      const day = typeof e.date === 'string' ? e.date.slice(0, 10) : '';
      return e.kid_id === kid.id && day >= start && day <= todayIso;
    });
    const index = buildResultIndex(windowed, kid.id, addIsoDays(todayIso, 1));
    const byId = new Map(foods.map((f) => [f.id, f]));
    return selectReliableFoods(index, byId, kid);
  }, [planEntries, foods, kid, todayIso]);

  return (
    <section id="insights-working" aria-labelledby="insights-working-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="insights-working-title" className="text-lg font-semibold">
          {t('insightsWorking.working.title', { defaultValue: "What's working" })}
        </h2>
        <span className="text-sm text-muted-foreground">
          {t('insightsWorking.working.window', { defaultValue: 'Last 4 weeks' })}
        </span>
      </div>

      {reliable.length > 0 ? (
        <p className="text-base">
          {t('insightsWorking.working.reliable', { name: kid.name, defaultValue: '{{name}} reliably eats:' })}{' '}
          {reliable.map((r, i) => (
            <Fragment key={r.food.id}>
              {i > 0 && ', '}
              <Link
                to="/dashboard/food-journal"
                className={linkClass}
                aria-label={t('insightsWorking.working.reliableLink', {
                  food: r.food.name,
                  defaultValue: '{{food}} in the Food Journal',
                })}
              >
                {r.food.name}
              </Link>
            </Fragment>
          ))}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('insightsWorking.working.reliableEmpty', {
            name: kid.name,
            defaultValue: 'Once {{name}} has eaten a food at least 3 times, it shows up here.',
          })}
        </p>
      )}

      {ladderOn && <SlippingSafeFoods kid={kid} todayIso={todayIso} />}
    </section>
  );
});
