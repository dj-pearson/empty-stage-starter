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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, X } from 'lucide-react';
import { useKids, useRecipes, usePlan } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { analytics } from '@/lib/analytics';
import { addIsoDays, toISODate } from '@/lib/date-utils';
import { insightTone } from '@/lib/insightTone';
import { toast } from 'sonner';
import {
  buildSeasonalRecallPlanInserts,
  copyForLifeEvent,
  findSeasonalRecallCandidates,
  isoWeekNumber,
  lifeEventForWeek,
  type RecallCandidate,
} from '@/lib/seasonalRecall';
import type { PlanEntry } from '@/types';
import '@/i18n/appLocale';

const DISMISS_KEY_PREFIX = 'eatpal.seasonal_recall_dismissed';

/** Per signed-in user, so one parent's dismissal does not hide it for the other. */
function dismissKey(
  userId: string | null | undefined,
  year: number,
  week: number,
  recipeId: string
): string {
  return `${DISMISS_KEY_PREFIX}.${userId ?? 'anon'}.${year}-w${week}-${recipeId}`;
}

function isDismissed(
  userId: string | null | undefined,
  year: number,
  week: number,
  recipeId: string
): boolean {
  try {
    return localStorage.getItem(dismissKey(userId, year, week, recipeId)) === 'true';
  } catch {
    return false;
  }
}

function markDismissed(
  userId: string | null | undefined,
  year: number,
  week: number,
  recipeId: string
) {
  try {
    localStorage.setItem(dismissKey(userId, year, week, recipeId), 'true');
  } catch {
    // ignore
  }
}

/** The five columns the recall picker and the copy need, nothing else. */
const RECALL_COLUMNS = 'kid_id,recipe_id,food_id,meal_slot,date';

interface RecallRow {
  kid_id: string;
  recipe_id: string | null;
  food_id: string;
  meal_slot: PlanEntry['meal_slot'];
  date: string;
}

/**
 * Prior-year rows per `${householdId}|${today}`. The card and the Home insight
 * slot both ask, and Home remounts on every visit; one fetch per household per
 * day is enough for a window that is a year in the past.
 */
const recallCache = new Map<string, PlanEntry[]>();
const recallInFlight = new Map<string, Promise<PlanEntry[]>>();

/** Test hook: forget cached windows. */
export function clearSeasonalRecallCache(): void {
  recallCache.clear();
  recallInFlight.clear();
}

/**
 * Rows come back without id or result. The query only asks for result = 'ate',
 * so that is filled in; the id is synthesized from the row's own columns
 * because the picker only uses it to list contributing rows.
 */
function toRecallEntry(row: RecallRow): PlanEntry {
  return {
    id: `${row.kid_id}|${row.date}|${row.meal_slot}|${row.recipe_id ?? ''}|${row.food_id}`,
    kid_id: row.kid_id,
    date: row.date,
    meal_slot: row.meal_slot,
    food_id: row.food_id,
    recipe_id: row.recipe_id,
    result: 'ate',
  };
}

function loadPriorYearWindow(householdId: string, today: string): Promise<PlanEntry[]> {
  const key = `${householdId}|${today}`;
  const cached = recallCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = recallInFlight.get(key);
  if (pending) return pending;

  // Same calendar day last year, +/- 3 weeks, on the local calendar.
  const [y, m, d] = today.split('-');
  const lastYear = `${Number(y) - 1}-${m}-${d === '29' && m === '02' ? '28' : d}`;
  const start = addIsoDays(lastYear, -21);
  const end = addIsoDays(lastYear, 21);

  const request = (async () => {
    try {
      const { data, error } = await supabase
        .from('plan_entries')
        .select(RECALL_COLUMNS)
        .eq('household_id', householdId)
        .gte('date', start)
        .lte('date', end)
        .eq('result', 'ate')
        .order('date', { ascending: true });
      if (error) {
        logger.error('SeasonalRecallCard fetch error:', error);
        return [];
      }
      const rows = ((data ?? []) as RecallRow[]).map(toRecallEntry);
      recallCache.set(key, rows);
      return rows;
    } catch (err) {
      logger.error('SeasonalRecallCard load failed:', err);
      return [];
    } finally {
      recallInFlight.delete(key);
    }
  })();
  recallInFlight.set(key, request);
  return request;
}

export interface SeasonalRecallState {
  /** Null until the window has loaded (or when disabled / signed out). */
  priorEntries: PlanEntry[] | null;
  candidates: RecallCandidate[];
  /** The best candidate not dismissed for this ISO week, if any. */
  topCandidate: RecallCandidate | null;
  asOf: Date;
  targetWeek: number;
  targetYear: number;
  /** Re-read dismissals after one is written. */
  refreshDismissals: () => void;
}

/**
 * The recall data without the card. The Home insight slot calls this with
 * `enabled` false while a higher-priority insight is showing, so nothing is
 * fetched for a card that would not render.
 */
export function useSeasonalRecall(enabled = true): SeasonalRecallState {
  const { householdId, userId } = useAuth();
  const { recipes } = useRecipes();
  const asOf = useMemo(() => new Date(), []);
  const today = toISODate(asOf);
  const cacheKey = householdId ? `${householdId}|${today}` : null;
  const [priorEntries, setPriorEntries] = useState<PlanEntry[] | null>(() =>
    cacheKey ? recallCache.get(cacheKey) ?? null : null
  );
  const [dismissVersion, setDismissVersion] = useState(0);

  useEffect(() => {
    if (!enabled || !householdId) return;
    let cancelled = false;
    loadPriorYearWindow(householdId, today).then((rows) => {
      if (!cancelled) setPriorEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, householdId, today]);

  const targetWeek = useMemo(() => isoWeekNumber(asOf), [asOf]);
  const targetYear = asOf.getFullYear();

  const candidates = useMemo(() => {
    if (!priorEntries) return [];
    return findSeasonalRecallCandidates(priorEntries, recipes, { asOf, limit: 5 });
  }, [priorEntries, recipes, asOf]);

  const topCandidate = useMemo(() => {
    // dismissVersion is read so a new dismissal re-runs the storage checks.
    void dismissVersion;
    for (const c of candidates) {
      if (!isDismissed(userId, targetYear, targetWeek, c.recipeId)) return c;
    }
    return null;
  }, [candidates, userId, targetYear, targetWeek, dismissVersion]);

  const refreshDismissals = useCallback(() => setDismissVersion((n) => n + 1), []);

  return {
    priorEntries: enabled ? priorEntries : null,
    candidates,
    topCandidate: enabled ? topCandidate : null,
    asOf,
    targetWeek,
    targetYear,
    refreshDismissals,
  };
}

interface SeasonalRecallCardProps {
  /** Called after the card is dismissed or its week is copied. */
  onDismiss?: () => void;
}

export function SeasonalRecallCard({ onDismiss }: SeasonalRecallCardProps = {}) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { kids } = useKids();
  const { planEntries: currentPlanEntries, addPlanEntries } = usePlan();
  const { priorEntries, candidates, topCandidate, asOf, targetWeek, targetYear, refreshDismissals } =
    useSeasonalRecall(true);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const lifeEvent = useMemo(() => lifeEventForWeek(targetWeek), [targetWeek]);
  const copy = useMemo(() => copyForLifeEvent(lifeEvent), [lifeEvent]);

  // Telemetry: once per candidate shown.
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

  // No placeholder for accounts without a year of history: a card that only
  // says "come back in 7 months" is noise on the first screen.
  if (dismissed || !priorEntries || !topCandidate) return null;

  const dismissForSeason = () => {
    markDismissed(userId, targetYear, targetWeek, topCandidate.recipeId);
    refreshDismissals();
    setDismissed(true);
    onDismiss?.();
  };

  const handleCopyWeek = async () => {
    setBusy(true);
    try {
      // Rows for a kid removed since last year would insert against a kid
      // that no longer exists.
      const kidIds = new Set(kids.map((k) => k.id));
      const inserts = buildSeasonalRecallPlanInserts(topCandidate, priorEntries, asOf).filter((i) =>
        kidIds.has(i.kid_id)
      );
      if (inserts.length === 0) {
        toast(
          t(
            'home.insights.seasonal.noKids',
            'None of the kids from last year are on your account now, so there is nothing to copy.'
          )
        );
        return;
      }
      // Dedupe against entries already on the upcoming calendar (same
      // kid + date + slot). The user might have already scheduled some
      // of next week and the AC requires we skip those.
      const existingKeys = new Set(
        currentPlanEntries.map((e) => `${e.kid_id}|${e.date}|${e.meal_slot}`)
      );
      const filtered = inserts
        .filter((i) => !existingKeys.has(`${i.kid_id}|${i.date}|${i.meal_slot}`))
        .map((i) => ({ ...i, result: null }));
      if (filtered.length === 0) {
        toast(t('home.insights.seasonal.alreadyPlanned', 'Those days are already planned, nothing to add.'));
        return;
      }

      // addPlanEntries rolls back and toasts the failure itself; all that is
      // left here is to not claim success.
      const { error } = await addPlanEntries(filtered);
      if (error) return;

      analytics.trackEvent('seasonal_recall_week_copied', {
        plan_entry_count: filtered.length,
        life_event_tag: lifeEvent,
        recipe_id: topCandidate.recipeId,
      });
      toast.success(
        t('home.insights.seasonal.copied', {
          defaultValue: 'Added {{count}} meals from last year.',
          count: filtered.length,
        })
      );
      // A successful copy is a soft dismiss for this season.
      dismissForSeason();
    } catch (err) {
      logger.error('Seasonal recall copy failed:', err);
      toast.error(
        t('home.insights.seasonal.copyFailed', "Could not copy last year's week. Try again in a moment.")
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    analytics.trackEvent('seasonal_recall_card_dismissed', {
      life_event_tag: lifeEvent,
      recipe_id: topCandidate.recipeId,
    });
    dismissForSeason();
  };

  const tone = insightTone('neutral');

  return (
    <Card className={`mb-4 border ${tone.surface}`} data-testid="seasonal-recall-card">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-foreground">
            <Calendar className={`h-4 w-4 ${tone.icon}`} aria-hidden="true" />
            {copy.headline}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{copy.hint}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 -mt-2 -mr-2 shrink-0"
          onClick={handleDismiss}
          aria-label={t('home.insights.seasonal.dismissAria', 'Dismiss seasonal recall')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent>
        {/* Not a link: there is no route that opens a single recipe yet, and a
            row that looks tappable but goes nowhere is worse than plain text. */}
        <div className="flex items-center justify-between gap-3 w-full rounded-md bg-background/60 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate text-foreground">{topCandidate.recipeName}</p>
            <p className="text-xs text-muted-foreground">
              {t('home.insights.seasonal.hitCount', {
                defaultValue: 'Eaten {{count}}x around this week last year',
                count: topCandidate.hitCount,
              })}
            </p>
          </div>
          <Badge variant="outline" className={`shrink-0 ${tone.badge}`}>
            {t('home.insights.seasonal.lastYear', 'Last year')}
          </Badge>
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={handleCopyWeek} disabled={busy} className="gap-1 min-h-11">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            {t('home.insights.seasonal.copyWeek', 'Copy this week')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
