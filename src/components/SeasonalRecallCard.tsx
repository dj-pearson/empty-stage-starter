/**
 * US-300: Seasonal memory recall — "What worked last year".
 *
 * Dashboard insight card. Queries a slim window of prior-year plan_entries
 * (same ISO week ±2 weeks), runs the client-side recall picker, and
 * surfaces the top candidate with a one-tap "Copy this week" CTA.
 *
 * Why a per-card fetch instead of riding on AppContext:
 *   - AppContext.loadUserData only pulls the last 30 days of plan_entries
 *     to keep the bootstrap response small.
 *   - This card runs once on dashboard mount; a narrow date-range query
 *     keeps the payload small and avoids bloating the global state.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, History, X } from 'lucide-react';
import { useRecipes, usePlan } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { analytics } from '@/lib/analytics';
import { toast } from 'sonner';
import {
  buildSeasonalRecallPlanInserts,
  copyForLifeEvent,
  findSeasonalRecallCandidates,
  hasEnoughHistoryForRecall,
  isoWeekNumber,
  lifeEventForWeek,
  type RecallCandidate,
} from '@/lib/seasonalRecall';
import type { PlanEntry } from '@/types';

const DISMISS_KEY_PREFIX = 'eatpal.seasonal_recall_dismissed';

function dismissKey(year: number, week: number, recipeId: string): string {
  return `${DISMISS_KEY_PREFIX}.${year}-w${week}-${recipeId}`;
}

function isDismissed(year: number, week: number, recipeId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(year, week, recipeId)) === 'true';
  } catch {
    return false;
  }
}

function markDismissed(year: number, week: number, recipeId: string) {
  try {
    localStorage.setItem(dismissKey(year, week, recipeId), 'true');
  } catch {
    // ignore
  }
}

export function SeasonalRecallCard() {
  const { recipes } = useRecipes();
  const { planEntries: currentPlanEntries, addPlanEntries } = usePlan();
  const [priorEntries, setPriorEntries] = useState<PlanEntry[] | null>(null);
  const [earliestPlanDate, setEarliestPlanDate] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const fetchedRef = useRef(false);

  const asOf = useMemo(() => new Date(), []);
  const targetWeek = useMemo(() => isoWeekNumber(asOf), [asOf]);
  const targetYear = asOf.getUTCFullYear();
  const lifeEvent = useMemo(() => lifeEventForWeek(targetWeek), [targetWeek]);
  const copy = useMemo(() => copyForLifeEvent(lifeEvent), [lifeEvent]);

  // Fetch the prior-year window. ±2 ISO weeks = ~21 days; pulling 35 days
  // around the same week last year gives the helper enough headroom.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const start = new Date(asOf);
        start.setUTCFullYear(start.getUTCFullYear() - 1);
        start.setUTCDate(start.getUTCDate() - 21);
        const end = new Date(asOf);
        end.setUTCFullYear(end.getUTCFullYear() - 1);
        end.setUTCDate(end.getUTCDate() + 21);

        const { data: entriesData, error: entriesError } = await supabase
          .from('plan_entries')
          .select('*')
          .gte('date', start.toISOString().slice(0, 10))
          .lte('date', end.toISOString().slice(0, 10))
          .eq('result', 'ate')
          .order('date', { ascending: true });

        if (entriesError) {
          logger.error('SeasonalRecallCard fetch error:', entriesError);
          if (!cancelled) setPriorEntries([]);
          return;
        }

        if (!cancelled) {
          setPriorEntries((entriesData ?? []) as unknown as PlanEntry[]);
        }

        // Separate query for the earliest plan-entry date — used by the
        // "not enough history yet" empty state. One row, no payload.
        const { data: earliestData } = await supabase
          .from('plan_entries')
          .select('date')
          .order('date', { ascending: true })
          .limit(1);
        if (!cancelled && earliestData && earliestData[0]) {
          setEarliestPlanDate(earliestData[0].date);
        }
      } catch (err) {
        logger.error('SeasonalRecallCard load failed:', err);
        if (!cancelled) setPriorEntries([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asOf]);

  const candidates = useMemo(() => {
    if (!priorEntries) return [];
    return findSeasonalRecallCandidates(priorEntries, recipes, {
      asOf,
      limit: 5,
    });
  }, [priorEntries, recipes, asOf]);

  // Pick the top candidate that isn't dismissed for this (year, week).
  const topCandidate: RecallCandidate | null = useMemo(() => {
    for (const c of candidates) {
      if (!isDismissed(targetYear, targetWeek, c.recipeId)) return c;
    }
    return null;
  }, [candidates, targetYear, targetWeek]);

  const history = useMemo(
    () => hasEnoughHistoryForRecall(earliestPlanDate, asOf),
    [earliestPlanDate, asOf]
  );

  // Telemetry — fire once per render of a real candidate
  const shownRef = useRef<string | null>(null);
  useEffect(() => {
    if (!topCandidate) return;
    const key = `${targetYear}-${targetWeek}-${topCandidate.recipeId}`;
    if (shownRef.current === key) return;
    shownRef.current = key;
    analytics.trackEvent('seasonal_recall_card_shown', {
      life_event_tag: lifeEvent,
      candidate_count: candidates.length,
    });
  }, [topCandidate, lifeEvent, candidates.length, targetYear, targetWeek]);

  if (dismissed) return null;
  if (priorEntries === null) return null; // still loading; the dashboard already shows skeletons elsewhere

  // Empty state for accounts with insufficient history
  if (!topCandidate && !history.ready) {
    if (history.monthsUntilReady > 9) return null; // brand-new account; skip the card entirely
    return (
      <Card className="mb-4 border-muted-foreground/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Seasonal recall
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your first seasonal callback unlocks in{' '}
            <strong>
              {history.monthsUntilReady} more month{history.monthsUntilReady === 1 ? '' : 's'}
            </strong>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!topCandidate) return null;

  const handleCopyWeek = async () => {
    if (!priorEntries) return;
    setBusy(true);
    try {
      const inserts = buildSeasonalRecallPlanInserts(topCandidate, priorEntries, asOf);
      // Dedupe against entries already on the upcoming calendar (same
      // kid + date + slot). The user might have already scheduled some
      // of next week and the AC requires we skip those.
      const existingKeys = new Set(
        currentPlanEntries.map((e) => `${e.kid_id}|${e.date}|${e.meal_slot}`)
      );
      const filtered = inserts.filter(
        (i) => !existingKeys.has(`${i.kid_id}|${i.date}|${i.meal_slot}`)
      );
      if (filtered.length === 0) {
        toast('Those days are already planned — nothing to add.');
        return;
      }

      await addPlanEntries(filtered);

      analytics.trackEvent('seasonal_recall_week_copied', {
        plan_entry_count: filtered.length,
        life_event_tag: lifeEvent,
        recipe_id: topCandidate.recipeId,
      });
      toast.success(`Added ${filtered.length} meal${filtered.length !== 1 ? 's' : ''} from last year.`);
      // Treat a successful copy as a soft dismiss for this season.
      markDismissed(targetYear, targetWeek, topCandidate.recipeId);
      setDismissed(true);
    } catch (err) {
      logger.error('Seasonal recall copy failed:', err);
      toast.error('Could not copy last year’s week. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    markDismissed(targetYear, targetWeek, topCandidate.recipeId);
    analytics.trackEvent('seasonal_recall_card_dismissed', {
      life_event_tag: lifeEvent,
      recipe_id: topCandidate.recipeId,
    });
    setDismissed(true);
  };

  const handleRecipeClick = () => {
    analytics.trackEvent('seasonal_recall_recipe_clicked', {
      recipe_id: topCandidate.recipeId,
    });
  };

  return (
    <Card className="mb-4 border-sky-300/50 dark:border-sky-900/40 bg-sky-50/40 dark:bg-sky-950/20">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-sky-600" aria-hidden="true" />
            {copy.headline}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{copy.hint}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 -mt-1 -mr-1"
          onClick={handleDismiss}
          aria-label="Dismiss seasonal recall"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent>
        <button
          type="button"
          onClick={handleRecipeClick}
          className="flex items-center justify-between gap-3 w-full rounded-md bg-background/60 px-3 py-2 hover:bg-background transition-colors text-left"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{topCandidate.recipeName}</p>
            <p className="text-xs text-muted-foreground">
              Loved {topCandidate.hitCount}x in this week last year
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30">
            Last year
          </Badge>
        </button>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={handleCopyWeek}
            disabled={busy}
            className="gap-1"
          >
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            Copy this week
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
