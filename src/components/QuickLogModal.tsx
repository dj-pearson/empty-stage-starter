import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '@/i18n/appLocale';
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Smile, Meh, Frown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  quickLogNeedsMealChoice,
  resolveQuickLogMealId,
  type QuickLogEntry,
} from '@/lib/quickLog';
import { TOGGLE_CHIP_CLASS, TOGGLE_CHIP_SMALL_CLASS, toggleChipState } from '@/lib/toggleChip';
import { AMOUNT_EATEN_VALUES } from '@/lib/foodJournal';
import type { AmountEaten } from '@/types';

type MealResult = 'ate' | 'tasted' | 'refused';

/** plan_entries.notes as the textarea caps it. */
const NOTE_MAX = 500;

interface QuickLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The slot or meal being logged ("dinner"). Shown in the title. */
  mealName?: string;
  /** The dish being logged ("fish pie"). Shown in the title. */
  foodName?: string;
  /**
   * Today's meals to choose between (US-812). Omit it when the caller already
   * knows which meal is being logged -- the Home page opens this from a
   * specific meal row and passes nothing here.
   *
   * The floating "Log a meal" action has no such context, and used to open
   * the modal anyway against a handler that toasted "Meal logged!" and wrote
   * nothing at all. Asking which meal is the difference between logging and
   * pretending to.
   *
   * A meal's `notes` is the household's shared note. It is shown read-only
   * above the textarea, because what is typed here is added to it.
   */
  meals?: ReadonlyArray<QuickLogEntry>;
  /** The meal the picker opens on, e.g. tonight's dinner. */
  defaultMealId?: string;
  /**
   * `amount` is how much the child ate ("a lot", "some", "nibbles"), when the
   * user picked one. The caller drops it for a refusal.
   *
   * Resolve true when the result landed. The modal resets and closes only
   * then; on false it stays open with the note and amount intact, so a failed
   * write does not also throw away what the parent typed. A handler that
   * returns nothing is read as success, for callers written before the
   * boolean contract.
   */
  onLog: (
    result: MealResult,
    notes?: string,
    mealId?: string,
    amount?: AmountEaten
  ) => boolean | void | Promise<boolean | void>;
}

export function QuickLogModal({
  open,
  onOpenChange,
  mealName,
  foodName,
  meals,
  defaultMealId,
  onLog,
}: QuickLogModalProps) {
  const { t } = useTranslation();
  const notesId = useId();
  const mealGroupId = useId();
  const amountGroupId = useId();
  const quickNotesId = useId();
  const existingNoteId = useId();
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState<AmountEaten | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const reset = useCallback(() => {
    setNotes('');
    setAmount(undefined);
    setSelectedMealId(null);
    setFailed(false);
  }, []);

  // Whenever the dialog closes, however it closes, the next opening starts
  // clean. When it opens, the picker starts on the caller's suggestion.
  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (defaultMealId && meals?.some((m) => m.id === defaultMealId)) {
      setSelectedMealId(defaultMealId);
    }
    // meals is intentionally not a dependency: a realtime update while the
    // dialog is open must not move the parent's selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultMealId, reset]);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const needsMealChoice = quickLogNeedsMealChoice(meals);
  const resolvedMealId = resolveQuickLogMealId(meals, selectedMealId);
  const awaitingMealChoice = needsMealChoice && !selectedMealId;
  const selectedMeal = meals?.find((m) => m.id === resolvedMealId);
  const selectedLabel = selectedMeal?.label;
  const existingNote = selectedMeal?.notes?.trim();

  // A quick note is added to what was typed, not swapped in for it, and a
  // second tap takes it back out. The cap matches the textarea's.
  const toggleQuickNote = (note: string) =>
    setNotes((cur) => {
      if (cur.includes(note)) {
        return cur
          .replace(note, '')
          .replace(/(\.\s*){2,}/g, '. ')
          .replace(/\s{2,}/g, ' ')
          .replace(/^[.\s]+|[.\s]+$/g, '');
      }
      const typed = cur.trim();
      if (!typed) return note.slice(0, NOTE_MAX);
      const sep = /[.!?]$/.test(typed) ? ' ' : '. ';
      return `${typed}${sep}${note}`.slice(0, NOTE_MAX);
    });

  const handleResultClick = async (result: MealResult) => {
    if (awaitingMealChoice) return;
    setIsLoading(true);
    setFailed(false);

    try {
      const ok = await onLog(result, notes || undefined, resolvedMealId ?? undefined, amount);
      if (ok === false) {
        setFailed(true);
        return;
      }
      reset();
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to log meal:', error);
      setFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  const resultButtons = [
    {
      result: 'ate' as MealResult,
      icon: Smile,
      label: t('quickLog.result.ate', { defaultValue: 'Ate it!' }),
      emoji: '\u{1F389}',
      variant: 'default' as const,
      className: 'bg-safe-food text-primary-foreground hover:bg-safe-food/90',
      iconClass: '',
    },
    {
      result: 'tasted' as MealResult,
      icon: Meh,
      label: t('quickLog.result.tasted', { defaultValue: 'Tried a bite' }),
      emoji: '\u{1F44D}',
      variant: 'outline' as const,
      className: '',
      iconClass: 'text-try-bite',
    },
    {
      result: 'refused' as MealResult,
      icon: Frown,
      label: t('quickLog.result.refused', { defaultValue: 'Refused' }),
      emoji: '\u{1F937}',
      variant: 'outline' as const,
      className: '',
      iconClass: 'text-muted-foreground',
    },
  ];

  const quickNotes = [
    t('quickLog.notes.ateHalf', { defaultValue: 'Ate half' }),
    t('quickLog.notes.triedDidntLike', { defaultValue: "Tried but didn't like" }),
    t('quickLog.notes.lovedIt', { defaultValue: 'Loved it!' }),
    t('quickLog.notes.askedForMore', { defaultValue: 'Asked for more' }),
    t('quickLog.notes.tooTired', { defaultValue: 'Too tired' }),
    t('quickLog.notes.notHungry', { defaultValue: 'Not hungry' }),
  ];

  // The title names what is being logged whenever anything is known about it,
  // so a parent never records a result against a meal they cannot see.
  const title =
    mealName && foodName
      ? t('quickLog.titleWithFood', {
          defaultValue: 'How did {{food}} at {{meal}} go?',
          food: foodName,
          meal: mealName,
        })
      : t('quickLog.title', {
          defaultValue: 'How did {{meal}} go?',
          meal:
            mealName ??
            foodName ??
            selectedLabel ??
            t('quickLog.thisMeal', { defaultValue: 'this meal' }),
        });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {t('quickLog.description', {
              defaultValue: 'Every meal is progress, whatever the result.',
            })}
          </DialogDescription>
        </DialogHeader>

        {/* Which meal (US-812). Only when the caller could not say. */}
        {needsMealChoice && (
          <div role="group" aria-labelledby={mealGroupId} className="space-y-2 pt-2">
            <p id={mealGroupId} className="text-sm font-medium">
              {t('quickLog.whichMeal', { defaultValue: 'Which meal?' })}
            </p>
            <div className="flex flex-wrap gap-2">
              {meals?.map((meal) => (
                <button
                  key={meal.id}
                  type="button"
                  onClick={() => setSelectedMealId(meal.id)}
                  aria-pressed={selectedMealId === meal.id}
                  className={cn(TOGGLE_CHIP_CLASS, toggleChipState(selectedMealId === meal.id))}
                >
                  {meal.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* How much (optional). Picked before the result, because tapping a
            result saves and closes. */}
        <div role="group" aria-labelledby={amountGroupId} className="space-y-2 pt-2">
          <p id={amountGroupId} className="text-sm font-medium">
            {t('foodJournal.amountQuestion')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {AMOUNT_EATEN_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount((current) => (current === value ? undefined : value))}
                aria-pressed={amount === value}
                disabled={isLoading}
                className={cn(TOGGLE_CHIP_CLASS, toggleChipState(amount === value))}
              >
                {t(`foodJournal.amount.${value}`)}
              </button>
            ))}
          </div>
        </div>

        {/* The note sits above the results: tapping a result saves, so a note
            typed below one would be typed after the fact. */}
        <div className="space-y-2">
          <label htmlFor={notesId} className="text-sm font-medium">
            {t('quickLog.noteLabel', { defaultValue: 'Add a note? (optional)' })}
          </label>

          <span id={quickNotesId} className="sr-only">
            {t('quickLog.quickNotes', { defaultValue: 'Quick notes' })}
          </span>
          <div role="group" aria-labelledby={quickNotesId} className="flex flex-wrap gap-2">
            {quickNotes.map((note) => (
              <button
                key={note}
                type="button"
                onClick={() => toggleQuickNote(note)}
                aria-pressed={notes.includes(note)}
                disabled={isLoading}
                className={cn(TOGGLE_CHIP_SMALL_CLASS, toggleChipState(notes.includes(note)))}
              >
                {note}
              </button>
            ))}
          </div>

          {existingNote && (
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t('quickLog.existingNote', { defaultValue: 'Already noted' })}
              </p>
              <p
                id={existingNoteId}
                className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
              >
                {existingNote}
              </p>
            </div>
          )}

          <Textarea
            id={notesId}
            placeholder={t('quickLog.notePlaceholder', { defaultValue: 'Any notes about this meal?' })}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="resize-none"
            rows={2}
            maxLength={NOTE_MAX}
            aria-describedby={existingNote ? existingNoteId : undefined}
          />
        </div>

        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t('quickLog.saveFailed', {
              defaultValue: "That didn't save. Your note is still here; try again.",
            })}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 pt-1">
          {resultButtons.map(({ result, icon: Icon, label, emoji, variant, className, iconClass }) => (
            <Button
              key={result}
              type="button"
              variant={variant}
              onClick={() => handleResultClick(result)}
              disabled={isLoading || awaitingMealChoice}
              className={cn(
                'h-16 flex flex-col items-center justify-center gap-1 px-1 motion-safe:transition-transform motion-safe:active:scale-95',
                className
              )}
            >
              <span className="flex items-center gap-1">
                <Icon className={cn('h-5 w-5', iconClass)} aria-hidden="true" />
                <span aria-hidden="true">{emoji}</span>
              </span>
              <span className="text-sm font-semibold leading-tight">{label}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
