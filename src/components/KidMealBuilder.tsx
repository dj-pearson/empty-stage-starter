/**
 * Meal Builder: one meal, for one child, built with that child.
 *
 * The plate opens already filled in from the pure selector in
 * src/lib/plateBuilder.ts: a food this child eats, today's try bite from
 * their ladder, and a filler for the food group their day is missing, with an
 * optional bridge food between the first two (food chaining). The parent's
 * job is what gets offered; every choice here has already been checked
 * against the child's allergies, and anything held back is listed with why.
 * The child's job is which one, and "Hand to {name}" makes that easy.
 *
 * One tap adds the plate to the plan through PlanContext.addPlanEntries, with
 * the allergen guard re-run against the current foods first. What this screen
 * does not do is left to the screens that do it: arbitrary adds live in the
 * Planner, logging how a try went lives in Food Tracker, and both are linked.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { AlertTriangle, CalendarCheck, Hand, History, RotateCw, UserPlus, WifiOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { KidChips, KidPickerGrid } from '@/components/foodTracker/KidChips';
import { PlateSvg } from '@/components/mealBuilder/PlateSvg';
import { BridgeChoices, ZoneChoices, groupName, zoneName } from '@/components/mealBuilder/ZoneChoices';
import { dayLabel } from '@/components/mealBuilder/SlotChip';
import { useFoods, useKids, usePlan } from '@/contexts/AppContext';
import { useMealBuilderData, type ChosenPlate } from '@/hooks/useMealBuilderData';
import { slotLabel } from '@/lib/planSlotLabels';
import { favouritePlates, planWriteEntries, type HeldBack, type PlateCandidates, type PlateZone } from '@/lib/plateBuilder';
import { manualAddPrompt, allergenCopyKind } from '@/lib/planAllergenGuard';
import type { AllergenConflict } from '@/lib/kidFit';
import { getStorage } from '@/lib/platform';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import type { Kid, MealSlot } from '@/types';
import '@/i18n/appLocale';

export interface MealTarget {
  date: string;
  slot: MealSlot;
}

/** The child the builder works for: the active one, or the only one. */
export function resolveBuilderKid(kids: readonly Kid[], activeKidId: string | null): Kid | null {
  const active = activeKidId ? kids.find((k) => k.id === activeKidId) : undefined;
  if (active) return active;
  return kids.length === 1 ? kids[0] : null;
}

const MEAL_ZONES: readonly PlateZone[] = ['safe', 'tryBite', 'bridge', 'gap'];

/** The chosen food per zone, or the selector's default where nothing valid was chosen. */
export function effectivePlate(candidates: PlateCandidates | null, chosen: ChosenPlate): ChosenPlate {
  if (!candidates) return {};
  const out: ChosenPlate = {};
  for (const zone of MEAL_ZONES) {
    const pick = chosen[zone];
    if (pick && candidates[zone].some((o) => o.food.id === pick)) out[zone] = pick;
    else if (zone !== 'bridge' && candidates.defaults[zone]) out[zone] = candidates.defaults[zone];
  }
  return out;
}

export function draftKey(kidId: string, date: string, slot: MealSlot): string {
  return `mealBuilder:draft:${kidId}|${date}|${slot}`;
}

interface StoredDraft {
  chosen: ChosenPlate;
  tryBiteSlot: 'try_bite' | 'same';
}

function parseDraft(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as { chosen?: unknown; tryBiteSlot?: unknown };
    const chosen: ChosenPlate = {};
    if (record.chosen && typeof record.chosen === 'object') {
      for (const zone of MEAL_ZONES) {
        const id = (record.chosen as Record<string, unknown>)[zone];
        if (typeof id === 'string' && id) chosen[zone] = id;
      }
    }
    return { chosen, tryBiteSlot: record.tryBiteSlot === 'same' ? 'same' : 'try_bite' };
  } catch {
    return null;
  }
}

const SLOT_SENTENCE_DEFAULTS: Record<MealSlot, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack1: 'morning snack',
  snack2: 'afternoon snack',
  try_bite: 'try bite',
};

/** The lowercase slot name for use mid-sentence ("already on lunch"). */
function slotInSentence(t: TFunction, slot: MealSlot): string {
  return t(`planner.slots.${slot}`, { defaultValue: SLOT_SENTENCE_DEFAULTS[slot] });
}

const HELD_BACK_DEFAULTS: Record<HeldBack['reason'], string> = {
  allergen: 'contains {{allergen}}',
  disliked: "on {{name}}'s dislike list",
  stalled: 'resting after a few hard tries',
  paused: 'paused on the ladder',
  alreadyInSlot: 'already on this meal',
  alreadyPlannedToday: 'already planned today',
  unknownFood: 'no longer in your foods',
};

function heldBackReason(t: TFunction, item: HeldBack, kidName: string): string {
  if (item.reason === 'allergen') {
    const allergen = item.allergen ?? '';
    if (item.copyKind === 'severe') {
      return t('mealBuilder.heldBack.allergenSevere', {
        allergen,
        defaultValue: 'contains {{allergen}}, severe allergy',
      });
    }
    if (item.copyKind === 'severeUnrated') {
      return t('mealBuilder.heldBack.allergenSevereUnrated', {
        allergen,
        defaultValue: 'contains {{allergen}}, allergy severity not recorded',
      });
    }
    return t('mealBuilder.heldBack.allergen', { allergen, defaultValue: HELD_BACK_DEFAULTS.allergen });
  }
  return t(`mealBuilder.heldBack.${item.reason}`, { name: kidName, defaultValue: HELD_BACK_DEFAULTS[item.reason] });
}

// ---------------------------------------------------------------------------
// Resolution: which child, and the states before there is one
// ---------------------------------------------------------------------------

function PlateSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="space-y-4" data-testid="meal-builder-skeleton">
      <span className="sr-only">{label}</span>
      <Skeleton className="mx-auto aspect-square w-full max-w-[16rem] rounded-full motion-reduce:animate-none" />
      <div className="flex gap-2">
        <Skeleton className="h-11 w-28 rounded-full motion-reduce:animate-none" />
        <Skeleton className="h-11 w-24 rounded-full motion-reduce:animate-none" />
        <Skeleton className="h-11 w-20 rounded-full motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export interface KidMealBuilderProps {
  date: string;
  slot: MealSlot;
  todayIso: string;
  /** Called when a save or an Undo pins the plate to a meal. */
  onTargetChange: (next: MealTarget) => void;
  handMode: boolean;
  onHandModeChange: (on: boolean) => void;
}

export function KidMealBuilder(props: KidMealBuilderProps) {
  const { t } = useTranslation();
  const { kids, activeKidId, kidsHydrated, kidsLoadError, refreshKids } = useKids();
  const kid = resolveBuilderKid(kids, activeKidId);
  const { onHandModeChange } = props;

  const [announcement, setAnnouncement] = useState<{ id: number; text: string }>({ id: 0, text: '' });
  const announce = useCallback((text: string) => {
    setAnnouncement((prev) => ({ id: prev.id + 1, text }));
  }, []);

  // A switch to another child: say so, and move focus to the new plate.
  const kidId = kid?.id ?? null;
  const kidName = kid?.name ?? '';
  // Read during render on purpose: the new plate mounts in the same render
  // as the switch, and it needs to know then whether to take focus.
  const lastKidId = useRef<string | null | undefined>(undefined);
  const switched = lastKidId.current !== undefined && lastKidId.current !== kidId && kidId !== null;
  useEffect(() => {
    const previous = lastKidId.current;
    lastKidId.current = kidId;
    if (!kidId || previous === undefined || previous === kidId) return;
    onHandModeChange(false);
    announce(t('mealBuilder.switchedTo', { name: kidName, defaultValue: "Building {{name}}'s plate" }));
    // kidName follows kidId; the announcement is for the switch, not a rename.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidId]);

  const liveRegion = (
    <p aria-live="polite" role="status" className="sr-only" data-testid="meal-builder-live">
      <span key={announcement.id}>{announcement.text}</span>
    </p>
  );

  if (!kidsHydrated) {
    return <PlateSkeleton label={t('mealBuilder.loadingKids', { defaultValue: 'Loading your children' })} />;
  }

  if (kidsLoadError && kids.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>{t('mealBuilder.kidsError.title', { defaultValue: "Couldn't load your children" })}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{t('mealBuilder.kidsError.body', { defaultValue: 'Check your connection and try again.' })}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void refreshKids()}>
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('mealBuilder.kidsError.retry', { defaultValue: 'Retry' })}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (kids.length === 0) {
    return (
      <section aria-labelledby="meal-builder-no-kids" className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <h2 id="meal-builder-no-kids" className="text-lg font-semibold">
          {t('mealBuilder.noKids.title', { defaultValue: 'Add a child to build a plate' })}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {t('mealBuilder.noKids.body', {
            defaultValue: 'Plates are built from the foods one child knows, so the builder needs a child first.',
          })}
        </p>
        <Button asChild className="mt-4 min-h-11">
          <Link to="/dashboard/kids">
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('mealBuilder.noKids.cta', { defaultValue: 'Add a child' })}
          </Link>
        </Button>
      </section>
    );
  }

  if (!kid) {
    return (
      <>
        {liveRegion}
        <KidPickerGrid
          kids={kids}
          body={t('mealBuilder.kidPicker.body', { defaultValue: 'Pick who this plate is for.' })}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {liveRegion}
      {!props.handMode ? (
        <KidChips
          showFamily={false}
          ariaLabel={t('mealBuilder.chooseChild', { defaultValue: 'Whose plate?' })}
        />
      ) : null}
      <PlateBuilder key={kid.id} kid={kid} focusOnMount={switched} announce={announce} {...props} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The plate for one child
// ---------------------------------------------------------------------------

type ConfirmState =
  | { kind: 'block'; conflict: AllergenConflict<Kid> }
  | { kind: 'plain'; conflict: AllergenConflict<Kid> }
  | { kind: 'unknown' }
  | null;

interface PostSave {
  date: string;
  slot: MealSlot;
  tryBiteId: string | null;
}

interface PlateBuilderProps extends KidMealBuilderProps {
  kid: Kid;
  focusOnMount: boolean;
  announce: (text: string) => void;
}

function PlateBuilder({
  kid,
  date,
  slot,
  todayIso,
  onTargetChange,
  handMode,
  onHandModeChange,
  focusOnMount,
  announce,
}: PlateBuilderProps) {
  const { t, i18n } = useTranslation();
  const { foods } = useFoods();
  const { planEntries, addPlanEntries, deletePlanEntries } = usePlan();

  const [chosen, setChosen] = useState<ChosenPlate>({});
  const [tryBiteSlot, setTryBiteSlot] = useState<'try_bite' | 'same'>('try_bite');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [postSave, setPostSave] = useState<PostSave | null>(null);

  const { status, candidates, reloadLadder, foodsById, kidEntries, online } = useMealBuilderData(
    kid.id,
    date,
    slot,
    chosen,
  );

  const plate = useMemo(() => effectivePlate(candidates, chosen), [candidates, chosen]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
    // Mount only: the section is keyed on the child.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Latest values for the save path, which must not act on a stale render.
  const kidRef = useRef(kid);
  kidRef.current = kid;
  const foodsRef = useRef(foods);
  foodsRef.current = foods;
  const planRef = useRef(planEntries);
  planRef.current = planEntries;
  const plateRef = useRef(plate);
  plateRef.current = plate;
  const savingRef = useRef(false);

  const slotText = slotLabel(t, slot);
  const day = dayLabel(t, date, todayIso, i18n.language);
  const storageKey = draftKey(kid.id, date, slot);

  // ---- offline draft ----------------------------------------------------
  const [storedDraft, setStoredDraft] = useState<StoredDraft | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storage = await getStorage();
        const raw = await storage.getItem(storageKey);
        if (!cancelled) setStoredDraft(parseDraft(raw));
      } catch (err) {
        logger.warn('Meal Builder draft could not be read:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Restore once the candidates are known, keeping only choices that are
  // still on offer: a food could have gained an allergen tag since.
  useEffect(() => {
    if (!storedDraft || !candidates) return;
    // Wait for the ladder, or a stored try bite would be dropped as "not on offer".
    if (candidates.status.tryBite === 'pending') return;
    const valid: ChosenPlate = {};
    for (const zone of MEAL_ZONES) {
      const id = storedDraft.chosen[zone];
      if (id && candidates[zone].some((o) => o.food.id === id)) valid[zone] = id;
    }
    setStoredDraft(null);
    if (Object.keys(valid).length === 0) return;
    setChosen(valid);
    setTryBiteSlot(storedDraft.tryBiteSlot);
    announce(t('mealBuilder.offline.restored', { defaultValue: 'Your unsaved plate is back.' }));
  }, [storedDraft, candidates, announce, t]);

  useEffect(() => {
    if (online || Object.keys(chosen).length === 0) return;
    (async () => {
      try {
        const storage = await getStorage();
        await storage.setItem(storageKey, JSON.stringify({ chosen, tryBiteSlot } satisfies StoredDraft));
      } catch (err) {
        logger.warn('Meal Builder draft could not be kept:', err);
      }
    })();
  }, [online, chosen, tryBiteSlot, storageKey]);

  const clearDraft = useCallback(async () => {
    try {
      const storage = await getStorage();
      await storage.removeItem(storageKey);
    } catch (err) {
      logger.warn('Meal Builder draft could not be cleared:', err);
    }
  }, [storageKey]);

  // ---- choosing ---------------------------------------------------------
  const onSelect = useCallback(
    (zone: PlateZone, foodId: string) => {
      setPostSave(null);
      setChosen((prev) => ({ ...prev, [zone]: foodId }));
      if (handMode) {
        const food = foodsRef.current.find((f) => f.id === foodId);
        announce(
          t('mealBuilder.kidPicked', {
            food: food?.name ?? '',
            zone: zoneName(t, zone),
            defaultValue: 'Picked {{food}} for the {{zone}}.',
          }),
        );
      }
    },
    [announce, handMode, t],
  );

  const onToggleBridge = useCallback(
    (foodId: string) => {
      const on = plateRef.current.bridge !== foodId;
      setPostSave(null);
      setChosen((prev) => {
        const next = { ...prev };
        if (on) next.bridge = foodId;
        else delete next.bridge;
        return next;
      });
      if (on && handMode) {
        const food = foodsRef.current.find((f) => f.id === foodId);
        announce(
          t('mealBuilder.kidPicked', {
            food: food?.name ?? '',
            zone: zoneName(t, 'bridge'),
            defaultValue: 'Picked {{food}} for the {{zone}}.',
          }),
        );
      }
    },
    [announce, handMode, t],
  );

  // ---- saving -----------------------------------------------------------
  const write = useCallback(async () => {
    if (savingRef.current) return;
    const currentKid = kidRef.current;
    const snapshot = plateRef.current;
    savingRef.current = true;
    setSaving(true);
    try {
      const { entries, skipped } = planWriteEntries(
        currentKid.id,
        date,
        slot,
        snapshot,
        planRef.current,
        tryBiteSlot,
      );
      const byId = new Map(foodsRef.current.map((f) => [f.id, f]));
      const skippedLines = skipped.map((id) =>
        t('mealBuilder.skipped', {
          food: byId.get(id)?.name ?? '',
          slot: slotInSentence(t, id === snapshot.tryBite && tryBiteSlot === 'try_bite' ? 'try_bite' : slot),
          defaultValue: '{{food}} was already on {{slot}}',
        }),
      );
      if (entries.length === 0) {
        announce(
          t('mealBuilder.nothingNew', {
            slot: slotInSentence(t, slot),
            defaultValue: 'Everything on this plate was already on {{slot}}.',
          }),
        );
        return;
      }
      const result = await addPlanEntries(entries);
      if (result.error) {
        // PlanContext has already shown the failure; the plate stays as it was.
        announce(t('mealBuilder.notSaved', { defaultValue: 'Not saved. Your plate is still here.' }));
        return;
      }
      const insertedIds = result.insertedIds;
      const savedTarget = { date, slot };
      const tryBiteId = snapshot.tryBite ?? null;
      void clearDraft();
      setChosen({});
      setPostSave({ ...savedTarget, tryBiteId });
      toast.success(
        t('mealBuilder.saved', { slot: slotText, day, defaultValue: 'Added to {{slot}}, {{day}}' }),
        {
          description: skippedLines.length > 0 ? skippedLines.join('. ') : undefined,
          action: {
            label: t('planner.actions.undo', { defaultValue: 'Undo' }),
            onClick: () => {
              void (async () => {
                const undo = await deletePlanEntries(insertedIds);
                if (undo.error) {
                  toast.error(t('mealBuilder.undoFailed', { defaultValue: "Couldn't undo. Remove it in the Planner." }));
                  return;
                }
                onTargetChange(savedTarget);
                setPostSave(null);
                setChosen(snapshot);
                announce(t('mealBuilder.undone', { defaultValue: 'Taken off the plan. Your plate is back.' }));
              })();
            },
          },
        },
      );
      onTargetChange(savedTarget);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [
    addPlanEntries,
    announce,
    clearDraft,
    date,
    day,
    deletePlanEntries,
    onTargetChange,
    slot,
    slotText,
    t,
    tryBiteSlot,
  ]);

  const onSave = useCallback(() => {
    if (savingRef.current) return;
    const currentKid = kidRef.current;
    const snapshot = plateRef.current;
    const ids = MEAL_ZONES.map((z) => snapshot[z]).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    const foodById = new Map(foodsRef.current.map((f) => [f.id, f]));
    const prompt = manualAddPrompt([currentKid], ids, foodById);
    if (prompt?.severe && prompt.lead) {
      setConfirm({ kind: 'block', conflict: prompt.lead });
      return;
    }
    if (prompt && prompt.conflicts.length > 0) {
      setConfirm({ kind: 'plain', conflict: prompt.conflicts[0] });
      return;
    }
    if (candidates?.allergyState === 'unknown') {
      setConfirm({ kind: 'unknown' });
      return;
    }
    void write();
  }, [candidates?.allergyState, write]);

  // ---- derived view -----------------------------------------------------
  const nameOf = (id: string | undefined) => (id ? (foodsById.get(id)?.name ?? null) : null);

  const recent = useMemo(
    () => favouritePlates(kidEntries, kid.id, todayIso, kid, foodsById, 6),
    [kidEntries, kid, todayIso, foodsById],
  );

  const applyRecentPlate = useCallback(
    (foodIds: readonly string[]) => {
      if (!candidates) return;
      const next: ChosenPlate = {};
      for (const id of foodIds) {
        const zone = MEAL_ZONES.find((z) => !next[z] && candidates[z].some((o) => o.food.id === id));
        if (zone) next[zone] = id;
      }
      setPostSave(null);
      setChosen(next);
    },
    [candidates],
  );

  const selectedCount = MEAL_ZONES.filter((z) => plate[z]).length;
  const headingId = `meal-builder-plate-${kid.id}`;
  const gapGroup = candidates?.gapGroup ?? null;

  return (
    <section key={kid.id} aria-labelledby={headingId} className="space-y-5 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('mealBuilder.plateHeading', { name: kid.name, defaultValue: "{{name}}'s plate" })}
        </h2>
        <Button
          type="button"
          variant={handMode ? 'default' : 'outline'}
          className="min-h-11"
          onClick={() => {
            const next = !handMode;
            onHandModeChange(next);
            if (!next) announce(t('mealBuilder.handBack', { defaultValue: 'Back to you.' }));
          }}
        >
          <Hand className="mr-2 h-4 w-4" aria-hidden="true" />
          {handMode
            ? t('mealBuilder.hand.done', { defaultValue: 'Done' })
            : t('mealBuilder.hand.start', { name: kid.name, defaultValue: 'Hand to {{name}}' })}
        </Button>
      </div>

      {handMode ? (
        <p className="text-lg font-medium">
          {t('mealBuilder.hand.banner', { name: kid.name, defaultValue: '{{name}} is choosing. One from each row.' })}
        </p>
      ) : null}

      {candidates?.allergyState === 'unknown' && !handMode ? (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-foreground" data-testid="allergies-unknown">
          <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            {t('mealBuilder.allergiesUnknown', {
              name: kid.name,
              defaultValue: "{{name}}'s allergies aren't recorded, so nothing here was checked against them.",
            })}
          </span>
          <Link
            to={`/dashboard/kids?kid=${encodeURIComponent(kid.id)}`}
            className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('mealBuilder.allergiesUnknownLink', { defaultValue: 'Record allergies' })}
          </Link>
        </p>
      ) : null}

      {status === 'loading' || !candidates ? (
        <PlateSkeleton
          label={t('mealBuilder.plateLoading', { name: kid.name, defaultValue: "Loading {{name}}'s foods" })}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-start">
          <PlateSvg
            kid={kid}
            safeName={nameOf(plate.safe)}
            tryBiteName={nameOf(plate.tryBite)}
            gapName={nameOf(plate.gap)}
            bridgeName={nameOf(plate.bridge)}
            className="mx-auto max-w-[14rem] sm:max-w-none"
          />
          <div className="space-y-5">
            <ZoneChoices
              zone="safe"
              headingId={`${headingId}-safe`}
              title={t('mealBuilder.zones.safe', { defaultValue: 'Safe food' })}
              hint={handMode ? undefined : t('mealBuilder.zoneHint.safe', { name: kid.name, defaultValue: 'Something {{name}} already eats.' })}
              options={candidates.safe}
              status={candidates.status.safe}
              selectedId={plate.safe}
              onSelect={onSelect}
              large={handMode}
              kidName={kid.name}
              gapGroup={gapGroup}
            />
            {candidates.safe.length > 0 ? (
              <BridgeChoices
                headingId={`${headingId}-bridge`}
                options={candidates.bridge}
                status={candidates.status.bridge}
                selectedId={plate.bridge}
                onToggle={onToggleBridge}
                large={handMode}
              />
            ) : null}
            <ZoneChoices
              zone="tryBite"
              headingId={`${headingId}-tryBite`}
              title={t('mealBuilder.zones.tryBite', { defaultValue: 'Try bite' })}
              hint={handMode ? undefined : t('mealBuilder.zoneHint.tryBite', { defaultValue: 'A small taste on the side. Touching or smelling it counts.' })}
              options={candidates.tryBite}
              status={candidates.status.tryBite}
              selectedId={plate.tryBite}
              onSelect={onSelect}
              large={handMode}
              kidName={kid.name}
              gapGroup={gapGroup}
              onRetry={() => void reloadLadder()}
            />
            <ZoneChoices
              zone="gap"
              headingId={`${headingId}-gap`}
              title={
                gapGroup
                  ? t('mealBuilder.zones.gapFor', { group: groupName(t, gapGroup), defaultValue: 'Add a {{group}}' })
                  : t('mealBuilder.zones.gap', { defaultValue: 'Fill a gap' })
              }
              hint={
                gapGroup && !handMode
                  ? t('mealBuilder.zoneHint.gap', { group: groupName(t, gapGroup), defaultValue: 'Today has no {{group}} yet.' })
                  : undefined
              }
              options={candidates.gap}
              status={candidates.status.gap}
              selectedId={plate.gap}
              onSelect={onSelect}
              large={handMode}
              kidName={kid.name}
              gapGroup={gapGroup}
            />
          </div>
        </div>
      )}

      {!handMode && recent.length > 0 && candidates ? (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t('mealBuilder.recent.title', { defaultValue: 'Recent plates' })}
          </h3>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {recent.map((p) => {
              const names = p.foodIds.map((id) => foodsById.get(id)?.name ?? '').filter(Boolean).join(', ');
              return (
                <li key={p.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => applyRecentPlate(p.foodIds)}
                    aria-label={t('mealBuilder.recent.use', { foods: names, defaultValue: 'Use this plate: {{foods}}' })}
                    className="inline-flex min-h-11 max-w-[16rem] items-center rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors motion-reduce:transition-none"
                  >
                    <span className="truncate">{names}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {!handMode && candidates && candidates.heldBack.length > 0 ? (
        <details className="rounded-lg border border-border bg-card px-4 py-2 text-card-foreground">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
            {t('mealBuilder.heldBack.summary', { count: candidates.heldBack.length, defaultValue: 'Held back ({{count}})' })}
          </summary>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('mealBuilder.heldBack.intro', { name: kid.name, defaultValue: 'Not offered for {{name}}:' })}
          </p>
          <ul className="mt-2 space-y-1 pb-2 text-sm">
            {candidates.heldBack.map((item) => (
              <li key={`${item.zone}-${item.food.id}-${item.reason}`}>
                {t('mealBuilder.heldBack.item', {
                  food: item.food.name,
                  reason: heldBackReason(t, item, kid.name),
                  defaultValue: '{{food}}: {{reason}}',
                })}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!handMode && postSave ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-4 py-2 text-card-foreground" data-testid="post-save">
          <Link
            to={`/dashboard/planner?date=${postSave.date}&slot=${postSave.slot}`}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            {t('mealBuilder.postSave.planner', { defaultValue: 'See it on the Planner' })}
          </Link>
          {postSave.tryBiteId ? (
            <Link
              to={`/dashboard/food-tracker?log=${encodeURIComponent(postSave.tryBiteId)}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('mealBuilder.postSave.logTryBite', { defaultValue: 'How did the try bite go? Log it' })}
            </Link>
          ) : null}
        </div>
      ) : null}

      {!handMode && candidates ? (
        <div className="sticky bottom-[calc(theme(spacing.16)+env(safe-area-inset-bottom))] z-20 -mx-4 space-y-2 border-t border-border bg-background px-4 py-3 md:bottom-0 md:mx-0 md:rounded-t-lg">
          {plate.tryBite ? (
            <div
              role="radiogroup"
              aria-label={t('mealBuilder.tryBitePlacement.label', { defaultValue: 'Where the try bite goes' })}
              className="flex gap-2"
            >
              {(['try_bite', 'same'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={tryBiteSlot === value}
                  onClick={() => setTryBiteSlot(value)}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    tryBiteSlot === value
                      ? 'border-primary bg-primary/10 font-medium text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {value === 'try_bite'
                    ? t('mealBuilder.tryBitePlacement.row', { defaultValue: 'Try-bite row' })
                    : t('mealBuilder.tryBitePlacement.same', { defaultValue: 'Same meal' })}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              {!online ? (
                <span className="inline-flex items-start gap-1.5">
                  <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('mealBuilder.offline.save', {
                    defaultValue: "You're offline. This plate is kept on this device; add it when you're back online.",
                  })}
                </span>
              ) : selectedCount > 0 ? (
                t('mealBuilder.save.summary', {
                  count: selectedCount,
                  slot: slotText,
                  day,
                  defaultValue: '{{count}} foods for {{slot}}, {{day}}',
                })
              ) : (
                t('mealBuilder.save.nothing', { defaultValue: 'Pick a food first' })
              )}
            </p>
            <Button
              type="button"
              className="min-h-11 shrink-0"
              disabled={!online || saving || selectedCount === 0}
              aria-busy={saving}
              onClick={onSave}
            >
              {saving
                ? t('mealBuilder.save.saving', { defaultValue: 'Adding...' })
                : t('mealBuilder.save.add', { defaultValue: 'Add to plan' })}
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => (!open ? setConfirm(null) : undefined)}>
        <AlertDialogContent>
          {confirm?.kind === 'block' ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('mealBuilder.confirm.blockTitle', {
                    food: confirm.conflict.food.name,
                    name: kid.name,
                    defaultValue: "{{food}} can't go on {{name}}'s plate",
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {allergenCopyKind(confirm.conflict) === 'severeUnrated'
                    ? t('mealBuilder.confirm.blockSevereUnrated', {
                        food: confirm.conflict.food.name,
                        name: kid.name,
                        allergen: confirm.conflict.allergen,
                        defaultValue:
                          "{{food}} contains {{allergen}}. {{name}}'s {{allergen}} allergy has no severity recorded, so it's treated as severe.",
                      })
                    : t('mealBuilder.confirm.blockSevere', {
                        food: confirm.conflict.food.name,
                        name: kid.name,
                        allergen: confirm.conflict.allergen,
                        defaultValue: '{{name}} has a severe {{allergen}} allergy, and {{food}} contains {{allergen}}.',
                      })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11">
                  {t('mealBuilder.confirm.cancel', { defaultValue: 'Go back' })}
                </AlertDialogCancel>
              </AlertDialogFooter>
            </>
          ) : confirm?.kind === 'plain' ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('mealBuilder.confirm.plainTitle', {
                    food: confirm.conflict.food.name,
                    allergen: confirm.conflict.allergen,
                    defaultValue: '{{food}} contains {{allergen}}',
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('mealBuilder.confirm.plainBody', {
                    name: kid.name,
                    allergen: confirm.conflict.allergen,
                    severity: confirm.conflict.severity ?? '',
                    defaultValue: '{{name}} has a {{severity}} {{allergen}} allergy.',
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11">
                  {t('mealBuilder.confirm.cancel', { defaultValue: 'Go back' })}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="min-h-11"
                  onClick={() => {
                    setConfirm(null);
                    void write();
                  }}
                >
                  {t('mealBuilder.confirm.plainAction', { name: kid.name, defaultValue: 'Add it for {{name}} anyway' })}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : confirm?.kind === 'unknown' ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('mealBuilder.confirm.unknownTitle', {
                    name: kid.name,
                    defaultValue: "{{name}}'s allergies aren't recorded",
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('mealBuilder.confirm.unknownBody', {
                    name: kid.name,
                    defaultValue: "This plate couldn't be checked against {{name}}'s allergies.",
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11">
                  {t('mealBuilder.confirm.cancel', { defaultValue: 'Go back' })}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="min-h-11"
                  onClick={() => {
                    setConfirm(null);
                    void write();
                  }}
                >
                  {t('mealBuilder.confirm.unknownAction', { name: kid.name, defaultValue: 'Add it for {{name}}' })}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
