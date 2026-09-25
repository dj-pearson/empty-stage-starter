/**
 * Household numbers on the Progress page: per child, this month's logged
 * dishes by result, how many different foods, first logged tries and ladder
 * graduations, a month-over-month line only when last month has enough logged
 * to compare, a monthly chart for one child, and two CSV exports.
 *
 * Counted per dish (householdMonthly groups a recipe's rows into one), from a
 * twelve-month server read of logged meals rather than the plan cache.
 */
import { lazy, Suspense, useMemo, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useFoods, usePlan, useRecipes } from '@/contexts/AppContext';
import { useHouseholdHistory } from '@/hooks/useHouseholdHistory';
import { useInView } from '@/hooks/useInView';
import { toISODate } from '@/lib/date-utils';
import { downloadCsv, sanitizeFilename, toCsv, type CsvColumn } from '@/lib/csvExport';
import {
  buildHouseholdMonthly,
  householdLoggedDishes,
  monthOf,
  monthOverMonth,
  monthsBetween,
  shiftMonth,
  type HouseholdMonthRow,
} from '@/lib/householdMonthly';
import type { JournalItem } from '@/lib/foodJournal';
import type { KidLadderRow } from '@/lib/kidProgress';
import { RESULT_STYLE, type LoggedResult } from '@/lib/mealResultStyle';
import { cn } from '@/lib/utils';
import type { Kid } from '@/types';
import '@/i18n/appLocale';

const HouseholdChart = lazy(() => import('./HouseholdChart'));

export interface HouseholdNumbersProps {
  kids: ReadonlyArray<Kid>;
  /** The kid in scope, or null for the whole family. */
  scopeKidId: string | null;
  ladderRows: ReadonlyArray<KidLadderRow>;
}

const RESULTS: readonly LoggedResult[] = ['ate', 'tasted', 'refused'];

const EMPTY_ROW = { dishesLogged: 0, ate: 0, tasted: 0, refused: 0, distinctFoods: 0, firstTries: 0 };

function slug(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'kid';
}

function exportFilename(scope: string, fromIso: string, toIso: string): string {
  return sanitizeFilename(`eatpal-${scope}-${fromIso}-to-${toIso}.csv`);
}

export function HouseholdNumbers({ kids, scopeKidId, ladderRows }: HouseholdNumbersProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const { householdId } = useAuth();
  const { foods } = useFoods();
  const { recipes } = useRecipes();
  const { planEntries } = usePlan();
  const todayIso = toISODate(new Date());

  // A newly logged result anywhere refetches, as on the rest of the page.
  const refreshKey = useMemo(() => planEntries.filter((e) => e.result != null).length, [planEntries]);
  const history = useHouseholdHistory(householdId, refreshKey);

  const orderedKids = useMemo(() => {
    const scoped = kids.find((k) => k.id === scopeKidId);
    return scoped ? [scoped, ...kids.filter((k) => k.id !== scoped.id)] : [...kids];
  }, [kids, scopeKidId]);
  const kidName = useMemo(() => new Map(kids.map((k) => [k.id, k.name])), [kids]);

  const rows = useMemo(
    () =>
      buildHouseholdMonthly({
        entries: history.entries,
        foods,
        recipes,
        kids: orderedKids,
        ladderRows: [...ladderRows],
        todayIso,
        fromIso: history.fromIso,
      }),
    [history.entries, history.fromIso, foods, recipes, orderedKids, ladderRows, todayIso]
  );

  const thisMonth = monthOf(todayIso);
  const months = useMemo(() => monthsBetween(history.fromIso, todayIso), [history.fromIso, todayIso]);

  const [focusId, setFocusId] = useState<string | null>(null);
  const focusKid =
    orderedKids.find((k) => k.id === focusId) ??
    orderedKids.find((k) => k.id === scopeKidId) ??
    orderedKids[0] ??
    null;

  const monthName = (month: string, style: 'short' | 'long' = 'long') => {
    const [y, m] = month.split('-').map(Number);
    return new Intl.DateTimeFormat(locale, { month: style, year: 'numeric' }).format(new Date(y, m - 1, 1));
  };
  const dayName = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(y, m - 1, d)
    );
  };
  const count = (n: number) => new Intl.NumberFormat(locale).format(n);

  const exportKids = scopeKidId && kidName.has(scopeKidId) ? orderedKids.filter((k) => k.id === scopeKidId) : orderedKids;
  const exportIds = new Set(exportKids.map((k) => k.id));
  const exportScope =
    scopeKidId && kidName.has(scopeKidId) ? slug(kidName.get(scopeKidId) ?? '') : 'household';
  const nameOf = (id: string) => kidName.get(id) ?? '';

  const runExport = (csv: string, rowCount: number) => {
    const ok = downloadCsv(exportFilename(exportScope, history.fromIso, todayIso), csv);
    if (!ok) {
      toast.error(t('progressHousehold.export.failed', { defaultValue: 'Could not start the download.' }));
      return;
    }
    toast.success(
      t('progressHousehold.export.done', { count: rowCount, defaultValue: 'Exported {{count}} rows.' })
    );
  };

  const exportSummary = () => {
    const data = rows.filter((r) => exportIds.has(r.kidId));
    const columns: CsvColumn<HouseholdMonthRow>[] = [
      { header: 'kid', value: (r) => nameOf(r.kidId) },
      { header: 'month', value: (r) => r.month },
      { header: 'dishes_logged', value: (r) => r.dishesLogged },
      { header: 'ate', value: (r) => r.ate },
      { header: 'tasted', value: (r) => r.tasted },
      { header: 'refused', value: (r) => r.refused },
      { header: 'distinct_foods', value: (r) => r.distinctFoods },
      { header: 'first_tries', value: (r) => r.firstTries },
      { header: 'graduations', value: (r) => r.graduations },
    ];
    runExport(toCsv(data, columns), data.length);
  };

  const exportMeals = () => {
    const data = householdLoggedDishes({
      entries: history.entries,
      foods,
      recipes,
      kids: exportKids,
      todayIso,
    });
    // Notes are left out on purpose: they are free text about a child and
    // may name a caregiver; the Food Journal's report is the place for them.
    const columns: CsvColumn<JournalItem>[] = [
      { header: 'kid', value: (r) => nameOf(r.kidId) },
      { header: 'date', value: (r) => r.date },
      { header: 'meal_slot', value: (r) => r.mealSlot },
      { header: 'dish', value: (r) => r.name ?? '' },
      { header: 'result', value: (r) => r.result ?? '' },
      { header: 'amount', value: (r) => r.amountEaten ?? '' },
      { header: 'exposure_number', value: (r) => r.exposureNumber },
      { header: 'first_try', value: (r) => (r.firstTry ? 'yes' : 'no') },
    ];
    runExport(toCsv(data, columns), data.length);
  };

  const resultLabel: Record<LoggedResult, string> = {
    ate: t('progressHousehold.result.ate', { defaultValue: 'Ate' }),
    tasted: t('progressHousehold.result.tasted', { defaultValue: 'Tasted' }),
    refused: t('progressHousehold.result.refused', { defaultValue: 'Refused' }),
  };

  if (kids.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('progressHousehold.noKids', { defaultValue: 'Add a child to start counting meals.' })}
      </p>
    );
  }

  if (history.loading && history.entries.length === 0) {
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only">{t('progressHousehold.loading', { defaultValue: 'Loading the numbers' })}</span>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const hasAny = rows.some((r) => r.dishesLogged > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('progressHousehold.range', {
          from: dayName(history.fromIso),
          to: dayName(todayIso),
          defaultValue: 'Logged meals from {{from}} to {{to}}, one count per dish.',
        })}
      </p>
      {history.error && (
        <p role="alert" className="text-sm text-destructive">
          {t('progressHousehold.error', { defaultValue: "Couldn't load the meal log. Try again in a moment." })}
        </p>
      )}
      {history.truncated && (
        <p className="text-sm text-muted-foreground">
          {t('progressHousehold.truncated', {
            defaultValue: 'This household has more logged rows than we read at once, so the oldest months may be short.',
          })}
        </p>
      )}

      <ul className="divide-y divide-border">
        {orderedKids.map((kid) => {
          const kidRows = rows.filter((r) => r.kidId === kid.id);
          const current = kidRows.find((r) => r.month === thisMonth) ?? EMPTY_ROW;
          const logged = kidRows.some((r) => r.dishesLogged > 0);
          const graduatedToDate = ladderRows.filter((r) => r.kid_id === kid.id && r.status === 'mastered').length;
          const mom = monthOverMonth(kidRows, kid.id, thisMonth);
          const focused = focusKid?.id === kid.id;
          return (
            <li key={kid.id} className="py-3" data-testid={`household-kid-${kid.id}`}>
              <button
                type="button"
                aria-pressed={focused}
                onClick={() => setFocusId(kid.id)}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-md px-2 -mx-2 text-left text-base font-semibold',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  focused ? 'text-primary' : 'text-foreground hover:text-primary'
                )}
              >
                {kid.name}
                <span className="sr-only">
                  {t('progressHousehold.showChart', { defaultValue: ', show in chart' })}
                </span>
              </button>

              {!logged ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('progressHousehold.emptyKid', {
                    name: kid.name,
                    defaultValue: 'Nothing logged for {{name}} in the last year.',
                  })}{' '}
                  <Link
                    to="/dashboard/planner"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t('progressHousehold.emptyKidLink', { defaultValue: 'Log a meal in the planner' })}
                  </Link>
                </p>
              ) : (
                <>
                  <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">
                        {t('progressHousehold.dishesThisMonth', { defaultValue: 'Dishes this month' })}
                      </dt>
                      <dd className="font-semibold tabular-nums">{count(current.dishesLogged)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t('progressHousehold.distinctFoods', { defaultValue: 'Different foods' })}
                      </dt>
                      <dd className="font-semibold tabular-nums">{count(current.distinctFoods)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t('progressHousehold.firstTries', { defaultValue: 'First logged tries' })}
                      </dt>
                      <dd className="font-semibold tabular-nums">{count(current.firstTries)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t('progressHousehold.graduations', { defaultValue: 'Ladder graduations to date' })}
                      </dt>
                      <dd className="font-semibold tabular-nums">{count(graduatedToDate)}</dd>
                    </div>
                    <div className="col-span-2 sm:col-span-4">
                      <dt className="sr-only">
                        {t('progressHousehold.resultsThisMonth', { defaultValue: 'Results this month' })}
                      </dt>
                      <dd className="flex flex-wrap gap-2">
                        {RESULTS.map((result) => {
                          const { Icon, className } = RESULT_STYLE[result];
                          return (
                            <span
                              key={result}
                              data-result={result}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                                className
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                              {resultLabel[result]}
                              <span className="tabular-nums">{count(current[result])}</span>
                            </span>
                          );
                        })}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {mom.kind === 'compare'
                      ? t('progressHousehold.mom.compare', {
                          current: mom.current,
                          previous: mom.previous,
                          lastMonth: monthName(mom.previousMonth),
                          defaultValue: '{{current}} different foods so far this month, {{previous}} in {{lastMonth}}.',
                        })
                      : t('progressHousehold.mom.thin', {
                          lastMonth: monthName(shiftMonth(thisMonth, -1)),
                          defaultValue: 'Not enough logged in {{lastMonth}} to compare.',
                        })}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {hasAny && focusKid && (
        <LazyChart rows={rows.filter((r) => r.kidId === focusKid.id)} months={months} kidName={focusKid.name} />
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={exportSummary} disabled={history.loading}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('progressHousehold.export.summary', { defaultValue: 'Monthly summary (CSV)' })}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={exportMeals} disabled={history.loading}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('progressHousehold.export.meals', { defaultValue: 'Every logged meal (CSV)' })}
        </Button>
      </div>
    </div>
  );
}

/**
 * Mounts the chart once its slot nears the viewport. Its own component so the
 * observer attaches when the slot first renders, not when the list did.
 */
function LazyChart(props: { rows: HouseholdMonthRow[]; months: string[]; kidName: string }) {
  const { ref, inView } = useInView({ rootMargin: '200px' });
  return (
    <div ref={ref as RefObject<HTMLDivElement>} className="min-h-64">
      {inView ? (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <HouseholdChart {...props} />
        </Suspense>
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </div>
  );
}
