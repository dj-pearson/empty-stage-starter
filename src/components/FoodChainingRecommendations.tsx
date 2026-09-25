/**
 * Food chaining: the next small step from a food this child already eats.
 *
 * The page hands in one resolved child (`key={kid.id}`), so nothing here reads
 * the globally active kid. Everything a tap writes is captured from the
 * candidate it was computed for, never from whoever is selected at tap time.
 *
 * Where suggestions come from:
 *   - A pure client scorer (scoreChainCandidates) over the household pantry,
 *     plus ONE household-scoped food_properties read. It renders before the
 *     network answers, and still renders when the network fails.
 *   - get_food_chain_suggestions, merged in when it answers. Its cache table is
 *     SELECT-only under RLS, so this component never tries to fill it.
 *
 * Every candidate from either source goes through selectHandoffCandidates
 * with foodsById, which reads the food's name as well as its tags: an
 * untagged "Peanut butter crackers" is still a peanut food. An allergy with no
 * recorded severity is dropped like a severe one.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  CalendarPlus,
  ChevronRight,
  Layers,
  Palette,
  Shapes,
  Soup,
  Tag,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import '@/i18n/appLocale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WinNetworkPanel } from '@/components/WinNetworkPanel';
import { useFoods } from '@/contexts/AppContext';
import { usePlan } from '@/contexts/PlanContext';
import { useFoodLadder, type LadderRow, type StartFoodResult } from '@/hooks/useFoodLadder';
import { useChainAnchors } from '@/hooks/useChainAnchors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { supabase } from '@/integrations/supabase/client';
import type { ChainAnchor } from '@/lib/chainAnchors';
import {
  closenessLevel,
  mergeRpcSuggestions,
  normalizeReason,
  scoreChainCandidates,
  type FoodPropsLite,
  type ReasonKey,
  type ScoredChainSuggestion,
} from '@/lib/chainSimilarity';
import { getKidFoodFit, isAllergyUnknown, type ResultIndex } from '@/lib/kidFit';
import { kidSafeFoodIds } from '@/lib/kidProgress';
import {
  DEFAULT_HANDOFF_LIMIT,
  selectHandoffCandidates,
  type MasteryCandidate,
} from '@/lib/ladderMastery';
import { logger } from '@/lib/logger';
import { manualAddPrompt } from '@/lib/planAllergenGuard';
import { cn } from '@/lib/utils';
import type { Food, Kid } from '@/types';

const RPC_LIMIT = 10;
/** One `.in()` over more ids than this is a URL the gateway refuses. */
const PROPS_ID_CAP = 500;
const BRIDGE_ANCHOR_LIMIT = 3;
const NO_HISTORY: ResultIndex = new Map();
const PROPS_COLUMNS =
  'food_id, texture_primary, texture_secondary, flavor_profile, color_primary, color_secondary, visual_complexity, food_category';

const REASON_ICONS: Record<ReasonKey, LucideIcon> = {
  taste: Soup,
  texture: Layers,
  color: Palette,
  shape: Shapes,
  type: Tag,
};

const REASON_DEFAULTS: Record<ReasonKey, string> = {
  taste: 'Similar taste',
  texture: 'Similar texture',
  color: 'Similar color',
  shape: 'Similar shape',
  type: 'Same kind of food',
};

const CLOSENESS_DEFAULTS = {
  small: 'Small step',
  medium: 'Medium step',
  big: 'Bigger step',
} as const;

interface RpcRow {
  food_id: string;
  food_name: string;
  similarity_score: number | null;
  reasons: string[] | null;
}

interface SuggestionResult {
  source: string;
  rpcRows: RpcRow[];
  props: Map<string, FoodPropsLite>;
}

type ListFormatCtor = new (
  locale: string,
  options: { style: 'long'; type: 'conjunction' },
) => { format: (items: readonly string[]) => string };

interface Selection {
  kidId: string;
  foodId: string;
}

interface FoodChainingRecommendationsProps {
  kid: Kid;
  targetFoodId?: string | null;
}

function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toRpcRows(data: unknown): RpcRow[] {
  if (!Array.isArray(data)) return [];
  const out: RpcRow[] = [];
  for (const raw of data as Array<Partial<RpcRow> | null>) {
    if (!raw || typeof raw.food_id !== 'string') continue;
    out.push({
      food_id: raw.food_id,
      food_name: typeof raw.food_name === 'string' ? raw.food_name : '',
      similarity_score: typeof raw.similarity_score === 'number' ? raw.similarity_score : null,
      reasons: Array.isArray(raw.reasons) ? raw.reasons : null,
    });
  }
  return out;
}

function toPropsMap(data: unknown): Map<string, FoodPropsLite> {
  const map = new Map<string, FoodPropsLite>();
  if (!Array.isArray(data)) return map;
  for (const raw of data as Array<FoodPropsLite | null>) {
    if (raw && typeof raw.food_id === 'string') map.set(raw.food_id, raw);
  }
  return map;
}

function reasonKeys(reasons: readonly string[]): ReasonKey[] {
  const out: ReasonKey[] = [];
  for (const raw of reasons) {
    const key = normalizeReason(raw);
    if (key && !out.includes(key)) out.push(key);
  }
  return out.slice(0, 3);
}

export function FoodChainingRecommendations({ kid, targetFoodId = null }: FoodChainingRecommendationsProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { foods, addFood } = useFoods();
  const { planEntries, addPlanEntry, deletePlanEntry } = usePlan();
  const { rows, loading: ladderLoading, startFood, removeFromLadder } = useFoodLadder(kid.id);
  const { status, anchors, retry } = useChainAnchors(kid, rows, ladderLoading);

  const foodsById = useMemo(() => new Map(foods.map((f) => [f.id, f] as const)), [foods]);
  const foodsRef = useRef(foods);
  foodsRef.current = foods;

  const [selection, setSelection] = useState<Selection | null>(null);
  const selectedAnchor: ChainAnchor | null = useMemo(() => {
    if (selection && selection.kidId === kid.id) {
      const match = anchors.find((a) => a.foodId === selection.foodId);
      if (match) return match;
    }
    return anchors[0] ?? null;
  }, [anchors, selection, kid.id]);
  const anchorId = selectedAnchor?.foodId ?? null;
  const anchorFood = anchorId ? foodsById.get(anchorId) ?? null : null;

  const [bridgeDismissed, setBridgeDismissed] = useState(false);
  const bridgeTarget = !bridgeDismissed && targetFoodId ? foodsById.get(targetFoodId) ?? null : null;

  // ---------------------------------------------------------------------------
  // Suggestions: client score now, RPC and properties merged when they land.
  // ---------------------------------------------------------------------------
  const requestKey = anchorId ? `${kid.id}|${anchorId}` : null;
  const pantryIds = useMemo(() => foods.map((f) => f.id).slice(0, PROPS_ID_CAP), [foods]);
  const pantryKey = pantryIds.join(',');
  const pantryIdsRef = useRef(pantryIds);
  pantryIdsRef.current = pantryIds;
  const [result, setResult] = useState<SuggestionResult | null>(null);

  useEffect(() => {
    if (!requestKey || !anchorId) return;
    let cancelled = false;
    const ids = pantryIdsRef.current;
    (async () => {
      const [rpcOutcome, propsOutcome] = await Promise.allSettled([
        supabase.rpc('get_food_chain_suggestions', { source_food: anchorId, limit_count: RPC_LIMIT }),
        ids.length > 0
          ? supabase.from('food_properties').select(PROPS_COLUMNS).in('food_id', ids)
          : Promise.resolve({ data: [], error: null }),
      ]);
      let rpcRows: RpcRow[] = [];
      if (rpcOutcome.status === 'fulfilled' && !rpcOutcome.value.error) {
        rpcRows = toRpcRows(rpcOutcome.value.data);
      } else {
        logger.warn('Chain suggestions RPC unavailable; showing client scores only');
      }
      let props = new Map<string, FoodPropsLite>();
      if (propsOutcome.status === 'fulfilled' && !propsOutcome.value.error) {
        props = toPropsMap(propsOutcome.value.data);
      } else {
        logger.warn('Food properties unavailable; scoring on names and categories');
      }
      if (!cancelled) setResult({ source: requestKey, rpcRows, props });
    })();
    return () => {
      cancelled = true;
    };
  }, [requestKey, anchorId, pantryKey]);

  const current = result && result.source === requestKey ? result : null;
  const suggestionsPending = requestKey !== null && current === null;
  /** Properties do not depend on the anchor, so bridge mode may use whichever answer came back. */
  const anyProps = useMemo(() => result?.props ?? new Map<string, FoodPropsLite>(), [result]);

  const merged: ScoredChainSuggestion[] = useMemo(() => {
    if (!anchorFood) return [];
    const client = scoreChainCandidates(anchorFood, foods, current?.props ?? new Map());
    return mergeRpcSuggestions(client, current?.rpcRows ?? []);
  }, [anchorFood, foods, current]);

  const ladderFoodIds = useMemo(() => rows.map((r) => r.foodId), [rows]);

  const safeIds = useMemo(
    () =>
      kidSafeFoodIds(
        kid,
        rows.map((r) => ({ kid_id: r.kidId, food_id: r.foodId, status: r.status, current_rung: r.currentRung })),
        foodsById,
      ),
    [kid, rows, foodsById],
  );

  const allergensByFoodId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const f of foods) if (Array.isArray(f.allergens)) map.set(f.id, f.allergens);
    return map;
  }, [foods]);

  const candidates: MasteryCandidate[] = useMemo(() => {
    if (!anchorId) return [];
    const prefiltered = merged.filter((s) => {
      if (safeIds.has(s.foodId)) return false;
      const food = foodsById.get(s.foodId);
      if (food) {
        const fit = getKidFoodFit(kid, food, NO_HISTORY);
        if (fit.disliked || fit.allergen) return false;
      }
      return true;
    });
    return selectHandoffCandidates(prefiltered, {
      masteredFoodId: anchorId,
      ladderFoodIds,
      kidAllergens: kid.allergens ?? [],
      allergensByFoodId,
      foodsById,
      kidId: kid.id,
      limit: DEFAULT_HANDOFF_LIMIT,
    });
  }, [anchorId, merged, safeIds, foodsById, kid, ladderFoodIds, allergensByFoodId]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const [busyFoodId, setBusyFoodId] = useState<string | null>(null);
  const busyRef = useRef(false);

  const openLadder = useCallback(
    (foodId: string) => navigate(`/dashboard/food-tracker?food=${encodeURIComponent(foodId)}`),
    [navigate],
  );

  const reportStart = useCallback(
    (outcome: StartFoodResult, foodId: string, name: string) => {
      if (outcome.ok) {
        const row: LadderRow = outcome.row;
        toast.success(t('foodChaining.toast.started', { name, defaultValue: '{{name}} is on the ladder' }), {
          action: {
            label: t('foodChaining.actions.undo', { defaultValue: 'Undo' }),
            onClick: () => {
              void removeFromLadder(row);
            },
          },
          cancel: {
            label: t('foodChaining.actions.openLadder', { defaultValue: 'Open ladder' }),
            onClick: () => openLadder(foodId),
          },
        });
        return;
      }
      if (outcome.reason === 'duplicate') {
        toast.info(
          t('foodChaining.toast.alreadyOnLadder', { name, defaultValue: '{{name}} is already on the ladder' }),
          {
            action: {
              label: t('foodChaining.actions.openLadder', { defaultValue: 'Open ladder' }),
              onClick: () => openLadder(foodId),
            },
          },
        );
      } else if (outcome.reason === 'cap') {
        toast.error(
          t('foodChaining.toast.cap', {
            defaultValue: 'The ladder is full for now. Finish or pause a food first.',
          }),
        );
      } else {
        toast.error(t('foodChaining.toast.error', { defaultValue: "That didn't save. Please try again." }));
      }
    },
    [t, removeFromLadder, openLadder],
  );

  const runExclusive = useCallback(async (foodId: string, work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyFoodId(foodId);
    try {
      await work();
    } catch (err) {
      logger.error('Food chaining action failed:', err);
      toast.error(t('foodChaining.toast.error', { defaultValue: "That didn't save. Please try again." }));
    } finally {
      busyRef.current = false;
      setBusyFoodId(null);
    }
  }, [t]);

  const handleStart = useCallback(
    (c: MasteryCandidate) =>
      runExclusive(c.foodId, async () => {
        const kidId = c.kidId ?? kid.id;
        const outcome = await startFood(c.foodId, { pairedSafeFoodId: c.anchorFoodId, kidId });
        reportStart(outcome, c.foodId, c.foodName);
      }),
    [runExclusive, startFood, reportStart, kid.id],
  );

  const handleAddToPlan = useCallback(
    (c: MasteryCandidate) =>
      runExclusive(c.foodId, async () => {
        const kidId = c.kidId ?? kid.id;
        if (manualAddPrompt([kid], [c.foodId], foodsById) !== null) {
          toast.error(
            t('foodChaining.toast.allergenRefused', {
              name: c.foodName,
              kid: kid.name,
              defaultValue: "{{name}} conflicts with {{kid}}'s allergies, so it wasn't added.",
            }),
          );
          return;
        }
        const now = new Date();
        const today = localIsoDate(now);
        const hasTryBiteToday = planEntries.some(
          (e) => e.kid_id === kidId && e.date === today && e.meal_slot === 'try_bite',
        );
        const date = hasTryBiteToday
          ? localIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
          : today;
        const added = await addPlanEntry({
          kid_id: kidId,
          food_id: c.foodId,
          date,
          meal_slot: 'try_bite',
          result: null,
        });
        if (added.error) return;
        const insertedId = added.insertedIds[0];
        toast.success(
          hasTryBiteToday
            ? t('foodChaining.toast.plannedTomorrow', {
                name: c.foodName,
                defaultValue: "{{name}} is tomorrow's try bite",
              })
            : t('foodChaining.toast.plannedToday', { name: c.foodName, defaultValue: "{{name}} is today's try bite" }),
          insertedId
            ? {
                action: {
                  label: t('foodChaining.actions.undo', { defaultValue: 'Undo' }),
                  onClick: () => {
                    void deletePlanEntry(insertedId);
                  },
                },
              }
            : undefined,
        );
      }),
    [runExclusive, kid, foodsById, planEntries, addPlanEntry, deletePlanEntry, t],
  );

  const handleBridgeStart = useCallback(
    (target: Food, anchor: ChainAnchor) =>
      runExclusive(target.id, async () => {
        const outcome = await startFood(target.id, { pairedSafeFoodId: anchor.foodId, kidId: kid.id });
        reportStart(outcome, target.id, target.name);
      }),
    [runExclusive, startFood, reportStart, kid.id],
  );

  // Win Network: the same single ladder instance starts its picks.
  const onWinStartFood = useCallback(
    (foodId: string, kidId: string, pairedSafeFoodId: string | null) =>
      startFood(foodId, { pairedSafeFoodId, kidId }),
    [startFood],
  );

  const anchorCategory = anchorFood?.category ?? 'snack';
  const onWinCreateFood = useCallback(
    async (name: string): Promise<Food | null> => {
      const wanted = name.trim().toLowerCase();
      const before = new Set(foodsRef.current.map((f) => f.id));
      const ok = await addFood({
        name: name.trim(),
        category: anchorCategory,
        is_safe: false,
        is_try_bite: true,
        quantity: 0,
      });
      if (!ok) return null;
      // addFood resolves with a boolean; the row reaches us through state.
      for (let i = 0; i < 20; i += 1) {
        const created = foodsRef.current.find(
          (f) => !before.has(f.id) && f.name.trim().toLowerCase() === wanted,
        );
        if (created) return created;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return null;
    },
    [addFood, anchorCategory],
  );

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const transition = reducedMotion ? '' : 'transition-colors';

  const anchorHint = (a: ChainAnchor): string => {
    switch (a.source) {
      case 'always':
        return t('foodChaining.anchors.always', { defaultValue: 'always eats' });
      case 'mastered':
        return t('foodChaining.anchors.mastered', { defaultValue: 'mastered' });
      case 'reliable':
        return t('foodChaining.anchors.reliable', {
          count: a.tries ?? 0,
          ate: a.ate ?? 0,
          tries: a.tries ?? 0,
          defaultValue: 'ate {{ate}} of {{tries}}',
        });
      case 'climbing':
        return t('foodChaining.anchors.climbing', { defaultValue: 'climbing' });
      case 'household':
      default:
        return t('foodChaining.anchors.household', { defaultValue: 'household safe food' });
    }
  };

  const allergyList = useMemo(() => {
    const list = (kid.allergens ?? []).filter((a) => typeof a === 'string' && a.trim());
    if (list.length === 0) return '';
    // Intl.ListFormat is ES2021; the app's lib target predates it.
    const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat;
    if (!ListFormat) return list.join(', ');
    try {
      return new ListFormat(i18n.language || 'en', { style: 'long', type: 'conjunction' }).format(list);
    } catch {
      return list.join(', ');
    }
  }, [kid.allergens, i18n.language]);

  const allergyNotice = isAllergyUnknown(kid) ? (
    <p className="text-sm text-muted-foreground">
      {t('foodChaining.allergiesUnknown', {
        name: kid.name,
        defaultValue: "{{name}}'s allergies aren't recorded yet, so suggestions can't be checked against them.",
      })}{' '}
      <Link to="/dashboard/kids" className="font-medium text-primary underline underline-offset-4">
        {t('foodChaining.addAllergies', { defaultValue: 'Add allergies' })}
      </Link>
    </p>
  ) : allergyList ? (
    <p className="text-sm text-muted-foreground">
      {t('foodChaining.checkedAgainst', {
        name: kid.name,
        list: allergyList,
        defaultValue: "Checked against {{name}}'s allergies ({{list}})",
      })}
    </p>
  ) : null;

  const renderReasons = (reasons: readonly string[]) => {
    const keys = reasonKeys(reasons);
    if (keys.length === 0) return null;
    return (
      <ul className="flex flex-wrap gap-1.5" aria-label={t('foodChaining.reasonsLabel', { defaultValue: 'Why it is close' })}>
        {keys.map((key) => {
          const Icon = REASON_ICONS[key];
          return (
            <li key={key}>
              <Badge variant="secondary" className="gap-1 font-normal">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {t(`foodChaining.reason.${key}`, { defaultValue: REASON_DEFAULTS[key] })}
              </Badge>
            </li>
          );
        })}
      </ul>
    );
  };

  const closenessLabel = (score: number) => {
    const level = closenessLevel(score);
    return t(`foodChaining.closeness.${level}`, { defaultValue: CLOSENESS_DEFAULTS[level] });
  };

  // ---------------------------------------------------------------------------
  // States
  // ---------------------------------------------------------------------------
  if (status === 'loading' && anchors.length === 0) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 w-32 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="divide-y rounded-xl border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statusLine =
    status === 'error' ? (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
        <span>{t('foodChaining.error', { defaultValue: "Couldn't load the foods this chain starts from." })}</span>
        <Button variant="outline" size="sm" className="min-h-11" onClick={retry}>
          {t('foodChaining.retry', { defaultValue: 'Retry' })}
        </Button>
      </div>
    ) : status === 'offline' ? (
      <p className="text-sm text-muted-foreground">
        {t('foodChaining.offline', { defaultValue: "You're offline. Showing what's saved on this device." })}
      </p>
    ) : null;

  if (anchors.length === 0) {
    return (
      <div className="space-y-3">
        {statusLine}
        {status !== 'error' && (
          <div className="rounded-xl border p-4 text-sm">
            <p className="text-muted-foreground">
              {t('foodChaining.empty.noAnchors', {
                name: kid.name,
                defaultValue: "A chain starts from a food {{name}} already eats, and there isn't one yet.",
              })}
            </p>
            <Link
              to="/dashboard/kids"
              className="mt-2 inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
            >
              {t('foodChaining.empty.addAlwaysEats', {
                name: kid.name,
                defaultValue: 'Add foods {{name}} always eats',
              })}
            </Link>
          </div>
        )}
      </div>
    );
  }

  // Bridge mode: a specific target food, opened from a deep link.
  let bridge: ReactElement | null = null;
  if (bridgeTarget) {
    const conflict = manualAddPrompt([kid], [bridgeTarget.id], foodsById);
    const alreadyOnLadder = ladderFoodIds.includes(bridgeTarget.id);
    const rankedAnchors = conflict
      ? []
      : anchors
          .filter((a) => a.foodId !== bridgeTarget.id)
          .map((a) => {
            const food = foodsById.get(a.foodId);
            const scored = food ? scoreChainCandidates(food, [bridgeTarget], anyProps)[0] : undefined;
            return { anchor: a, score: scored?.similarityScore ?? 0, reasons: scored?.reasons ?? [] };
          })
          .sort((x, y) => y.score - x.score)
          .slice(0, BRIDGE_ANCHOR_LIMIT);
    const busy = busyFoodId === bridgeTarget.id;

    bridge = (
      <section aria-labelledby="food-chaining-bridge" className="space-y-3">
        <h2 id="food-chaining-bridge" className="text-lg font-semibold">
          {t('foodChaining.bridge.title', { food: bridgeTarget.name, defaultValue: 'Bridge to {{food}}' })}
        </h2>
        {conflict ? (
          <p role="alert" className="text-sm text-destructive">
            {t('foodChaining.bridge.allergen', {
              food: bridgeTarget.name,
              name: kid.name,
              defaultValue:
                "{{food}} conflicts with {{name}}'s allergies. Talk to {{name}}'s pediatrician or allergist before offering it.",
            })}
          </p>
        ) : alreadyOnLadder ? (
          <p className="text-sm text-muted-foreground">
            {t('foodChaining.toast.alreadyOnLadder', {
              name: bridgeTarget.name,
              defaultValue: '{{name}} is already on the ladder',
            })}{' '}
            <Link
              to={`/dashboard/food-tracker?food=${encodeURIComponent(bridgeTarget.id)}`}
              className="font-medium text-primary underline underline-offset-4"
            >
              {t('foodChaining.actions.openLadder', { defaultValue: 'Open ladder' })}
            </Link>
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {rankedAnchors.map(({ anchor, score, reasons }) => (
              <li key={anchor.foodId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <p className="font-medium">
                    {t('foodChaining.bridge.startWith', {
                      food: bridgeTarget.name,
                      anchor: anchor.name,
                      defaultValue: 'Start {{food}} with {{anchor}}',
                    })}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{anchorHint(anchor)}</span>
                    {score > 0 && renderReasons(reasons)}
                  </div>
                </div>
                <Button
                  className="min-h-11 w-full sm:w-auto"
                  disabled={busyFoodId !== null}
                  aria-busy={busy}
                  onClick={() => void handleBridgeStart(bridgeTarget, anchor)}
                >
                  <TrendingUp className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t('foodChaining.actions.startOnLadder', { defaultValue: 'Start on ladder' })}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="ghost" className="min-h-11" onClick={() => setBridgeDismissed(true)}>
          {t('foodChaining.bridge.showAll', { defaultValue: 'Show all next links' })}
        </Button>
      </section>
    );
  }

  const chainBusy = status === 'loading' || (suggestionsPending && candidates.length === 0);

  return (
    <div className="space-y-6">
      {statusLine}
      {allergyNotice}

      <div
        role="group"
        aria-label={t('foodChaining.anchors.label', { defaultValue: 'Start from a food they already eat' })}
        className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
      >
        {anchors.map((a) => {
          const pressed = a.foodId === anchorId;
          return (
            <button
              key={a.foodId}
              type="button"
              aria-pressed={pressed}
              onClick={() => setSelection({ kidId: kid.id, foodId: a.foodId })}
              className={cn(
                'flex min-h-11 shrink-0 snap-start flex-col items-start justify-center rounded-full border px-4 py-1.5 text-left',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                transition,
                pressed
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-muted',
              )}
            >
              <span className="text-sm font-medium leading-tight">{a.name}</span>
              <span className={cn('text-xs leading-tight', pressed ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {anchorHint(a)}
              </span>
            </button>
          );
        })}
      </div>

      {bridge ?? (
        <section aria-live="polite" aria-busy={chainBusy} className="space-y-3">
          {selectedAnchor && (
            <ol
              aria-label={t('foodChaining.chainFor', {
                food: selectedAnchor.name,
                defaultValue: 'Next links from {{food}}',
              })}
              className="flex flex-col divide-y rounded-xl border md:flex-row md:divide-x md:divide-y-0"
            >
              <li className="flex items-center p-4">
                <span className="inline-flex min-h-11 items-center rounded-full bg-secondary px-4 text-sm font-medium text-secondary-foreground">
                  {selectedAnchor.name}
                </span>
              </li>
              {candidates.length === 0 && chainBusy ? (
                <li className="flex-1 space-y-2 p-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                </li>
              ) : candidates.length === 0 ? (
                <li className="flex-1 p-4 text-sm text-muted-foreground">
                  {t('foodChaining.empty.noMatches', {
                    food: selectedAnchor.name,
                    defaultValue:
                      'Nothing in your pantry is close enough to {{food}} yet. Add a food that shares its taste or texture and it will show up here.',
                  })}
                </li>
              ) : (
                candidates.map((c, index) => {
                  const busy = busyFoodId === c.foodId;
                  const disabled = busyFoodId !== null;
                  const hero = index === 0;
                  return (
                    <li key={c.foodId} className="flex flex-1 items-start gap-2 p-4">
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <p className={cn('font-semibold', hero ? 'text-lg' : 'text-base')}>{c.foodName}</p>
                          <span className="text-xs text-muted-foreground">{closenessLabel(c.similarityScore)}</span>
                        </div>
                        {renderReasons(c.reasons)}
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <Button
                            size="sm"
                            variant={hero ? 'default' : 'outline'}
                            className="min-h-11 w-full sm:w-auto"
                            disabled={disabled}
                            aria-busy={busy}
                            aria-label={t('foodChaining.actions.startOnLadderFor', {
                              food: c.foodName,
                              kid: kid.name,
                              defaultValue: "Start {{food}} on {{kid}}'s ladder",
                            })}
                            onClick={() => void handleStart(c)}
                          >
                            <TrendingUp className="mr-2 h-4 w-4" aria-hidden="true" />
                            {t('foodChaining.actions.startOnLadder', { defaultValue: 'Start on ladder' })}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11 w-full sm:w-auto"
                            disabled={disabled}
                            aria-busy={busy}
                            aria-label={t('foodChaining.actions.addToPlanFor', {
                              food: c.foodName,
                              kid: kid.name,
                              defaultValue: "Add {{food}} to {{kid}}'s plan as a try bite",
                            })}
                            onClick={() => void handleAddToPlan(c)}
                          >
                            <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                            {t('foodChaining.actions.addToPlan', { defaultValue: 'Add to plan' })}
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ol>
          )}
        </section>
      )}

      <WinNetworkPanel
        kid={kid}
        sourceFoodId={selectedAnchor?.foodId ?? null}
        sourceFoodName={selectedAnchor?.name ?? null}
        foods={foods}
        ladderFoodIds={ladderFoodIds}
        onStartFood={onWinStartFood}
        onCreateFood={onWinCreateFood}
        limit={5}
      />
    </div>
  );
}
