/**
 * Picky-Eater Win Network panel (US-296).
 *
 * Shows what other families moved on to from the anchor food the parent has
 * picked. K-anonymity (>=5 contributions) is enforced server-side, with a
 * stricter client floor behind the `picky_win_network` flag; when nothing
 * clears it we say "early days" rather than render an empty box.
 *
 * Two rules sit on top of the aggregate:
 *
 *   - The allergen floor. Every target is checked against this child's
 *     allergens (filterNetworkTargetsForKid). A hit is hidden whatever its
 *     severity, an unresolvable name is hidden for a child with an allergen,
 *     and a child whose allergy list was never set sees nothing but a link to
 *     set it.
 *   - "Try this" does what it says: it starts the food on this child's ladder
 *     (creating the household food first if needed), and only a real start is
 *     toasted or counted as adopted.
 */

import '@/i18n/appLocale';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Network, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  bucketPickiness,
  fetchTopChainNetworkTargets,
  filterNetworkTargetsForKid,
  mergeNetworkTargetsByFood,
  normalizeChainFoodName,
  type ChainNetworkTarget,
  type PickinessBucket,
} from '@/lib/chainNetwork';
import { applyPickyWinKAnonGuard, COMMUNITY_WINS_MIN_SAMPLE_SIZE } from '@/lib/pickyWinGuard';
import { matchingFoodAllergen } from '@/lib/allergens';
import { isAllergyUnknown } from '@/lib/kidFit';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { StartFoodResult } from '@/hooks/useFoodLadder';
import { analytics } from '@/lib/analytics';
import type { Food, Kid } from '@/types';

/** The server's own k-anonymity floor, used when the stricter flag is off. */
const SERVER_MIN_SAMPLE_SIZE = 5;
/** Rows shown before "Show more". Three is a choice; more is a wall. */
const INITIAL_ROWS = 3;
/** Always ask for the server maximum: merging and the allergen floor thin it. */
const FETCH_LIMIT = 25;

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface LoadedRows {
  kidId: string;
  source: string;
  rows: ChainNetworkTarget[];
}

export interface WinNetworkPanelProps {
  kid: Pick<Kid, 'id' | 'name' | 'allergens' | 'allergen_severity' | 'pickiness_level'>;
  /** The anchor food the chain starts from; recorded as the paired safe food. */
  sourceFoodId: string | null;
  sourceFoodName: string | null;
  /** Household foods, used to resolve a network name to a real food. */
  foods: readonly Food[];
  /** Foods already on this child's ladder. */
  ladderFoodIds: readonly string[];
  onStartFood: (
    foodId: string,
    kidId: string,
    pairedSafeFoodId: string | null
  ) => Promise<StartFoodResult>;
  onCreateFood: (name: string) => Promise<Food | null>;
  /** Most rows shown after "Show more". Defaults to 5. */
  limit?: number;
  /** Render nothing when no source food is picked. */
  hideWhenEmpty?: boolean;
}

/** "buttered pasta" -> "Buttered pasta". Done in JS so screen readers match. */
function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}

export function WinNetworkPanel({
  kid,
  sourceFoodId,
  sourceFoodName,
  foods,
  ladderFoodIds,
  onStartFood,
  onCreateFood,
  limit = 5,
  hideWhenEmpty,
}: WinNetworkPanelProps) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const reducedMotion = useReducedMotion();

  // US-296: the dedicated community-wins surface is flag-gated (default OFF).
  // When ON, the client floor tightens from the server's 5 to the AC's 20.
  const communityWinsEnabled = useFeatureFlag('picky_win_network', false);

  const kidId = kid.id;
  const allergiesUnknown = isAllergyUnknown(kid);
  const source = sourceFoodName?.trim() ?? '';
  const bucket: PickinessBucket = useMemo(
    () => bucketPickiness(kid.pickiness_level ?? null),
    [kid.pickiness_level]
  );

  const [status, setStatus] = useState<Status>('idle');
  const [loaded, setLoaded] = useState<LoadedRows | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    setExpanded(false);
    if (!source || allergiesUnknown) {
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    void fetchTopChainNetworkTargets(
      source,
      bucket === 'unknown' ? undefined : bucket,
      FETCH_LIMIT
    ).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setStatus('error');
        return;
      }
      setLoaded({ kidId, source, rows: result.rows });
      setStatus('ready');
    });
    return () => {
      cancelled = true;
      // A superseded request must never leave the panel stuck on loading.
      setStatus((s) => (s === 'loading' ? 'idle' : s));
    };
    // limit and communityWinsEnabled change what is shown, and re-running
    // is cheap: the fetch is cached per source|bucket|limit.
  }, [kidId, source, bucket, limit, communityWinsEnabled, allergiesUnknown, retryNonce]);

  // Rows fetched for another child are never shown for this one.
  const rowsForKid = loaded && loaded.kidId === kidId ? loaded.rows : null;
  const kidAllergens = kid.allergens;

  const filtered = useMemo(() => {
    if (!rowsForKid) return null;
    const guarded = applyPickyWinKAnonGuard(rowsForKid, {
      minSampleSize: communityWinsEnabled ? COMMUNITY_WINS_MIN_SAMPLE_SIZE : SERVER_MIN_SAMPLE_SIZE,
    });
    const merged = mergeNetworkTargetsByFood(guarded, bucket);
    return filterNetworkTargetsForKid(merged, { allergens: kidAllergens }, foods);
  }, [rowsForKid, communityWinsEnabled, bucket, kidAllergens, foods]);

  const foodsByKey = useMemo(() => {
    const map = new Map<string, Food>();
    for (const f of foods) {
      const key = normalizeChainFoodName(f.name);
      if (key && !map.has(key)) map.set(key, f);
    }
    return map;
  }, [foods]);

  const ladderSet = useMemo(() => new Set(ladderFoodIds), [ladderFoodIds]);

  const visible = filtered?.visible ?? [];
  const hiddenCount = filtered?.hiddenCount ?? 0;
  const cap = Math.max(INITIAL_ROWS, limit);
  const shown = visible.slice(0, expanded ? cap : INITIAL_ROWS);
  const canShowMore = !expanded && visible.length > INITIAL_ROWS && cap > INITIAL_ROWS;

  const percent = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language || undefined, {
        style: 'percent',
        maximumFractionDigits: 0,
      }),
    [i18n.language]
  );

  // Telemetry: one event per distinct set of rows on screen.
  const shownKeys = shown.map((r) => r.targetFoodKey);
  const shownFingerprint = `${kidId}|${source}|${shownKeys.join(',')}`;
  const cardShownRef = useRef('');
  useEffect(() => {
    if (status !== 'ready' || shownKeys.length === 0) return;
    if (cardShownRef.current === shownFingerprint) return;
    cardShownRef.current = shownFingerprint;
    analytics.trackEvent('picky_win_card_shown', {
      target_count: shownKeys.length,
      keys: shownKeys,
      pickiness_bucket: bucket,
    });
    // shownKeys is derived from shownFingerprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, shownFingerprint, bucket]);

  const handleTry = useCallback(
    async (target: ChainNetworkTarget) => {
      // Captured at tap time: a child switch mid-request must not redirect it.
      const tapKidId = kid.id;
      const tapKidName = kid.name;
      const tapAllergens = kid.allergens ?? [];
      const tapSourceId = sourceFoodId;
      const key = target.targetFoodKey;
      let food = foodsByKey.get(key) ?? null;
      const label = food?.name ?? sentenceCase(key);

      setBusyKey(key);
      try {
        if (!food) {
          const created = await onCreateFood(sentenceCase(key));
          if (!created) {
            toast.error(
              t('foodChaining.winNetwork.toast.createFailed', {
                defaultValue: "Couldn't add {{food}} to your foods.",
                food: label,
              })
            );
            return;
          }
          // The created row may carry tags the bare name did not.
          if (matchingFoodAllergen(tapAllergens, created) !== null) {
            toast.error(
              t('foodChaining.winNetwork.toast.allergen', {
                defaultValue: "{{food}} matches {{kid}}'s allergies, so it wasn't started.",
                food: created.name,
                kid: tapKidName,
              })
            );
            return;
          }
          food = created;
        }

        const result = await onStartFood(food.id, tapKidId, tapSourceId);
        if (result.ok) {
          toast.success(
            t('foodChaining.winNetwork.toast.started', {
              defaultValue: "{{food}} is on {{kid}}'s ladder.",
              food: food.name,
              kid: tapKidName,
            })
          );
          analytics.trackEvent('picky_win_chain_adopted', {
            target_food_key: key,
            sample_size: target.totalCount,
            pickiness_bucket: target.pickinessBucket,
          });
          return;
        }
        if (result.reason === 'duplicate') {
          toast(
            t('foodChaining.winNetwork.toast.duplicate', {
              defaultValue: "{{food}} is already on {{kid}}'s ladder.",
              food: food.name,
              kid: tapKidName,
            })
          );
        } else if (result.reason === 'cap') {
          toast(
            t('foodChaining.winNetwork.toast.cap', {
              defaultValue:
                '{{kid}} already has enough new foods due today. Try {{food}} tomorrow.',
              food: food.name,
              kid: tapKidName,
            })
          );
        } else {
          toast.error(
            t('foodChaining.winNetwork.toast.error', {
              defaultValue: "Couldn't start {{food}}. Try again.",
              food: food.name,
            })
          );
        }
      } catch {
        toast.error(
          t('foodChaining.winNetwork.toast.error', {
            defaultValue: "Couldn't start {{food}}. Try again.",
            food: label,
          })
        );
      } finally {
        setBusyKey(null);
      }
    },
    [kid.id, kid.name, kid.allergens, sourceFoodId, foodsByKey, onCreateFood, onStartFood, t]
  );

  const title = t('foodChaining.winNetwork.title', { defaultValue: "Other families' wins" });

  if (!source) {
    if (hideWhenEmpty) return null;
    return (
      <section aria-labelledby={headingId} className="space-y-1">
        <h2 id={headingId} className="flex items-center gap-2 text-base font-semibold">
          <Network className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('foodChaining.winNetwork.pickSource', {
            defaultValue:
              'Pick a food your child already eats to see what other families moved on to from it.',
          })}
        </p>
      </section>
    );
  }

  const sourceLabel = sentenceCase(source);
  const bucketLabel =
    bucket === 'low'
      ? t('foodChaining.winNetwork.bucket.low', { defaultValue: 'adventurous' })
      : bucket === 'medium'
        ? t('foodChaining.winNetwork.bucket.medium', { defaultValue: 'somewhat picky' })
        : bucket === 'high'
          ? t('foodChaining.winNetwork.bucket.high', { defaultValue: 'very picky' })
          : null;

  const hiddenLine =
    hiddenCount > 0 ? (
      <p className="text-xs text-muted-foreground">
        {t('foodChaining.winNetwork.hiddenForAllergies', {
          defaultValue: "{{count}} foods hidden for {{name}}'s allergies.",
          count: hiddenCount,
          name: kid.name,
        })}
      </p>
    ) : null;

  let body: ReactNode;
  if (allergiesUnknown) {
    body = (
      <p className="text-sm text-muted-foreground">
        {t('foodChaining.winNetwork.allergiesUnknown', {
          defaultValue: "Add {{name}}'s allergies to see other families' wins.",
          name: kid.name,
        })}{' '}
        <Link
          to={`/dashboard/kids?kid=${encodeURIComponent(kid.id)}&section=allergies`}
          className="font-medium text-primary underline underline-offset-4"
        >
          {t('foodChaining.winNetwork.allergiesUnknownLink', { defaultValue: 'Set allergies' })}
        </Link>
      </p>
    );
  } else if (status === 'error') {
    body = (
      <p
        className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground"
        role="status"
      >
        {t('foodChaining.winNetwork.error', {
          defaultValue: "Couldn't load other families' wins.",
        })}
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-11 px-0"
          onClick={() => setRetryNonce((n) => n + 1)}
        >
          {t('foodChaining.winNetwork.retry', { defaultValue: 'Try again' })}
        </Button>
      </p>
    );
  } else if (rowsForKid === null) {
    body = (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  } else if (visible.length === 0) {
    // When every row was hidden for allergies, the hidden line says so alone.
    body =
      hiddenCount > 0 ? null : (
        <div className="text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t('foodChaining.winNetwork.earlyDays', {
              defaultValue: 'Early days for {{food}}.',
              food: sourceLabel,
            })}
          </p>
          <p className="mt-1">
            {t('foodChaining.winNetwork.earlyDaysFloor', {
              defaultValue:
                'We show a food once at least {{count}} tries from other families are logged. Log a try bite that works and it counts toward that.',
              count: communityWinsEnabled ? COMMUNITY_WINS_MIN_SAMPLE_SIZE : SERVER_MIN_SAMPLE_SIZE,
            })}
          </p>
        </div>
      );
  } else {
    const refreshing = status === 'loading';
    body = (
      <div
        aria-busy={refreshing}
        className={cn(
          !reducedMotion && 'transition-opacity',
          refreshing ? 'opacity-60' : 'opacity-100'
        )}
      >
        <ul className="divide-y divide-border">
          {shown.map((target) => {
            const key = target.targetFoodKey;
            const food = foodsByKey.get(key) ?? null;
            const name = food?.name ?? sentenceCase(key);
            const rate = Math.min(100, Math.max(0, target.successRate));
            const onLadder = food !== null && ladderSet.has(food.id);
            return (
              <li
                key={key}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div
                      className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <div className="h-full bg-primary" style={{ width: `${rate}%` }} />
                    </div>
                    <span className="text-sm tabular-nums">{percent.format(rate / 100)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('foodChaining.winNetwork.row.tries', {
                      defaultValue: '{{success}} of {{total}} tries went well',
                      success: target.successCount,
                      total: target.totalCount,
                    })}
                  </p>
                </div>
                {onLadder && food ? (
                  <Link
                    to={`/dashboard/food-tracker?food=${encodeURIComponent(food.id)}`}
                    aria-label={t('foodChaining.winNetwork.openOnLadder', {
                      defaultValue: 'Open {{food}} on the ladder',
                      food: name,
                    })}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-md px-3 text-sm font-medium text-primary underline-offset-4 hover:underline sm:w-auto"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {t('foodChaining.winNetwork.onLadder', { defaultValue: 'On ladder' })}
                  </Link>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={busyKey !== null}
                    aria-busy={busyKey === key}
                    aria-label={
                      food
                        ? t('foodChaining.winNetwork.startFor', {
                            defaultValue: "Start {{food}} on {{kid}}'s ladder",
                            food: name,
                            kid: kid.name,
                          })
                        : t('foodChaining.winNetwork.addAndStartFor', {
                            defaultValue:
                              "Add {{food}} to your foods and start it on {{kid}}'s ladder",
                            food: name,
                            kid: kid.name,
                          })
                    }
                    onClick={() => void handleTry(target)}
                  >
                    {food
                      ? t('foodChaining.winNetwork.tryThis', { defaultValue: 'Try this' })
                      : t('foodChaining.winNetwork.addAndStart', { defaultValue: 'Add and start' })}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {canShowMore && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => setExpanded(true)}
          >
            {t('foodChaining.winNetwork.showMore', { defaultValue: 'Show more' })}
          </Button>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="space-y-1">
        <h2 id={headingId} className="flex items-center gap-2 text-base font-semibold">
          <Network className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('foodChaining.winNetwork.fromSource', {
            defaultValue: 'What families moved on to from {{food}}.',
            food: sourceLabel,
          })}
          {bucketLabel && (
            <>
              {' '}
              {t('foodChaining.winNetwork.similarPickiness', {
                defaultValue: 'Kids who are {{bucket}}.',
                bucket: bucketLabel,
              })}
            </>
          )}
        </p>
      </div>
      {body}
      {!allergiesUnknown && status !== 'error' && hiddenLine}
    </section>
  );
}
