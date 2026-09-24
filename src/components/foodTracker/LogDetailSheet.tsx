/**
 * The longer log, one tap behind the quick buttons.
 *
 * Nothing here is preselected. The old tracker opened on "full bite /
 * success / happy", so a parent who saved in a hurry recorded a good meal
 * that never happened; an unset mood is written as null, which is what it
 * is. Save stays off until a result is picked, because that one field is
 * what moves the ladder.
 *
 * A half-written note survives the sheet being swiped away: the draft is kept
 * per (child, food) in sessionStorage and cleared only once the log lands.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  ATTEMPT_AMOUNTS,
  ATTEMPT_MOODS,
  MAX_ATTEMPT_NOTE_LENGTH,
  type LadderRow,
  type LogAttemptArgs,
  type LogResult,
  type QuickLogResult,
} from '@/hooks/useFoodLadder';
import { resultLabel, showLogFeedback, type UndoLog } from './ladderLogFeedback';
import { draftKey } from './logDetailDraft';
import '@/i18n/appLocale';

type Mood = (typeof ATTEMPT_MOODS)[number];
type Amount = (typeof ATTEMPT_AMOUNTS)[number];

const RESULTS: QuickLogResult[] = ['accepted', 'held', 'refused'];
const MOOD_EMOJI: Record<Mood, string> = {
  happy: '😊',
  neutral: '😐',
  anxious: '😟',
  resistant: '😤',
};
const REACTION_CHIPS = ['gagged', 'spatOut', 'rash', 'tummyAche'] as const;
type ReactionChip = (typeof REACTION_CHIPS)[number];

export interface LogDraft {
  result: QuickLogResult | null;
  hardTime: boolean;
  reaction: string;
  moodBefore: Mood | null;
  moodAfter: Mood | null;
  amount: Amount | null;
  note: string;
  firstTime: boolean;
}

const EMPTY_DRAFT: LogDraft = {
  result: null,
  hardTime: false,
  reaction: '',
  moodBefore: null,
  moodAfter: null,
  amount: null,
  note: '',
  firstTime: false,
};

function isMood(value: unknown): value is Mood {
  return typeof value === 'string' && (ATTEMPT_MOODS as readonly string[]).includes(value);
}
function isAmount(value: unknown): value is Amount {
  return typeof value === 'string' && (ATTEMPT_AMOUNTS as readonly string[]).includes(value);
}
function isResult(value: unknown): value is QuickLogResult {
  return value === 'accepted' || value === 'held' || value === 'refused';
}

/** Storage can throw (private mode, blocked site data); a lost draft is fine. */
function readDraft(key: string): LogDraft {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return EMPTY_DRAFT;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_DRAFT;
    const d = parsed as Record<string, unknown>;
    return {
      result: isResult(d.result) ? d.result : null,
      hardTime: d.hardTime === true,
      reaction: typeof d.reaction === 'string' ? d.reaction.slice(0, MAX_ATTEMPT_NOTE_LENGTH) : '',
      moodBefore: isMood(d.moodBefore) ? d.moodBefore : null,
      moodAfter: isMood(d.moodAfter) ? d.moodAfter : null,
      amount: isAmount(d.amount) ? d.amount : null,
      note: typeof d.note === 'string' ? d.note.slice(0, MAX_ATTEMPT_NOTE_LENGTH) : '',
      firstTime: d.firstTime === true,
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function isEmptyDraft(d: LogDraft): boolean {
  return (
    d.result === null &&
    !d.hardTime &&
    !d.reaction.trim() &&
    d.moodBefore === null &&
    d.moodAfter === null &&
    d.amount === null &&
    !d.note.trim() &&
    !d.firstTime
  );
}

function writeDraft(key: string, draft: LogDraft): void {
  try {
    if (isEmptyDraft(draft)) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Nothing to do: the draft only lives for this sheet.
  }
}

function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // As above.
  }
}

export interface LogDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: LadderRow;
  foodName: string;
  kidName: string;
  planEntryId?: string | null;
  mealSlot?: string | null;
  onLog: (args: LogAttemptArgs) => Promise<LogResult>;
  onUndo?: UndoLog;
  /** Called after a log lands, with the result the parent picked. */
  onLogged?: (result: QuickLogResult) => void;
}

export function LogDetailSheet({
  open,
  onOpenChange,
  row,
  foodName,
  kidName,
  planEntryId,
  mealSlot,
  onLog,
  onUndo,
  onLogged,
}: LogDetailSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const ids = useId();
  const key = draftKey(row.kidId, row.foodId);
  const [draft, setDraft] = useState<LogDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const hydrated = useRef(false);

  // Load the draft each time the sheet opens, not on every render, so an
  // edit is never overwritten by what was stored a keystroke ago.
  useEffect(() => {
    if (!open) {
      hydrated.current = false;
      return;
    }
    setDraft(readDraft(key));
    hydrated.current = true;
  }, [open, key]);

  const update = useCallback(
    (patch: Partial<LogDraft>) => {
      setDraft((current) => {
        const next = { ...current, ...patch };
        if (hydrated.current) writeDraft(key, next);
        return next;
      });
    },
    [key]
  );

  const handleOpenChange = (next: boolean) => {
    if (!next && !saving && (draft.reaction.trim() || draft.note.trim())) {
      toast(t('foodTracker.ladderUi.detail.draftKept', { defaultValue: 'Draft kept' }));
    }
    onOpenChange(next);
  };

  const appendReaction = (chip: ReactionChip) => {
    const text = t(`foodTracker.ladderUi.detail.reactionChip.${chip}`);
    const current = draft.reaction.trimEnd();
    const joined = current ? `${current}, ${text.toLowerCase()}` : text;
    update({ reaction: joined.slice(0, MAX_ATTEMPT_NOTE_LENGTH) });
  };

  const handleSave = async () => {
    if (!draft.result) return;
    const result = draft.result;
    setSaving(true);
    try {
      const res = await onLog({
        row,
        foodId: row.foodId,
        result,
        hardTime: draft.hardTime,
        planEntryId,
        mealSlot,
        details: {
          reactionNotes: draft.reaction.trim() || null,
          parentNotes: draft.note.trim() || null,
          moodBefore: draft.moodBefore,
          moodAfter: draft.moodAfter,
          amountConsumed: draft.amount,
          isMilestone: draft.firstTime,
        },
      });
      if (showLogFeedback({ t, res, kidName, foodName, onUndo })) {
        clearDraft(key);
        setDraft(EMPTY_DRAFT);
        onLogged?.(result);
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const moodGroup = (field: 'moodBefore' | 'moodAfter', labelText: string) => (
    <div className="space-y-2">
      <p id={`${ids}-${field}`} className="text-sm font-medium text-foreground">
        {labelText}
      </p>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-labelledby={`${ids}-${field}`}
        className="flex-wrap justify-start"
        value={draft[field] ?? ''}
        onValueChange={(value) => update({ [field]: isMood(value) ? value : null })}
      >
        {ATTEMPT_MOODS.map((mood) => (
          <ToggleGroupItem
            key={mood}
            value={mood}
            className="min-h-11"
            aria-label={t(`foodTracker.ladderUi.detail.mood.${mood}`)}
          >
            <span aria-hidden="true" className="mr-1">
              {MOOD_EMOJI[mood]}
            </span>
            {t(`foodTracker.ladderUi.detail.mood.${mood}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'flex flex-col gap-0 p-0',
          isMobile ? 'max-h-[90dvh]' : 'w-full sm:max-w-md'
        )}
      >
        <SheetHeader className="px-6 pb-2 pt-6 text-left">
          <SheetTitle>
            {t('foodTracker.ladderUi.detail.title', {
              defaultValue: 'How did {{food}} go?',
              food: foodName,
            })}
          </SheetTitle>
          <SheetDescription>
            {t('foodTracker.ladderUi.detail.description', {
              defaultValue: 'Only the result is needed. Everything else is optional.',
            })}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <p id={`${ids}-result`} className="text-sm font-medium text-foreground">
              {t('foodTracker.ladderUi.detail.resultLabel', { defaultValue: 'How it went' })}
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby={`${ids}-result`}
              className="grid grid-cols-3 gap-1.5"
              value={draft.result ?? ''}
              onValueChange={(value) => update({ result: isResult(value) ? value : null })}
            >
              {RESULTS.map((result) => (
                <ToggleGroupItem key={result} value={result} className="min-h-11">
                  {resultLabel(t, result)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={`${ids}-hard`}>
                {t('foodTracker.ladderUi.detail.hardTime', { defaultValue: 'Hard time' })}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('foodTracker.ladderUi.detail.hardTimeHint', {
                  defaultValue: 'Real upset at the table. The food steps back and rests longer.',
                })}
              </p>
            </div>
            <Switch
              id={`${ids}-hard`}
              checked={draft.hardTime}
              onCheckedChange={(checked) => update({ hardTime: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${ids}-reaction`}>
              {t('foodTracker.ladderUi.detail.reaction', { defaultValue: 'Any reaction?' })}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {REACTION_CHIPS.map((chip) => (
                <Button
                  key={chip}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={() => appendReaction(chip)}
                  aria-label={t('foodTracker.ladderUi.detail.addReaction', {
                    defaultValue: 'Add "{{reaction}}" to the reaction note',
                    reaction: t(`foodTracker.ladderUi.detail.reactionChip.${chip}`),
                  })}
                >
                  {t(`foodTracker.ladderUi.detail.reactionChip.${chip}`)}
                </Button>
              ))}
            </div>
            <Textarea
              id={`${ids}-reaction`}
              value={draft.reaction}
              maxLength={MAX_ATTEMPT_NOTE_LENGTH}
              rows={2}
              onChange={(e) => update({ reaction: e.target.value })}
            />
          </div>

          {moodGroup(
            'moodBefore',
            t('foodTracker.ladderUi.detail.moodBefore', { defaultValue: 'Mood before' })
          )}
          {moodGroup(
            'moodAfter',
            t('foodTracker.ladderUi.detail.moodAfter', { defaultValue: 'Mood after' })
          )}

          <div className="space-y-2">
            <p id={`${ids}-amount`} className="text-sm font-medium text-foreground">
              {t('foodTracker.ladderUi.detail.amount', { defaultValue: 'How much' })}
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby={`${ids}-amount`}
              className="flex-wrap justify-start"
              value={draft.amount ?? ''}
              onValueChange={(value) => update({ amount: isAmount(value) ? value : null })}
            >
              {ATTEMPT_AMOUNTS.map((amount) => (
                <ToggleGroupItem key={amount} value={amount} className="min-h-11">
                  {t(`foodTracker.ladderUi.detail.amounts.${amount}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${ids}-note`}>
              {t('foodTracker.ladderUi.detail.note', { defaultValue: 'Note for yourself' })}
            </Label>
            <Textarea
              id={`${ids}-note`}
              value={draft.note}
              maxLength={MAX_ATTEMPT_NOTE_LENGTH}
              rows={2}
              onChange={(e) => update({ note: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id={`${ids}-first`}
              checked={draft.firstTime}
              onCheckedChange={(checked) => update({ firstTime: checked === true })}
            />
            <Label htmlFor={`${ids}-first`}>
              {t('foodTracker.ladderUi.detail.firstTime', { defaultValue: 'First time ever' })}
            </Label>
          </div>
        </div>

        <SheetFooter className="sticky bottom-0 border-t border-border bg-background px-6 py-3">
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={!draft.result || saving}
            onClick={handleSave}
          >
            {saving
              ? t('foodTracker.ladderUi.detail.saving', { defaultValue: 'Saving...' })
              : t('foodTracker.ladderUi.detail.save', { defaultValue: 'Save' })}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
