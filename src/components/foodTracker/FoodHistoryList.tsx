/**
 * One row per food the child has tried, newest activity first.
 *
 * This is the per-food view: how each food has gone over time, and a tap
 * away from every try. Meals by day are the Food Journal's job and weekly
 * counts are the Kids card's, so neither is repeated here.
 *
 * The filter narrows the rows shown and nothing else; the counts on each
 * filter chip come from the same full-history summary, so picking "Not
 * today" can never change how many tries a food shows.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useFoods } from '@/contexts/AppContext';
import { useFoodAttemptHistory } from '@/hooks/useFoodAttemptHistory';
import { summarizeFoodAttempts, type FoodHistorySummary } from '@/lib/foodAttemptHistory';
import { attemptOutcomeStyle } from '@/lib/mealResultStyle';
import { cn } from '@/lib/utils';
import { FoodHistorySheet } from './FoodHistorySheet';
import { formatRelative, OUTCOME_LABEL_DEFAULTS, outcomeLabelKey } from './foodHistoryFormat';
import '@/i18n/appLocale';

const HISTORY_PAGE_SIZE = 20;

type HistoryFilter = 'all' | 'success' | 'partial' | 'refused';
const FILTERS: readonly HistoryFilter[] = ['all', 'success', 'partial', 'refused'];

/** A hard time is a refusal too, as far as "where does this food stand" goes. */
function matchesFilter(summary: FoodHistorySummary, filter: HistoryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'refused') return summary.lastOutcome === 'refused' || summary.lastOutcome === 'tantrum';
  return summary.lastOutcome === filter;
}

const FILTER_DEFAULTS: Record<HistoryFilter, string> = {
  all: 'All ({{count}})',
  success: 'Took it ({{count}})',
  partial: 'Partway ({{count}})',
  refused: 'Not today ({{count}})',
};

const FILTER_KEYS: Record<HistoryFilter, string> = {
  all: 'foodTracker.history.filterAll',
  success: 'foodTracker.history.filterSuccess',
  partial: 'foodTracker.history.filterPartial',
  refused: 'foodTracker.history.filterRefused',
};

export interface FoodHistoryListProps {
  kidId: string;
}

export function FoodHistoryList({ kidId }: FoodHistoryListProps) {
  const { t, i18n } = useTranslation();
  const { foods } = useFoods();
  const history = useFoodAttemptHistory(kidId);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [visible, setVisible] = useState(HISTORY_PAGE_SIZE);
  const [openFoodId, setOpenFoodId] = useState<string | null>(null);
  const titleId = useId();

  // A different child starts from the top, unfiltered, with nothing open.
  useEffect(() => {
    setFilter('all');
    setVisible(HISTORY_PAGE_SIZE);
    setOpenFoodId(null);
  }, [kidId]);

  const foodNames = useMemo(() => new Map(foods.map((f) => [f.id, f.name])), [foods]);
  const foodIds = useMemo(() => new Set(foodNames.keys()), [foodNames]);

  const rows = history.status === 'ready' ? history.rows : null;
  const summary = useMemo(() => (rows ? summarizeFoodAttempts(rows, foodIds) : null), [rows, foodIds]);

  const sorted = useMemo(() => {
    if (!summary) return [];
    return [...summary.perFood.entries()]
      .map(([foodId, s]) => ({ foodId, summary: s }))
      .sort((a, b) => Date.parse(b.summary.lastAt) - Date.parse(a.summary.lastAt));
  }, [summary]);

  const counts = useMemo(() => {
    const out: Record<HistoryFilter, number> = { all: 0, success: 0, partial: 0, refused: 0 };
    for (const item of sorted) {
      for (const f of FILTERS) if (matchesFilter(item.summary, f)) out[f] += 1;
    }
    return out;
  }, [sorted]);

  const filtered = useMemo(
    () => sorted.filter((item) => matchesFilter(item.summary, filter)),
    [sorted, filter]
  );
  const shown = filtered.slice(0, visible);

  const unknownFood = t('foodTracker.history.unknownFood', { defaultValue: 'Unknown food' });
  const openFoodName = openFoodId ? foodNames.get(openFoodId) ?? unknownFood : '';

  let body: ReactNode;
  if (history.status === 'loading') {
    body = (
      <div
        aria-busy="true"
        aria-label={t('foodTracker.history.loading', { defaultValue: 'Loading history' })}
        className="space-y-2"
        data-testid="food-history-loading"
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  } else if (history.status === 'error') {
    body = (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {t('foodTracker.history.loadFailed', {
              defaultValue: "Couldn't load this history. Nothing is lost; try again.",
            })}
          </span>
          <Button variant="outline" size="sm" onClick={history.retry}>
            {t('foodTracker.history.retry', { defaultValue: 'Retry' })}
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (sorted.length === 0) {
    body = (
      <div className="py-8 text-center">
        <p className="font-medium">
          {t('foodTracker.history.emptyTitle', { defaultValue: 'No tries logged yet' })}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {t('foodTracker.history.emptyBody', {
            defaultValue: 'Each food you log shows up here with how it has gone over time.',
          })}
        </p>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(value) => {
            setFilter((FILTERS as readonly string[]).includes(value) ? (value as HistoryFilter) : 'all');
            setVisible(HISTORY_PAGE_SIZE);
          }}
          aria-label={t('foodTracker.history.filterLabel', { defaultValue: 'Filter by last result' })}
          className="flex-wrap justify-start"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f} value={f} size="sm" className="min-h-11 px-3">
              {t(FILTER_KEYS[f], { defaultValue: FILTER_DEFAULTS[f], count: counts[f] })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {filtered.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('foodTracker.history.filteredEmpty', { defaultValue: 'No foods match this filter.' })}
            </p>
            <Button variant="link" className="mt-1" onClick={() => setFilter('all')}>
              {t('foodTracker.history.clearFilter', { defaultValue: 'Clear filter' })}
            </Button>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {shown.map(({ foodId, summary: s }) => {
                const name = foodNames.get(foodId) ?? unknownFood;
                const style = attemptOutcomeStyle(s.lastOutcome);
                const labelKey = outcomeLabelKey(s.lastOutcome);
                const OutcomeIcon = style.Icon;
                return (
                  <li key={foodId}>
                    <button
                      type="button"
                      onClick={() => setOpenFoodId(foodId)}
                      aria-label={t('foodTracker.history.openFood', {
                        defaultValue: 'Open {{food}} history',
                        food: name,
                      })}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left',
                        'transition-colors hover:bg-muted/50 motion-reduce:transition-none',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{name}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>
                            {t('foodTracker.history.tries', {
                              defaultValue: s.count === 1 ? '{{count}} try' : '{{count}} tries',
                              count: s.count,
                            })}
                          </span>
                          <time dateTime={s.lastAt}>{formatRelative(s.lastAt, i18n.language)}</time>
                          {s.hasReaction && (
                            <span
                              className="inline-flex items-center gap-1 text-destructive"
                              data-testid="reaction-marker"
                            >
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              {t('foodTracker.history.reactionLogged', { defaultValue: 'Reaction logged' })}
                            </span>
                          )}
                        </span>
                      </span>
                      <Badge variant="outline" className={cn('shrink-0 gap-1', style.className)}>
                        <OutcomeIcon className="h-3 w-3" aria-hidden="true" />
                        {t(`foodTracker.history.outcome.${labelKey}`, {
                          defaultValue: OUTCOME_LABEL_DEFAULTS[labelKey],
                        })}
                      </Badge>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {filtered.length > shown.length && (
              <Button
                variant="outline"
                className="min-h-11 w-full"
                onClick={() => setVisible((v) => v + HISTORY_PAGE_SIZE)}
              >
                {t('foodTracker.history.showMore', { defaultValue: 'Show more' })}
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div>
        <h2 id={titleId} className="text-lg font-semibold">
          {t('foodTracker.history.title', { defaultValue: 'History by food' })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('foodTracker.history.subtitle', {
            defaultValue: 'Each food over time. Meals by day live in the Journal.',
          })}
        </p>
      </div>
      {body}
      <FoodHistorySheet
        kidId={kidId}
        foodId={openFoodId}
        foodName={openFoodName}
        open={openFoodId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenFoodId(null);
        }}
      />
    </section>
  );
}
