/**
 * "Start a food": a searchable, kid-aware list of what could go on the ladder.
 *
 * The order is the advice. Chain suggestions from a food that just became
 * safe come first, then the household's try-bite foods, then everything else.
 * Each food is judged for THIS child through getKidFoodFit, so an allergen is
 * flagged with the canonical matcher (a kid allergic to "dairy" sees it on a
 * food tagged "milk"), and starting one takes an explicit confirm.
 *
 * A food already on the ladder is never added twice from here: it shows its
 * rung and selecting it jumps to its row.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Badge } from '@/components/ui/badge';
import { useFoods, usePlan } from '@/contexts/AppContext';
import { buildResultIndex, getKidFoodFit, type KidFit } from '@/lib/kidFit';
import { RUNG_META } from '@/lib/exposureLadder';
import type { MasteryCandidate } from '@/lib/ladderMastery';
import type { LadderRow, StartFoodResult } from '@/hooks/useFoodLadder';
import type { Food, Kid } from '@/types';
import { addDays, formatRelativeDay, localIsoDate } from './ladderDates';
import '@/i18n/appLocale';

export interface LadderFoodPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kid: Kid;
  rows: readonly LadderRow[];
  masteryCandidates: readonly MasteryCandidate[];
  startFood: (
    foodId: string,
    opts: { pairedSafeFoodId?: string | null; kidId?: string }
  ) => Promise<StartFoodResult>;
  /** Scroll to and focus the food's row on the overview. */
  onJump: (foodId: string) => void;
}

interface PickerEntry {
  foodId: string;
  name: string;
  allergens: string[];
  fit: KidFit | null;
  pairedSafeFoodId: string | null;
  reasons: string[];
}

interface PendingConfirm {
  entry: PickerEntry;
  allergen: string;
}

export function LadderFoodPicker({
  open,
  onOpenChange,
  kid,
  rows,
  masteryCandidates,
  startFood,
  onJump,
}: LadderFoodPickerProps) {
  const { t, i18n } = useTranslation();
  const { foods } = useFoods();
  const { planEntries } = usePlan();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [busy, setBusy] = useState(false);

  const fitByFoodId = useMemo(() => {
    const index = buildResultIndex(planEntries, kid.id);
    return new Map<string, KidFit>(foods.map((f) => [f.id, getKidFoodFit(kid, f, index)]));
  }, [foods, kid, planEntries]);

  const rowByFoodId = useMemo(() => new Map(rows.map((r) => [r.foodId, r])), [rows]);

  const sections = useMemo(() => {
    const foodById = new Map<string, Food>(foods.map((f) => [f.id, f]));
    const seen = new Set<string>();

    const suggested: PickerEntry[] = [];
    for (const c of masteryCandidates) {
      if (c.kidId !== kid.id || seen.has(c.foodId)) continue;
      seen.add(c.foodId);
      const food = foodById.get(c.foodId);
      suggested.push({
        foodId: c.foodId,
        name: food?.name ?? c.foodName,
        allergens: food?.allergens ?? [],
        fit: fitByFoodId.get(c.foodId) ?? null,
        pairedSafeFoodId: c.anchorFoodId,
        reasons: c.reasons,
      });
    }

    const tryBite: PickerEntry[] = [];
    const rest: PickerEntry[] = [];
    const sorted = [...foods].sort((a, b) => a.name.localeCompare(b.name));
    for (const f of sorted) {
      if (seen.has(f.id)) continue;
      const fit = fitByFoodId.get(f.id) ?? null;
      const entry: PickerEntry = {
        foodId: f.id,
        name: f.name,
        allergens: f.allergens ?? [],
        fit,
        pairedSafeFoodId: null,
        reasons: [],
      };
      if (fit?.tryBite && !fit.safe) tryBite.push(entry);
      else rest.push(entry);
    }

    return { suggested, tryBite, rest };
  }, [foods, fitByFoodId, masteryCandidates, kid.id]);

  const close = () => onOpenChange(false);

  const start = async (entry: PickerEntry) => {
    setBusy(true);
    try {
      const res = await startFood(entry.foodId, {
        pairedSafeFoodId: entry.pairedSafeFoodId,
        kidId: kid.id,
      });
      const today = localIsoDate();

      if (res.ok) {
        close();
        const due = res.row.nextDueOn;
        if (due && due > today) {
          toast(
            t('foodTracker.ladderUi.picker.capped', {
              defaultValue: 'Three foods are already due today; starting it {{date}}',
              date: formatRelativeDay(due, today, i18n.language),
            })
          );
        } else {
          toast.success(
            t('foodTracker.ladderUi.picker.started', {
              defaultValue: 'Started {{food}} at the first step',
              food: entry.name,
            })
          );
        }
        onJump(entry.foodId);
        return;
      }

      if (res.reason === 'duplicate') {
        close();
        toast(
          t('foodTracker.ladderUi.picker.duplicate', { defaultValue: 'Already on the ladder' }),
          {
            action: {
              label: t('foodTracker.ladderUi.picker.showIt', { defaultValue: 'Show it' }),
              onClick: () => onJump(entry.foodId),
            },
          }
        );
        return;
      }

      if (res.reason === 'cap') {
        close();
        toast(
          t('foodTracker.ladderUi.picker.capped', {
            defaultValue: 'Three foods are already due today; starting it {{date}}',
            date: formatRelativeDay(addDays(today, 1), today, i18n.language),
          })
        );
        return;
      }

      toast.error(
        t('foodTracker.ladderUi.picker.failed', {
          defaultValue: "Couldn't start {{food}} just now. Try again in a moment.",
          food: entry.name,
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const choose = (entry: PickerEntry) => {
    if (busy) return;
    const existing = rowByFoodId.get(entry.foodId);
    if (existing) {
      close();
      onJump(entry.foodId);
      return;
    }
    const allergen = entry.fit?.allergen ?? null;
    if (allergen) {
      setPending({ entry, allergen });
      return;
    }
    void start(entry);
  };

  const renderItem = (entry: PickerEntry) => {
    const onLadder = rowByFoodId.get(entry.foodId);
    const allergen = entry.fit?.allergen ?? null;
    const rungLabel = onLadder
      ? t(`foodLadder.rungs.${onLadder.currentRung}`, RUNG_META[onLadder.currentRung].label)
      : null;

    return (
      <CommandItem
        key={entry.foodId}
        value={`${entry.name} ${entry.foodId}`}
        keywords={[entry.name, ...entry.allergens, ...(allergen ? [allergen] : [])]}
        onSelect={() => choose(entry)}
        className="min-h-11 flex-wrap gap-x-2 gap-y-1"
      >
        <span className="font-medium text-foreground">{entry.name}</span>
        {onLadder && rungLabel ? (
          <span className="text-sm text-muted-foreground">
            <span aria-hidden="true">{RUNG_META[onLadder.currentRung].emoji} </span>
            {t('foodTracker.ladderUi.picker.onLadder', {
              defaultValue: 'On the ladder: {{rung}}',
              rung: rungLabel,
            })}
          </span>
        ) : null}
        {allergen ? (
          <Badge variant="outline" className="border-destructive text-destructive">
            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
            {t('foodTracker.ladderUi.contains', {
              defaultValue: 'Contains {{allergen}}',
              allergen,
            })}
          </Badge>
        ) : null}
        {entry.fit?.disliked ? (
          <Badge variant="secondary">
            {t('foodTracker.ladderUi.picker.disliked', { defaultValue: 'Disliked' })}
          </Badge>
        ) : null}
        {entry.reasons.length > 0 ? (
          <span className="w-full text-sm text-muted-foreground">
            {t('foodLadder.mastery.because', { reasons: entry.reasons.join(', ') })}
          </span>
        ) : null}
      </CommandItem>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="overflow-hidden p-0">
          <DialogHeader className="px-4 pt-4 text-left">
            <DialogTitle>
              {t('foodTracker.ladderUi.picker.title', {
                defaultValue: 'Start a food for {{name}}',
                name: kid.name,
              })}
            </DialogTitle>
            <DialogDescription>
              {t('foodTracker.ladderUi.picker.description', {
                defaultValue: 'It starts at the gentlest step: just having it on the table.',
              })}
            </DialogDescription>
          </DialogHeader>
          <Command className="rounded-none">
            <CommandInput
              placeholder={t('foodTracker.ladderUi.picker.search', {
                defaultValue: 'Search foods or allergens',
              })}
              aria-label={t('foodTracker.ladderUi.picker.search', {
                defaultValue: 'Search foods or allergens',
              })}
            />
            <CommandList className="max-h-[60dvh]">
              <CommandEmpty>
                {t('foodTracker.ladderUi.picker.empty', { defaultValue: 'No food matches that.' })}
              </CommandEmpty>
              {sections.suggested.length > 0 ? (
                <CommandGroup
                  heading={t('foodTracker.ladderUi.picker.suggested', {
                    defaultValue: 'Suggested next',
                  })}
                >
                  {sections.suggested.map(renderItem)}
                </CommandGroup>
              ) : null}
              {sections.tryBite.length > 0 ? (
                <CommandGroup
                  heading={t('foodTracker.ladderUi.picker.tryBite', {
                    defaultValue: 'Try-bite foods',
                  })}
                >
                  {sections.tryBite.map(renderItem)}
                </CommandGroup>
              ) : null}
              {sections.rest.length > 0 ? (
                <CommandGroup
                  heading={t('foodTracker.ladderUi.picker.everything', {
                    defaultValue: 'Everything else',
                  })}
                >
                  {sections.rest.map(renderItem)}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pending !== null} onOpenChange={(next) => !next && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('foodTracker.ladderUi.picker.confirmTitle', {
                defaultValue: '{{food}} contains {{allergen}}',
                food: pending?.entry.name ?? '',
                allergen: pending?.allergen ?? '',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('foodTracker.ladderUi.picker.confirmBody', {
                defaultValue:
                  "{{name}}'s profile lists {{allergen}}. Only start this if their doctor has said it's OK.",
                name: kid.name,
                allergen: pending?.allergen ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('foodTracker.ladderUi.picker.confirmCancel', { defaultValue: "Don't start it" })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const entry = pending?.entry;
                setPending(null);
                if (entry) void start(entry);
              }}
            >
              {t('foodTracker.ladderUi.picker.confirmStart', { defaultValue: 'Start anyway' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
