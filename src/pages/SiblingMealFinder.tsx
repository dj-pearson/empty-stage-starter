/**
 * Sibling Meal Finder: one dish, one slot, every child being fed.
 *
 * The page answers on open. There is one solve (buildSolverInputs +
 * findSiblingMeals over the whole library), and the header count, the hero,
 * "Other options", "Takes longer" and "Ruled out for safety" are all cut from
 * that single array, so they cannot disagree.
 *
 * Division of labour: Home's Tonight hero shows what is already on tonight,
 * the Planner arranges the week, and this page picks the one dish for one
 * slot across siblings. It links out to both rather than rendering a week or
 * a cook view of its own.
 *
 * Writes go through useRecipeQuickPlan.schedule (PlanContext.scheduleRecipe),
 * only for the kids the rows were solved for, only for kids the card says
 * are usable, and only after siblingScheduleGuard re-checks them.
 */

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ShieldAlert,
  SlidersHorizontal,
  Users2,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toast } from 'sonner';
import { useFoods, useKids, usePlan, useRecipes } from '@/contexts/AppContext';
import { useSiblingResolutions } from '@/hooks/useSiblingResolutions';
import { useRecipePlates } from '@/hooks/useRecipePlates';
import { useRecipeQuickPlan, defaultPlanSlot, weekdayLabel } from '@/hooks/useRecipeQuickPlan';
import { useOnline } from '@/hooks/useCommon';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  annotateResults,
  buildSolverInputs,
  describeExclusions,
  filterRows,
  findSiblingMeals,
  kidToSolverKid,
  parseFinderParams,
  rankReconciled,
  reconcileKidSelection,
  reconcileRow,
  type FinderMode,
  type FinderRow,
  type PrepLimit,
  type Reconciled,
  type StoredKidSelection,
} from '@/lib/siblingMealFinder';
import { siblingScheduleGuard } from '@/lib/siblingSchedule';
import { kidAllergenChips } from '@/lib/kidAllergenChips';
import type { SolverResult } from '@/lib/siblingConstraintSolver';
import type { AllergenCopyKind } from '@/lib/planAllergenGuard';
import { RECIPE_PLAN_SLOTS, slotLabel } from '@/lib/planSlotLabels';
import { addIsoDays, parseIsoDate } from '@/lib/date-utils';
import { analytics } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { todayIso } from '@/lib/tonightMode';
import { cn } from '@/lib/utils';
import { SiblingPickerChips } from '@/components/sibling-meal-finder/SiblingPickerChips';
import { SiblingMealResultCard } from '@/components/sibling-meal-finder/SiblingMealResultCard';
import { FairnessIndicator } from '@/components/sibling-meal-finder/FairnessIndicator';
import { TonightCookDialog } from '@/components/TonightCookDialog';
import type { Kid, MealSlot, Recipe } from '@/types';
import '@/i18n/appLocale';

const CONTROLS_OPEN_KEY = 'siblingMealFinder.controlsOpen';
const OTHER_OPTIONS_PAGE = 8;
const PREP_OPTIONS: readonly PrepLimit[] = ['any', 15, 30, 45];
const MODE_OPTIONS: readonly FinderMode[] = ['as_is', 'small_swaps', 'separate_plates'];
/** U+00B7 middle dot, escaped so this source stays ASCII. */
const DOT = ' \u00B7 ';

type AllergyMarker = 'severe' | 'unrated' | 'none';

interface CardRow {
  row: FinderRow;
  reconciled: Reconciled;
  unknownAllergyKidNames: string[];
}

interface BlockedLine {
  kidName: string;
  allergen?: string;
  copyKind?: AllergenCopyKind;
  cause: 'allergen' | 'plate_blocked' | 'plate_empty';
}

interface CardNotice {
  noFoods?: boolean;
  blocked: BlockedLine[];
}

function selectionKey(householdId: string | null | undefined): string {
  return `siblingMealFinder.selection.${householdId ?? 'local'}`;
}

function readStoredSelection(key: string): StoredKidSelection | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as StoredKidSelection).kidIds) &&
      Array.isArray((parsed as StoredKidSelection).knownKidIds)
    ) {
      return parsed as StoredKidSelection;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredSelection(key: string, value: StoredKidSelection): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the selection just isn't remembered.
  }
}

function readControlsOpen(): boolean {
  try {
    return localStorage.getItem(CONTROLS_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeControlsOpen(open: boolean): void {
  try {
    localStorage.setItem(CONTROLS_OPEN_KEY, open ? '1' : '0');
  } catch {
    // Not remembered; harmless.
  }
}

function allergyMarkerFor(kid: Kid): AllergyMarker {
  // kidAllergenChips matches severity keys canonically, so a severity saved as
  // "peanuts" still counts for an allergen listed as "Peanut".
  const chips = kidAllergenChips(kid);
  if (chips.some((c) => c.severity === 'severe')) return 'severe';
  if (chips.some((c) => c.severity === null)) return 'unrated';
  return 'none';
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86_400_000);
}

function joinNames(names: string[]): string {
  return names.filter(Boolean).join(', ');
}

export default function SiblingMealFinder() {
  const { t, i18n } = useTranslation();
  const { kids, kidsHydrated } = useKids();
  const { foods } = useFoods();
  const { recipes } = useRecipes();
  const { planEntries } = usePlan();
  const { householdId, history, recordResolution } = useSiblingResolutions();
  const { schedule } = useRecipeQuickPlan();
  const online = useOnline();
  const reducedMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- today, re-derived when the tab comes back -------------------------
  const [today, setToday] = useState<string>(() => todayIso());
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setToday(todayIso());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ---- deep link: URL wins over storage for this visit -------------------
  // Seeded once on mount; later URL writes come from this page itself.
  const [initialParams] = useState(() => parseFinderParams(searchParams, []));
  const params = useMemo(() => parseFinderParams(searchParams, kids), [searchParams, kids]);

  const [mealDate, setMealDate] = useState<string>(() => initialParams.date ?? todayIso());
  const [mealSlot, setMealSlot] = useState<MealSlot>(() => initialParams.slot ?? defaultPlanSlot());
  const [mode, setMode] = useState<FinderMode>('small_swaps');
  const [prep, setPrep] = useState<PrepLimit>('any');
  const [controlsOpen, setControlsOpen] = useState<boolean>(() => readControlsOpen());
  const [showAllOthers, setShowAllOthers] = useState(false);
  const [cookingRecipeId, setCookingRecipeId] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, CardNotice>>({});
  const [scheduleAnnouncement, setScheduleAnnouncement] = useState<string>('');
  const [focusResults, setFocusResults] = useState(0);

  // ---- who's eating -------------------------------------------------------
  const storageKey = selectionKey(householdId);
  const [localSelection, setLocalSelection] = useState<string[] | null>(null);

  const selectedKidIds = useMemo<string[]>(() => {
    if (kids.length === 0) return [];
    const known = new Set(kids.map((k) => k.id));
    if (localSelection) return localSelection.filter((id) => known.has(id));
    if (params.kidIds) return params.kidIds;
    return reconcileKidSelection(readStoredSelection(storageKey), kids).kidIds;
  }, [kids, localSelection, params.kidIds, storageKey]);

  const kidIdKey = selectedKidIds.join(',');
  // A stable array per distinct selection, so the deferred value only lags on a real change.
  const effectiveKidIds = useMemo(() => (kidIdKey ? kidIdKey.split(',') : []), [kidIdKey]);
  const solvedKidIds = useDeferredValue(effectiveKidIds);
  const lagging = solvedKidIds !== effectiveKidIds;

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const changeKids = useCallback(
    (ids: string[]) => {
      const knownKidIds = kids.map((k) => k.id);
      const ordered = knownKidIds.filter((id) => ids.includes(id));
      setLocalSelection(ordered);
      writeStoredSelection(storageKey, { kidIds: ordered, knownKidIds });
      updateParams({ kids: ordered.join(',') || null });
      setScheduleAnnouncement('');
    },
    [kids, storageKey, updateParams]
  );
  const selectAllKids = useCallback(() => changeKids(kids.map((k) => k.id)), [changeKids, kids]);

  const changeDate = useCallback(
    (next: string) => {
      if (!next) return;
      setMealDate(next);
      updateParams({ date: next });
      setScheduleAnnouncement('');
      setFocusResults((n) => n + 1);
    },
    [updateParams]
  );

  const changeSlot = useCallback(
    (next: string) => {
      if (!(RECIPE_PLAN_SLOTS as readonly string[]).includes(next)) return;
      setMealSlot(next as MealSlot);
      updateParams({ slot: next });
      setScheduleAnnouncement('');
      setFocusResults((n) => n + 1);
    },
    [updateParams]
  );

  const changeMode = useCallback(
    (next: string) => {
      if (!(MODE_OPTIONS as readonly string[]).includes(next)) return;
      setMode(next as FinderMode);
      analytics.trackEvent('family_finder_constraint_relaxed', {
        which_constraint: 'mode',
        value: next,
        kid_count: effectiveKidIds.length,
      });
    },
    [effectiveKidIds.length]
  );

  const changePrep = useCallback(
    (next: string) => {
      if (!next) return;
      const value: PrepLimit = next === 'any' ? 'any' : (Number(next) as PrepLimit);
      if (!PREP_OPTIONS.includes(value)) return;
      setPrep(value);
      analytics.trackEvent('family_finder_constraint_relaxed', {
        which_constraint: 'prep',
        value: String(value),
        kid_count: effectiveKidIds.length,
      });
    },
    [effectiveKidIds.length]
  );

  const toggleControls = useCallback((open: boolean) => {
    setControlsOpen(open);
    writeControlsOpen(open);
  }, []);

  // ---- the one solve ------------------------------------------------------
  const solverInputs = useMemo(() => buildSolverInputs(recipes, foods), [recipes, foods]);

  const solved = useMemo<SolverResult[]>(() => {
    if (kids.length === 0 || solvedKidIds.length === 0 || recipes.length === 0) return [];
    try {
      return findSiblingMeals({
        recipes,
        foods,
        kids,
        selectedKidIds: solvedKidIds,
        history,
        options: { limit: Infinity },
        inputs: solverInputs,
      });
    } catch (err) {
      logger.error('siblingSolver error', err);
      return [];
    }
  }, [solverInputs, recipes, foods, kids, solvedKidIds, history]);

  const rows = useMemo(
    () =>
      annotateResults(solved, {
        recipes,
        foods,
        kids,
        selectedKidIds: solvedKidIds,
        inputs: solverInputs,
      }),
    [solved, recipes, foods, kids, solvedKidIds, solverInputs]
  );

  const filtered = useMemo(() => filterRows(rows, { mode, prep }), [rows, mode, prep]);

  // Per-kid plating for every dish that can show, in one batch.
  const platingRecipes = useMemo(() => {
    const ids = new Set([...filtered.visible, ...filtered.slower].map((r) => r.result.recipeId));
    return [...ids]
      .map((id) => solverInputs.recipeById.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r);
  }, [filtered, solverInputs]);

  const solvedKids = useMemo(() => {
    const wanted = new Set(solvedKidIds);
    return kids.filter((k) => wanted.has(k.id));
  }, [kids, solvedKidIds]);

  const platingKids = useMemo(
    () =>
      solvedKids.map((k) => ({
        ...kidToSolverKid(k),
        textureDislikes: k.texture_dislikes ?? null,
      })),
    [solvedKids]
  );

  const {
    platesByRecipe,
    loading: platesLoading,
    error: platesError,
  } = useRecipePlates({ recipes: platingRecipes, kids: platingKids, today });

  const kidNameById = useMemo(() => new Map(kids.map((k) => [k.id, k.name])), [kids]);

  const toCardRows = useCallback(
    (list: FinderRow[]): CardRow[] =>
      rankReconciled(
        list.map((row) => ({
          row,
          reconciled: reconcileRow(row, platesByRecipe.get(row.result.recipeId), kids),
          unknownAllergyKidNames: row.unknownAllergyKidIds
            .map((id) => kidNameById.get(id) ?? '')
            .filter(Boolean),
        }))
      ),
    [platesByRecipe, kids, kidNameById]
  );

  const ranked = useMemo(() => toCardRows(filtered.visible), [toCardRows, filtered.visible]);
  const slowerRanked = useMemo(() => toCardRows(filtered.slower), [toCardRows, filtered.slower]);
  const exclusions = useMemo(() => describeExclusions(solved), [solved]);

  const hero = ranked[0] ?? null;
  const others = ranked.slice(1);
  const shownOthers = showAllOthers ? others : others.slice(0, OTHER_OPTIONS_PAGE);

  // ---- what is already on the plan for this slot -------------------------
  const acceptedRecipeIds = useMemo(() => {
    const wanted = new Set(solvedKidIds);
    const out = new Set<string>();
    for (const e of planEntries) {
      if (e.recipe_id && e.date === mealDate && e.meal_slot === mealSlot && wanted.has(e.kid_id)) {
        out.add(e.recipe_id);
      }
    }
    return out;
  }, [planEntries, mealDate, mealSlot, solvedKidIds]);

  // ---- labels -------------------------------------------------------------
  const slotName = slotLabel(t, mealSlot);
  const dayWord = useMemo(() => {
    if (mealDate === today) return mealSlot === 'dinner' ? 'tonight' : 'today';
    if (mealDate === addIsoDays(today, 1)) return 'tomorrow';
    return 'day';
  }, [mealDate, today, mealSlot]);
  const weekday = weekdayLabel(mealDate, i18n.language);

  const dayLabel =
    dayWord === 'tonight'
      ? t('siblingMealFinder.controls.date.tonight', { defaultValue: 'Tonight' })
      : dayWord === 'today'
        ? t('siblingMealFinder.controls.date.today', { defaultValue: 'Today' })
        : dayWord === 'tomorrow'
          ? t('siblingMealFinder.controls.date.tomorrow', { defaultValue: 'Tomorrow' })
          : weekday;

  const slotText =
    dayWord === 'day'
      ? t('siblingMealFinder.results.slotText.day', {
          slot: slotName.toLowerCase(),
          day: weekday,
          defaultValue: '{{slot}} on {{day}}',
        })
      : t(`siblingMealFinder.results.slotText.${dayWord}`, {
          slot: slotName.toLowerCase(),
          defaultValue: `{{slot}} ${dayWord}`,
        });

  const prepLabel = (p: PrepLimit) =>
    p === 'any'
      ? t('siblingMealFinder.controls.prep.any', { defaultValue: 'Any time' })
      : t('siblingMealFinder.controls.prep.minutes', {
          count: p,
          defaultValue: 'Under {{count}} min',
        });
  const modeLabel = (m: FinderMode) =>
    m === 'as_is'
      ? t('siblingMealFinder.controls.mode.asIs', { defaultValue: 'Same plate for all' })
      : m === 'small_swaps'
        ? t('siblingMealFinder.controls.mode.smallSwaps', { defaultValue: 'Small swaps OK' })
        : t('siblingMealFinder.controls.mode.separatePlates', {
            defaultValue: 'Separate plates OK',
          });

  const summary = [dayLabel, slotName, prepLabel(prep), modeLabel(mode)].join(DOT);
  const plannerHref = `/dashboard/planner?date=${mealDate}&slot=${mealSlot}`;
  const solvedNames = joinNames(solvedKids.map((k) => k.name));

  const allergyMarkers = useMemo(() => {
    const out: Record<string, AllergyMarker> = {};
    for (const k of kids) out[k.id] = allergyMarkerFor(k);
    return out;
  }, [kids]);

  const disabledReason = !online
    ? t('siblingMealFinder.offline', {
        defaultValue: "You're offline. Planning needs a connection; Cook now still works.",
      })
    : lagging
      ? t('siblingMealFinder.results.updating', { defaultValue: 'Updating for who is eating...' })
      : undefined;

  // ---- latest values for the stable callbacks ----------------------------
  const latest = useRef({
    mealDate,
    mealSlot,
    today,
    online,
    lagging,
    solvedKidIds,
    kids,
    recipes,
    solverInputs,
    platesByRecipe,
    ranked,
    slowerRanked,
    schedule,
    recordResolution,
  });
  latest.current = {
    mealDate,
    mealSlot,
    today,
    online,
    lagging,
    solvedKidIds,
    kids,
    recipes,
    solverInputs,
    platesByRecipe,
    ranked,
    slowerRanked,
    schedule,
    recordResolution,
  };
  const lockRef = useRef<string | null>(null);
  const recordedKeys = useRef<Set<string>>(new Set());

  const handleUse = useCallback(
    async (result: SolverResult, cardKidIds: string[]) => {
      const cur = latest.current;
      if (!cur.online || cur.lagging) return;
      const key = `${result.recipeId}|${cur.mealDate}|${cur.mealSlot}`;
      if (lockRef.current) return;

      const recipe: Recipe | undefined = cur.recipes.find((r) => r.id === result.recipeId);
      if (!recipe) {
        toast.error(
          t('siblingMealFinder.toast.noRecipe', { defaultValue: 'That recipe is no longer in your library.' })
        );
        analytics.trackEvent('sibling_schedule_failed', { reason: 'no_recipe' });
        return;
      }

      // Only kids the rows were solved for, and only the ones the card said are usable.
      const solvedSet = new Set(cur.solvedKidIds);
      const candidates = cur.kids.filter((k) => solvedSet.has(k.id) && cardKidIds.includes(k.id));
      const guard = siblingScheduleGuard({
        kids: candidates,
        recipeFoodIds: recipe.food_ids,
        foodById: cur.solverInputs.foodById,
        plates: cur.platesByRecipe.get(recipe.id),
      });

      if (guard.noFoods) {
        setNotices((prev) => ({ ...prev, [recipe.id]: { noFoods: true, blocked: [] } }));
        analytics.trackEvent('sibling_schedule_failed', { reason: 'no_foods' });
        return;
      }

      const allowed = new Set(guard.schedule);
      const kidIds = cardKidIds.filter((id) => solvedSet.has(id) && allowed.has(id));
      const blocked: BlockedLine[] = guard.blocked.map((b) => ({
        kidName: b.kid.name,
        allergen: b.allergen,
        copyKind: b.copyKind,
        cause: b.cause,
      }));
      setNotices((prev) => ({ ...prev, [recipe.id]: { blocked } }));

      if (kidIds.length === 0) {
        analytics.trackEvent('sibling_schedule_failed', { reason: 'all_blocked' });
        return;
      }

      lockRef.current = key;
      setPendingKey(key);
      try {
        const res = await cur.schedule(recipe, cur.mealDate, cur.mealSlot, kidIds);
        const succeededSet = new Set(res.succeeded);

        if (res.succeeded.length > 0 && !recordedKeys.current.has(key)) {
          recordedKeys.current.add(key);
          const primary = (res.rows ?? []).find((r) => r.is_primary_dish && succeededSet.has(r.kid_id));
          await cur.recordResolution({
            result,
            selectedKidIds: res.succeeded,
            planEntryId: primary?.id ?? res.rows?.[0]?.id ?? null,
          });
        }

        if (res.succeeded.length === 0) {
          analytics.trackEvent('sibling_schedule_failed', { reason: 'write_failed' });
        }

        const heroId = cur.ranked[0]?.row.result.recipeId;
        const otherIdx = cur.ranked.findIndex((r) => r.row.result.recipeId === recipe.id);
        const slowIdx = cur.slowerRanked.findIndex((r) => r.row.result.recipeId === recipe.id);
        const rank = otherIdx >= 0 ? otherIdx : slowIdx >= 0 ? cur.ranked.length + slowIdx : -1;
        const payload = {
          recipe_id: recipe.id,
          list: heroId === recipe.id ? 'hero' : 'other',
          rank,
          days_ahead: daysBetween(cur.today, cur.mealDate),
          scheduled_count: res.succeeded.length,
          failed_count: res.failed.length,
          blocked_count: blocked.length,
          partial: res.failed.length > 0 || blocked.length > 0,
          resolution_type: result.resolutionType,
          meal_slot: cur.mealSlot,
        };
        analytics.trackEvent('sibling_solution_chosen', payload);
        // Kept one release for dashboards that still read the old name.
        analytics.trackEvent('family_finder_recipe_selected', payload);

        const nameOf = (id: string) => cur.kids.find((k) => k.id === id)?.name ?? '';
        setScheduleAnnouncement(
          res.succeeded.length === 0
            ? t('siblingMealFinder.toast.failed', {
                name: recipe.name,
                defaultValue: "Couldn't plan {{name}}.",
              })
            : res.failed.length > 0
              ? t('siblingMealFinder.toast.partial', {
                  name: recipe.name,
                  succeeded: joinNames(res.succeeded.map(nameOf)),
                  failed: joinNames(res.failed.map(nameOf)),
                  defaultValue: '{{name}} planned for {{succeeded}}, not for {{failed}}.',
                })
              : t('siblingMealFinder.toast.planned', {
                  name: recipe.name,
                  names: joinNames(res.succeeded.map(nameOf)),
                  defaultValue: '{{name}} planned for {{names}}.',
                })
        );
      } catch (err) {
        logger.error('sibling schedule error', err);
        analytics.trackEvent('sibling_schedule_failed', { reason: 'error' });
        toast.error(
          t('siblingMealFinder.toast.error', {
            defaultValue: "Couldn't add that meal to the plan. Please try again.",
          })
        );
      } finally {
        lockRef.current = null;
        setPendingKey(null);
      }
    },
    [t]
  );

  const handleCook = useCallback((result: SolverResult) => {
    setCookingRecipeId(result.recipeId);
    analytics.trackEvent('sibling_cook_now', {
      recipe_id: result.recipeId,
      resolution_type: result.resolutionType,
    });
  }, []);

  const cookingRecipe = useMemo(
    () => (cookingRecipeId ? (recipes.find((r) => r.id === cookingRecipeId) ?? null) : null),
    [recipes, cookingRecipeId]
  );

  // ---- analytics ----------------------------------------------------------
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current || !kidsHydrated) return;
    openedRef.current = true;
    analytics.trackEvent('family_finder_opened', {
      source: params.from ?? initialParams.from ?? 'direct',
      kid_count: kids.length,
    });
  }, [kidsHydrated, kids.length, params.from, initialParams.from]);

  const runKey = `${solvedKidIds.join(',')}|${recipes.length}|${foods.length}|${history.length}`;
  const lastRunKey = useRef<string | null>(null);
  useEffect(() => {
    if (solvedKidIds.length === 0 || recipes.length === 0) return;
    if (lastRunKey.current === runKey) return;
    lastRunKey.current = runKey;
    const live = solved.filter((x) => !x.excluded);
    analytics.trackEvent('sibling_solver_run', {
      kid_count: solvedKidIds.length,
      recipe_count: recipes.length,
      result_count: live.length,
      full_match_count: live.filter((x) => x.resolutionType === 'full_match').length,
      with_swaps_count: live.filter((x) => x.resolutionType === 'with_swaps').length,
      split_plate_count: live.filter((x) => x.resolutionType === 'split_plate').length,
      excluded_count: solved.length - live.length,
    });
    if (live.length === 0) {
      analytics.trackEvent('family_finder_zero_results_shown', {
        kid_count: solvedKidIds.length,
        excluded_count: solved.length - live.length,
        recipe_count: recipes.length,
      });
    }
  }, [runKey, solved, solvedKidIds.length, recipes.length]);

  // ---- focus the results after a date/slot change ------------------------
  const resultsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (focusResults === 0) return;
    const el = resultsHeadingRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }, [focusResults, reducedMotion]);

  // ---- render helpers -----------------------------------------------------
  const blockedLineText = (b: BlockedLine): string => {
    if (b.cause === 'allergen' && b.allergen) {
      return b.copyKind === 'severeUnrated'
        ? t('siblingMealFinder.results.blocked.unrated', {
            name: b.kidName,
            allergen: b.allergen,
            defaultValue: 'Not planned for {{name}}: {{allergen}}, severity not recorded (treated as severe)',
          })
        : t('siblingMealFinder.results.blocked.severe', {
            name: b.kidName,
            allergen: b.allergen,
            defaultValue: 'Not planned for {{name}}: severe {{allergen}} allergy',
          });
    }
    if (b.cause === 'plate_empty') {
      return t('siblingMealFinder.results.blocked.empty', {
        name: b.kidName,
        defaultValue: 'Not planned for {{name}}: nothing left on their plate',
      });
    }
    return t('siblingMealFinder.results.blocked.plate', {
      name: b.kidName,
      defaultValue: "Not planned for {{name}}: their plate can't be made safe",
    });
  };

  const renderCard = (item: CardRow, variant: 'hero' | 'compact') => {
    const { row, reconciled } = item;
    const id = row.result.recipeId;
    const notice = notices[id];
    const key = `${id}|${mealDate}|${mealSlot}`;
    return (
      <div key={id} className="space-y-2">
        <SiblingMealResultCard
          result={row.result}
          reconciled={reconciled}
          uncheckedIngredients={row.uncheckedIngredients}
          unknownAllergyKidNames={item.unknownAllergyKidNames}
          variant={variant}
          plates={platesByRecipe.get(id)}
          platesLoading={platesLoading}
          platesError={platesError}
          isPending={pendingKey === key}
          isAccepted={acceptedRecipeIds.has(id)}
          slotText={slotText}
          plannerHref={plannerHref}
          disabledReason={disabledReason}
          onUse={handleUse}
          onCook={handleCook}
          recipeHref="/dashboard/recipes"
        />
        {notice && (notice.noFoods || notice.blocked.length > 0) && (
          <div className="rounded-md bg-muted p-3 text-sm text-foreground" data-testid={`notice-${id}`}>
            {notice.noFoods ? (
              <p>
                {t('siblingMealFinder.results.noFoods', {
                  defaultValue: 'This recipe has no linked foods yet, so it could not be planned.',
                })}{' '}
                <Link
                  to="/dashboard/recipes"
                  className="font-medium underline underline-offset-2 hover:text-primary"
                >
                  {t('siblingMealFinder.results.noFoodsLink', {
                    name: row.result.recipeName,
                    defaultValue: 'Add ingredients to {{name}}',
                  })}
                </Link>
              </p>
            ) : (
              <ul className="space-y-1">
                {notice.blocked.map((b) => (
                  <li key={b.kidName} className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                    <span>{blockedLineText(b)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  const disclosure = (id: string, label: string, children: ReactNode): ReactNode => (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="group min-h-11 w-full justify-between px-2 text-base font-semibold"
          data-testid={id}
        >
          <span>{label}</span>
          <ChevronDown
            className={cn(
              'h-5 w-5 text-muted-foreground group-data-[state=open]:rotate-180',
              !reducedMotion && 'transition-transform'
            )}
            aria-hidden="true"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );

  const resultsCountText =
    ranked.length === 0
      ? t('siblingMealFinder.results.none', {
          names: solvedNames,
          defaultValue: 'Nothing works for {{names}} with these settings',
        })
      : t('siblingMealFinder.results.count', {
          count: ranked.length,
          kids: solvedNames,
          defaultValue: ranked.length === 1 ? '{{count}} dish works for {{kids}}' : '{{count}} dishes work for {{kids}}',
        });

  // ---- empty states -------------------------------------------------------
  let body: ReactNode = null;
  if (kids.length === 0) {
    body = (
      <Alert>
        <AlertTitle>{t('siblingMealFinder.empty.noKids.title', { defaultValue: 'No kid profiles yet' })}</AlertTitle>
        <AlertDescription>
          {t('siblingMealFinder.empty.noKids.body', {
            defaultValue: 'Add your kids so the finder knows who it is cooking for.',
          })}{' '}
          <Link to="/dashboard/kids" className="font-medium underline underline-offset-2 hover:text-primary">
            {t('siblingMealFinder.empty.noKids.cta', { defaultValue: 'Add a kid' })}
          </Link>
        </AlertDescription>
      </Alert>
    );
  } else if (kids.length === 1) {
    body = (
      <section className="rounded-xl bg-muted p-5 space-y-3" data-testid="empty-one-kid">
        <h2 className="text-lg font-semibold">
          {t('siblingMealFinder.empty.oneKid.title', { defaultValue: 'This finder is for two or more kids' })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('siblingMealFinder.empty.oneKid.body', {
            name: kids[0].name,
            defaultValue: "With just {{name}}, Tonight on Home already picks from what they eat. Add a sibling to plan one dish for everyone.",
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11">
            <Link to="/dashboard/kids">
              {t('siblingMealFinder.empty.oneKid.addKid', { defaultValue: 'Add a sibling' })}
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/dashboard">
              {t('siblingMealFinder.empty.oneKid.tonight', { defaultValue: 'See Tonight' })}
            </Link>
          </Button>
        </div>
      </section>
    );
  } else if (recipes.length === 0) {
    body = (
      <section className="rounded-xl bg-muted p-5 space-y-3" data-testid="empty-no-recipes">
        <h2 className="text-lg font-semibold">
          {t('siblingMealFinder.empty.noRecipes.title', { defaultValue: 'Add a few recipes first' })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('siblingMealFinder.empty.noRecipes.body', {
            defaultValue: 'The finder picks from your recipe library. Two or three family staples is enough to start.',
          })}
        </p>
        <Button asChild className="min-h-11">
          <Link to="/dashboard/recipes">
            {t('siblingMealFinder.empty.noRecipes.cta', { defaultValue: 'Go to Recipes' })}
          </Link>
        </Button>
      </section>
    );
  }

  const pickHint = kids.length > 1 && effectiveKidIds.length === 0;
  const isCustomDate = mealDate !== today && mealDate !== addIsoDays(today, 1);

  return (
    <div className="container mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <Helmet>
        <title>{t('siblingMealFinder.meta.title', { defaultValue: 'Sibling Meal Finder | EatPal' })}</title>
        <meta
          name="description"
          content={t('siblingMealFinder.meta.description', {
            defaultValue:
              'Find one dish that works for every kid at the table, with each child\'s plate spelled out and allergies checked first.',
          })}
        />
      </Helmet>

      <div role="status" aria-live="polite" className="sr-only" data-testid="finder-status">
        {scheduleAnnouncement ||
          (kids.length > 1 && effectiveKidIds.length > 0 && !lagging ? resultsCountText : '')}
      </div>

      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <Users2 className="h-6 w-6 text-primary" aria-hidden="true" />
            {t('siblingMealFinder.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('siblingMealFinder.header.subtitle', {
              defaultValue: 'One dish for every kid, with the fewest changes',
            })}
          </p>
        </div>
        <Link
          to={`/dashboard/planner?date=${mealDate}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {t('siblingMealFinder.header.plannerLink', { defaultValue: 'See the week in Planner' })}
        </Link>
      </header>

      {body ?? (
        <>
          <div className="space-y-3">
            <SiblingPickerChips
              kids={kids}
              selectedKidIds={effectiveKidIds}
              onChange={changeKids}
              onSelectAll={selectAllKids}
              allergyMarkers={allergyMarkers}
            />
            {pickHint && (
              <p className="text-sm text-muted-foreground" data-testid="pick-hint">
                {t('siblingMealFinder.controls.pickHint', { defaultValue: "Pick who's eating" })}
              </p>
            )}
            <FairnessIndicator kids={solvedKids} history={history} />
          </div>

          <Collapsible open={controlsOpen} onOpenChange={toggleControls}>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                className="group min-h-11 w-full justify-between gap-2 text-left font-normal"
                data-testid="controls-summary"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{summary}</span>
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground group-data-[state=open]:rotate-180',
                    !reducedMotion && 'transition-transform'
                  )}
                  aria-hidden="true"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <fieldset className="mt-3 space-y-4 rounded-xl bg-muted/50 p-4">
                <legend className="sr-only">
                  {t('siblingMealFinder.controls.legend', { defaultValue: 'When, and how flexible' })}
                </legend>

                <div className="space-y-2">
                  <p className="text-sm font-medium" id="finder-date-label">
                    {t('siblingMealFinder.controls.date.label', { defaultValue: 'When' })}
                  </p>
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="finder-date-label">
                    <Button
                      type="button"
                      size="sm"
                      variant={mealDate === today ? 'default' : 'outline'}
                      aria-pressed={mealDate === today}
                      className="min-h-11"
                      onClick={() => changeDate(today)}
                    >
                      {mealSlot === 'dinner'
                        ? t('siblingMealFinder.controls.date.tonight', { defaultValue: 'Tonight' })
                        : t('siblingMealFinder.controls.date.today', { defaultValue: 'Today' })}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={mealDate === addIsoDays(today, 1) ? 'default' : 'outline'}
                      aria-pressed={mealDate === addIsoDays(today, 1)}
                      className="min-h-11"
                      onClick={() => changeDate(addIsoDays(today, 1))}
                    >
                      {t('siblingMealFinder.controls.date.tomorrow', { defaultValue: 'Tomorrow' })}
                    </Button>
                    <label
                      htmlFor="finder-date-input"
                      className={cn(
                        'inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm',
                        isCustomDate ? 'border-primary' : 'border-input'
                      )}
                    >
                      <span>{t('siblingMealFinder.controls.date.pick', { defaultValue: 'Pick a day' })}</span>
                      <input
                        id="finder-date-input"
                        type="date"
                        aria-label={t('siblingMealFinder.controls.date.pick', { defaultValue: 'Pick a day' })}
                        className="bg-transparent text-sm text-foreground"
                        value={isCustomDate ? mealDate : ''}
                        min={today}
                        onChange={(e) => {
                          if (e.target.value === '') return;
                          changeDate(e.target.value);
                        }}
                        data-testid="finder-date-input"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium" id="finder-slot-label">
                    {t('siblingMealFinder.controls.slot', { defaultValue: 'Meal' })}
                  </p>
                  <ToggleGroup
                    type="single"
                    value={mealSlot}
                    onValueChange={changeSlot}
                    className="flex-wrap justify-start"
                    aria-labelledby="finder-slot-label"
                  >
                    {RECIPE_PLAN_SLOTS.map((s) => (
                      <ToggleGroupItem key={s} value={s} className="min-h-11 px-3">
                        {slotLabel(t, s)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium" id="finder-prep-label">
                    {t('siblingMealFinder.controls.prep.label', { defaultValue: 'Time to cook' })}
                  </p>
                  <ToggleGroup
                    type="single"
                    value={String(prep)}
                    onValueChange={changePrep}
                    className="flex-wrap justify-start"
                    aria-labelledby="finder-prep-label"
                  >
                    {PREP_OPTIONS.map((p) => (
                      <ToggleGroupItem key={String(p)} value={String(p)} className="min-h-11 px-3">
                        {prepLabel(p)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium" id="finder-mode-label">
                    {t('siblingMealFinder.controls.mode.label', { defaultValue: 'How much can plates differ' })}
                  </p>
                  <ToggleGroup
                    type="single"
                    value={mode}
                    onValueChange={changeMode}
                    className="flex-wrap justify-start"
                    aria-labelledby="finder-mode-label"
                  >
                    {MODE_OPTIONS.map((m) => (
                      <ToggleGroupItem key={m} value={m} className="min-h-11 px-3">
                        {modeLabel(m)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </fieldset>
            </CollapsibleContent>
          </Collapsible>

          {!pickHint && (
            <section className="space-y-4" aria-labelledby="finder-results-heading">
              <h2
                id="finder-results-heading"
                ref={resultsHeadingRef}
                tabIndex={-1}
                className="scroll-mt-4 text-lg font-semibold focus:outline-none"
                data-testid="result-count"
                data-count={ranked.length}
              >
                {resultsCountText}
              </h2>

              {hero ? (
                <div data-testid="hero">{renderCard(hero, 'hero')}</div>
              ) : (
                <div className="rounded-xl bg-muted p-4 text-sm text-foreground space-y-3">
                  <p>
                    {t('siblingMealFinder.results.noneBody', {
                      defaultValue: 'Loosen a setting, or add a recipe everyone already eats.',
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {mode !== 'separate_plates' && (
                      <Button variant="outline" className="min-h-11" onClick={() => changeMode('separate_plates')}>
                        {t('siblingMealFinder.results.allowSeparate', { defaultValue: 'Allow separate plates' })}
                      </Button>
                    )}
                    {prep !== 'any' && (
                      <Button variant="outline" className="min-h-11" onClick={() => changePrep('any')}>
                        {t('siblingMealFinder.results.anyTime', { defaultValue: 'Any cooking time' })}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {others.length > 0 && (
                <div className="space-y-3" data-testid="other-options">
                  <h3 className="text-base font-semibold">
                    {t('siblingMealFinder.results.others', {
                      count: others.length,
                      defaultValue: 'Other options ({{count}})',
                    })}
                  </h3>
                  {shownOthers.map((item) => renderCard(item, 'compact'))}
                  {!showAllOthers && others.length > OTHER_OPTIONS_PAGE && (
                    <Button variant="outline" className="min-h-11 w-full" onClick={() => setShowAllOthers(true)}>
                      {t('siblingMealFinder.results.showMore', {
                        count: others.length - OTHER_OPTIONS_PAGE,
                        defaultValue: 'Show {{count}} more',
                      })}
                    </Button>
                  )}
                </div>
              )}

              {slowerRanked.length > 0 &&
                disclosure(
                  'slower-toggle',
                  t('siblingMealFinder.results.slower', {
                    count: slowerRanked.length,
                    defaultValue: 'Takes longer ({{count}})',
                  }),
                  slowerRanked.map((item) => renderCard(item, 'compact'))
                )}

              {exclusions.length > 0 &&
                disclosure(
                  'exclusions-toggle',
                  t('siblingMealFinder.exclusions.title', {
                    count: exclusions.length,
                    defaultValue: 'Ruled out for safety ({{count}})',
                  }),
                  <ul className="space-y-3" data-testid="exclusions-list">
                    {exclusions.map((ex) => (
                      <li key={ex.recipeId} className="rounded-md bg-muted p-3 text-sm">
                        <p className="font-medium">{ex.recipeName}</p>
                        <ul className="mt-1 space-y-1 text-foreground">
                          {ex.kids.map((k) => (
                            <li key={k.kidId} className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                              <span>
                                {k.copyKind === 'severeUnrated' ? (
                                  <>
                                    {t('siblingMealFinder.exclusions.unrated', {
                                      name: k.kidName,
                                      allergen: k.allergen ?? k.foodName,
                                      food: k.foodName,
                                      defaultValue:
                                        '{{name}}: {{allergen}} in {{food}}, severity not recorded (treated as severe)',
                                    })}{' '}
                                    <Link
                                      to="/dashboard/kids"
                                      className="font-medium underline underline-offset-2 hover:text-primary"
                                    >
                                      {t('siblingMealFinder.exclusions.setSeverity', {
                                        defaultValue: 'Set severity',
                                      })}
                                    </Link>
                                  </>
                                ) : k.copyKind === 'severe' ? (
                                  t('siblingMealFinder.exclusions.severe', {
                                    name: k.kidName,
                                    allergen: k.allergen ?? k.foodName,
                                    food: k.foodName,
                                    defaultValue: '{{name}}: severe {{allergen}} allergy ({{food}})',
                                  })
                                ) : k.copyKind === 'dietary' ? (
                                  t('siblingMealFinder.exclusions.dietary', {
                                    name: k.kidName,
                                    food: k.foodName,
                                    defaultValue: '{{name}}: {{food}} breaks a diet rule',
                                  })
                                ) : (
                                  t('siblingMealFinder.exclusions.plain', {
                                    name: k.kidName,
                                    allergen: k.allergen ?? k.foodName,
                                    food: k.foodName,
                                    defaultValue: '{{name}}: {{allergen}} allergy ({{food}})',
                                  })
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          )}
        </>
      )}

      <TonightCookDialog
        recipe={cookingRecipe}
        open={cookingRecipeId !== null}
        onClose={() => setCookingRecipeId(null)}
        plates={cookingRecipeId ? platesByRecipe.get(cookingRecipeId) : undefined}
      />
    </div>
  );
}
