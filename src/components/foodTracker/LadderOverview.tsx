/**
 * Food Tracker: where each food sits on this child's ladder, what to offer
 * today, and what is one step from safe.
 *
 * How it differs from its neighbours:
 * - The Food Journal answers "what happened at each meal, day by day" from
 *   plan_entries. This screen is per food, not per meal.
 * - The Kids card answers "how did this week go" in counts. This screen is
 *   the place to act: every log here goes through useFoodLadder.logAttempt,
 *   so the attempt, the rung, the plan-entry link and mastery move together.
 *
 * Every row lands in exactly one group (groupLadder). `today` is held in
 * state and refreshed when the tab comes back into view, so a phone left on
 * this screen overnight shows the next morning's due foods, not yesterday's.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LadderQuickLogControls } from '@/components/LadderQuickLogControls';
import { LadderReportDialog } from '@/components/LadderReportDialog';
import { firstName } from '@/lib/firstName';
import { useFoods, useKids } from '@/contexts/AppContext';
import { useFoodLadder, type LadderRow } from '@/hooks/useFoodLadder';
import { useExposureCounts } from '@/hooks/useExposureCounts';
import { usePickyWinSharePref } from '@/hooks/usePickyWinSharePref';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { analytics } from '@/lib/analytics';
import { groupLadder, summaryCounts, type LadderGroups } from '@/lib/ladderOverview';
import { EXPOSURE_TARGET } from '@/lib/familyRhythm';
import type { Kid } from '@/types';
import { LadderFoodPicker } from './LadderFoodPicker';
import { LadderOverviewRow, type OverviewGroup } from './LadderOverviewRow';
import { localIsoDate } from './ladderDates';
import '@/i18n/appLocale';

const GROUP_ORDER: OverviewGroup[] = ['dueToday', 'closeToSafe', 'workingOn', 'resting', 'safeNow'];

export interface LadderOverviewProps {
  kid: Kid;
  /**
   * Bumped by the page's "Log a try" entry point. Focuses the first due
   * food's buttons, or opens the picker when nothing is due.
   */
  logRequestNonce?: number;
  /**
   * A food to log a try for, from a link elsewhere (Meal Builder's try bite
   * is ?log=<foodId>). When this child has a row for it, its log controls
   * open once per kid and id; an id with no row does nothing.
   */
  logFoodId?: string;
}

function listHas(list: readonly string[] | undefined, food: { id: string; name: string } | undefined, foodId: string) {
  if (!list || list.length === 0) return false;
  const name = food?.name.trim().toLowerCase();
  return list.some((v) => v === foodId || (name !== undefined && v.trim().toLowerCase() === name));
}

export function LadderOverview({ kid, logRequestNonce, logFoodId }: LadderOverviewProps) {
  const { t } = useTranslation();
  const { foods } = useFoods();
  const { updateKid } = useKids();
  const { enabled: shareWins } = usePickyWinSharePref();
  const reducedMotion = useReducedMotion();
  const {
    rows,
    loading,
    error,
    reload,
    logAttempt,
    undoLog,
    pause,
    resume,
    stepDown,
    removeFromLadder,
    restoreRow,
    backfillFromHistory,
    startFood,
    masteryCandidates,
    masteredFoodName,
    dismissMastery,
  } = useFoodLadder(kid.id, { kid, foods, shareWins });

  // Refetch the offer counts whenever any row records a new attempt.
  const lastLoggedAt = useMemo(
    () => rows.reduce<string>((latest, r) => (r.lastAttemptAt && r.lastAttemptAt > latest ? r.lastAttemptAt : latest), ''),
    [rows],
  );
  const exposuresByFood = useExposureCounts(kid.id, lastLoggedAt);

  const [today, setToday] = useState(localIsoDate);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [addingAlwaysEats, setAddingAlwaysEats] = useState<Set<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Midnight passes while a phone sits on this screen. Re-read the calendar
  // date whenever the page is looked at again.
  useEffect(() => {
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setToday((current) => {
        const next = localIsoDate();
        return next === current ? current : next;
      });
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    analytics.trackEvent('exposure_ladder_viewed', { surface: 'food_tracker' });
  }, []);

  const groups: LadderGroups<LadderRow> = useMemo(() => groupLadder(rows, today), [rows, today]);
  const counts = useMemo(() => summaryCounts(groups), [groups]);
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const foodNameById = useMemo(() => new Map(foods.map((f) => [f.id, f.name])), [foods]);

  // The hook starts with loading=false and flips it on in its own effect, so
  // "loaded and empty" is only trustworthy once a load has been seen to start
  // for this child.
  const [loadSeenFor, setLoadSeenFor] = useState<string | null>(null);
  useEffect(() => {
    if (loading) setLoadSeenFor(kid.id);
  }, [loading, kid.id]);
  const loaded = loadSeenFor === kid.id && !loading;

  const backfillTried = useRef<Set<string>>(new Set());
  const [backfillDoneFor, setBackfillDoneFor] = useState<string | null>(null);
  useEffect(() => {
    if (!loaded || error || rows.length > 0) return;
    if (backfillTried.current.has(kid.id)) return;
    backfillTried.current.add(kid.id);
    const kidId = kid.id;
    setBackfilling(true);
    void backfillFromHistory(kidId).finally(() => {
      setBackfilling(false);
      setBackfillDoneFor(kidId);
    });
  }, [loaded, error, rows.length, kid.id, backfillFromHistory]);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const focusRow = useCallback(
    (foodId: string, attempt = 0) => {
      const row = rowsRef.current.find((r) => r.foodId === foodId);
      const el = row
        ? listRef.current?.querySelector<HTMLElement>(`[data-ladder-row="${row.id}"]`)
        : null;
      if (!el) {
        // Started from the picker a moment ago, or added on another device:
        // the row may not be rendered yet.
        if (attempt === 0) {
          void reload().then(() => requestAnimationFrame(() => focusRow(foodId, 1)));
        }
        return;
      }
      el.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
      el.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    },
    [reload, reducedMotion]
  );

  // Item 4: the planner's try-bite strip links here as ?food=<id>. Once this
  // child's ladder has loaded, bring that food's row into view, once per link.
  const focusedFromLink = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || rows.length === 0) return;
    let foodId: string | null = null;
    try {
      foodId = new URLSearchParams(window.location.search).get('food');
    } catch {
      return;
    }
    if (!foodId) return;
    const token = `${kid.id}:${foodId}`;
    if (focusedFromLink.current === token) return;
    focusedFromLink.current = token;
    const target = foodId;
    requestAnimationFrame(() => focusRow(target, 1));
  }, [loaded, rows.length, kid.id, focusRow]);

  // "Log a try" from the page header.
  const lastNonce = useRef(logRequestNonce);
  const dueRef = useRef(groups.dueToday);
  dueRef.current = groups.dueToday;
  useEffect(() => {
    if (logRequestNonce === undefined || logRequestNonce === lastNonce.current) return;
    lastNonce.current = logRequestNonce;
    const first = dueRef.current[0];
    if (!first) {
      setPickerOpen(true);
      return;
    }
    const controls = listRef.current?.querySelector<HTMLElement>(`[data-quick-log="${first.id}"]`);
    controls?.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    controls?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, [logRequestNonce, reducedMotion]);

  // ?log=<foodId>: open that food's log controls once. Due and close-to-safe
  // rows already show them inline, so those are scrolled to and focused; any
  // other row gets the same controls pinned above the list until dismissed.
  const [pinnedLogRowId, setPinnedLogRowId] = useState<string | null>(null);
  const pinnedLogRef = useRef<HTMLDivElement>(null);
  const logLinkHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!logFoodId) return;
    const token = `${kid.id}:${logFoodId}`;
    if (logLinkHandled.current === token) return;
    const row = rows.find((r) => r.foodId === logFoodId);
    // Rows may still be loading; a later render tries again. Unknown ids stay a no-op.
    if (!row) return;
    logLinkHandled.current = token;
    const inline = groups.dueToday.some((r) => r.id === row.id) || groups.closeToSafe.some((r) => r.id === row.id);
    if (!inline) {
      setPinnedLogRowId(row.id);
      return;
    }
    requestAnimationFrame(() => {
      const controls = listRef.current?.querySelector<HTMLElement>(`[data-quick-log="${row.id}"]`);
      controls?.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
      controls?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    });
  }, [logFoodId, kid.id, rows, groups, reducedMotion]);

  const pinnedLogRow = pinnedLogRowId ? rows.find((r) => r.id === pinnedLogRowId && r.kidId === kid.id) : undefined;
  const pinnedLogShown = pinnedLogRow !== undefined;
  useEffect(() => {
    if (!pinnedLogShown) return;
    const el = pinnedLogRef.current;
    el?.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    el?.querySelector<HTMLElement>('[data-quick-log] button')?.focus({ preventScroll: true });
  }, [pinnedLogShown, reducedMotion]);

  const handleAddToAlwaysEats = async (row: LadderRow) => {
    const food = foodById.get(row.foodId);
    setAddingAlwaysEats((s) => new Set(s).add(row.foodId));
    const ok = await updateKid(kid.id, {
      always_eats_foods: [...(kid.always_eats_foods ?? []), row.foodId],
    });
    setAddingAlwaysEats((s) => {
      const next = new Set(s);
      next.delete(row.foodId);
      return next;
    });
    if (ok) {
      toast.success(
        t('foodTracker.ladderUi.alwaysEatsAdded', {
          defaultValue: "{{food}} is on {{name}}'s always-eats list.",
          food: food?.name ?? '',
          name: kid.name,
        })
      );
    } else {
      toast.error(
        t('foodTracker.ladderUi.alwaysEatsFailed', {
          defaultValue: "Couldn't update {{name}}'s profile just now.",
          name: kid.name,
        })
      );
    }
  };

  const statusLine = (() => {
    const parts: string[] = [];
    if (counts.due > 0) parts.push(t('foodTracker.ladderUi.status.due', { count: counts.due }));
    if (counts.close > 0) {
      parts.push(t('foodTracker.ladderUi.status.close', { count: counts.close }));
    }
    if (parts.length > 0) return parts.join(', ');
    if (counts.onLadder > 0) {
      return t('foodTracker.ladderUi.status.nothingDue', {
        defaultValue: 'Nothing to offer today. Everything else is resting or comes back later.',
      });
    }
    return null;
  })();

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {statusLine ? (
          <p className="text-lg font-semibold text-foreground" data-testid="ladder-status-line">
            {statusLine}
          </p>
        ) : null}
        <p className="max-w-[68ch] text-sm text-muted-foreground">
          {t('foodTracker.ladderUi.subtitle', {
            defaultValue:
              'Each food moves one small step at a time. A no simply steps it back to rest.',
          })}
        </p>
        <p className="max-w-[68ch] text-sm text-muted-foreground">
          {t('foodTracker.exposures.explainer', {
            defaultValue:
              'Most kids need about {{target}} offers before a new food feels familiar. Every offer counts, refusals too.',
            target: EXPOSURE_TARGET,
          })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" onClick={() => setPickerOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('foodTracker.ladderUi.startFood', { defaultValue: 'Start a food' })}
        </Button>
        {rows.length > 0 ? (
          <LadderReportDialog
            kidId={kid.id}
            // First token only: kids.name is free text and some families
            // store a full name there. The report must not carry one.
            kidFirstName={firstName(kid.name)}
            ladderRows={rows.map((row) => ({
              foodId: row.foodId,
              currentRung: row.currentRung,
              status: row.status,
            }))}
            foodNameById={foodNameById}
          />
        ) : null}
      </div>
    </div>
  );

  const picker = (
    <LadderFoodPicker
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      kid={kid}
      rows={rows}
      masteryCandidates={masteryCandidates}
      startFood={startFood}
      onJump={(foodId) => requestAnimationFrame(() => focusRow(foodId))}
    />
  );

  const liveRegion = (
    <p className="sr-only" aria-live="polite" role="status">
      {liveMessage}
    </p>
  );

  if (loading && rows.length === 0) {
    return (
      <div className="space-y-3" aria-busy="true" data-testid="ladder-loading">
        <span className="sr-only">
          {t('foodTracker.ladderUi.loading', { defaultValue: 'Loading the ladder' })}
        </span>
        <Skeleton className="h-7 w-64" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const errorAlert = error ? (
    <Alert variant="destructive">
      <AlertTitle>
        {t('foodTracker.ladderUi.error.title', { defaultValue: "Couldn't load the ladder" })}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          {rows.length > 0
            ? t('foodTracker.ladderUi.error.stale', {
                defaultValue: 'What you see may be out of date.',
              })
            : t('foodTracker.ladderUi.error.body', {
                defaultValue: 'Check your connection and try again. Nothing was lost.',
              })}
        </p>
        <Button variant="outline" size="sm" className="min-h-11" onClick={() => void reload()}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('foodTracker.ladderUi.error.retry', { defaultValue: 'Retry' })}
        </Button>
      </AlertDescription>
    </Alert>
  ) : null;

  if (rows.length === 0) {
    const showEmpty = !error && loaded && !backfilling && backfillDoneFor === kid.id;
    return (
      <div className="space-y-6">
        {header}
        {errorAlert}
        {!error && !showEmpty ? (
          <div aria-busy="true" className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('foodTracker.ladderUi.backfilling', {
                defaultValue: 'Checking past tries to build the ladder...',
              })}
            </p>
            <Skeleton className="h-20 w-full" />
          </div>
        ) : null}
        {showEmpty ? (
          <div className="space-y-3 rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground">
              {t('foodTracker.ladderUi.empty.title', {
                defaultValue: 'Pick one food to start with',
              })}
            </h2>
            <p className="max-w-[68ch] text-sm text-muted-foreground">
              {t('foodTracker.ladderUi.empty.body', {
                defaultValue:
                  "Choose a food {{name}} doesn't eat yet. It starts at just looking at it, and one tap after each meal moves it along.",
                name: kid.name,
              })}
            </p>
            <Button className="min-h-11" onClick={() => setPickerOpen(true)}>
              <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('foodTracker.ladderUi.startFood', { defaultValue: 'Start a food' })}
            </Button>
          </div>
        ) : null}
        {picker}
      </div>
    );
  }

  const groupCopy: Record<OverviewGroup, { title: string; body: string }> = {
    dueToday: {
      title: t('foodTracker.ladderUi.groups.dueToday', { defaultValue: 'Due today' }),
      body: t('foodTracker.ladderUi.groups.dueTodayBody', {
        defaultValue: 'Put it on the plate next to something safe, then one tap to say how it went.',
      }),
    },
    closeToSafe: {
      title: t('foodTracker.ladderUi.groups.closeToSafe', { defaultValue: 'Close to safe' }),
      body: t('foodTracker.ladderUi.groups.closeToSafeBody', {
        defaultValue: 'A few good tries from joining the regular rotation.',
      }),
    },
    workingOn: {
      title: t('foodTracker.ladderUi.groups.workingOn', { defaultValue: 'Working on' }),
      body: t('foodTracker.ladderUi.groups.workingOnBody', {
        defaultValue: 'These come back around on their own schedule.',
      }),
    },
    resting: {
      title: t('foodTracker.ladderUi.groups.resting', { defaultValue: 'Resting' }),
      body: t('foodTracker.ladderUi.groups.restingBody', {
        defaultValue: 'Taking a break is part of the plan. Bring one back whenever you are ready.',
      }),
    },
    safeNow: {
      title: t('foodTracker.ladderUi.groups.safeNow', { defaultValue: 'Safe now' }),
      body: t('foodTracker.ladderUi.groups.safeNowBody', {
        defaultValue: 'Eaten as a full portion. These are part of the rotation now.',
      }),
    },
  };

  return (
    <div className="space-y-6">
      {header}
      {errorAlert}
      {liveRegion}

      {pinnedLogRow ? (
        <section
          ref={pinnedLogRef}
          aria-labelledby="ladder-log-link-heading"
          className="space-y-3 rounded-xl border border-border p-4"
          data-testid="ladder-log-link"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="ladder-log-link-heading" className="text-base font-semibold text-foreground">
              {t('foodTracker.ladderUi.logLink.title', {
                defaultValue: 'How did {{food}} go?',
                food: foodNameById.get(pinnedLogRow.foodId) ?? t('foodLadder.unknownFood'),
              })}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 shrink-0"
              onClick={() => setPinnedLogRowId(null)}
              aria-label={t('foodTracker.ladderUi.logLink.close', { defaultValue: 'Close' })}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <LadderQuickLogControls
            row={pinnedLogRow}
            foodName={foodNameById.get(pinnedLogRow.foodId) ?? t('foodLadder.unknownFood')}
            kidName={kid.name}
            mealSlot={pinnedLogRow.preferredMealSlot}
            onLog={logAttempt}
            onUndo={undoLog}
            announce={setLiveMessage}
          />
        </section>
      ) : null}

      {masteryCandidates.length > 0 ? (
        <section
          aria-labelledby="ladder-mastery-heading"
          className="space-y-3 rounded-xl border border-border p-4"
        >
          <h2 id="ladder-mastery-heading" className="text-base font-semibold text-foreground">
            {masteredFoodName
              ? t('foodLadder.mastery.titleFor', { food: masteredFoodName })
              : t('foodLadder.mastery.title')}
          </h2>
          <p className="max-w-[68ch] text-sm text-muted-foreground">
            {t('foodLadder.mastery.body')}
          </p>
          <ul className="divide-y divide-border">
            {masteryCandidates.map((candidate) => (
              <li
                key={candidate.foodId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{candidate.foodName}</p>
                  {candidate.reasons.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('foodLadder.mastery.because', { reasons: candidate.reasons.join(', ') })}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={async () => {
                    const started = await startFood(candidate.foodId, {
                      pairedSafeFoodId: candidate.anchorFoodId,
                      kidId: candidate.kidId ?? kid.id,
                    });
                    if (started.ok || started.reason === 'duplicate') {
                      if (started.ok) {
                        toast.success(t('foodLadder.mastery.started', { food: candidate.foodName }));
                      }
                      dismissMastery();
                    } else {
                      toast.error(
                        t('foodTracker.ladderUi.picker.failed', {
                          defaultValue: "Couldn't start {{food}} just now. Try again in a moment.",
                          food: candidate.foodName,
                        })
                      );
                    }
                  }}
                >
                  {t('foodLadder.mastery.start')}
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="min-h-11" onClick={dismissMastery}>
            {t('foodLadder.mastery.notNow')}
          </Button>
        </section>
      ) : null}

      <div ref={listRef} className="space-y-8">
        {GROUP_ORDER.map((key) => {
          const section = groups[key];
          if (section.length === 0) return null;
          const headingId = `ladder-group-${key}`;
          return (
            <section key={key} aria-labelledby={headingId} data-group={key}>
              <div className="flex items-baseline gap-2">
                <h2 id={headingId} className="text-base font-semibold text-foreground">
                  {groupCopy[key].title}
                </h2>
                <span className="text-sm text-muted-foreground">{section.length}</span>
              </div>
              <p className="mt-0.5 max-w-[68ch] text-sm text-muted-foreground">
                {groupCopy[key].body}
              </p>
              <ul className="mt-2 divide-y divide-border border-y border-border">
                {section.map((row) => {
                  const food = foodById.get(row.foodId);
                  const alreadyAlwaysEats = listHas(kid.always_eats_foods, food, row.foodId);
                  return (
                    <LadderOverviewRow
                      key={row.id}
                      row={row}
                      group={key}
                      kid={kid}
                      food={food}
                      anchorName={
                        row.pairedSafeFoodId ? foodNameById.get(row.pairedSafeFoodId) ?? null : null
                      }
                      stalled={groups.stalledIds.has(row.id)}
                      exposures={exposuresByFood.get(row.foodId)}
                      today={today}
                      onLog={logAttempt}
                      onUndo={undoLog}
                      onPause={pause}
                      onResume={resume}
                      onStepDown={stepDown}
                      onRemove={removeFromLadder}
                      onRestore={restoreRow}
                      onAddToAlwaysEats={
                        key === 'safeNow' &&
                        !alreadyAlwaysEats &&
                        !addingAlwaysEats.has(row.foodId)
                          ? (r) => void handleAddToAlwaysEats(r)
                          : undefined
                      }
                      announce={setLiveMessage}
                    />
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="max-w-[68ch] text-sm text-muted-foreground">{t('foodLadder.disclaimer')}</p>
      {picker}
    </div>
  );
}
