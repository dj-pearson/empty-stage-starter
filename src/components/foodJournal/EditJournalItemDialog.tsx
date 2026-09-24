import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { toast } from "sonner";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOnline } from "@/hooks/useCommon";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import {
  AMOUNT_EATEN_VALUES,
  NOTE_MAX_LENGTH,
  amountForSave,
  type JournalItem,
  type JournalNote,
} from "@/lib/foodJournal";
import { buildUndoPatch, performQuickLog, type QuickLogUndoSnapshot } from "@/lib/quickLog";
import { TOGGLE_CHIP_CLASS, toggleChipState } from "@/lib/toggleChip";
import type { AmountEaten, MealResult, PlanEntry } from "@/types";

/**
 * Correct a logged meal from the food journal: the result (or clear it), how
 * much was eaten, and the household's shared note.
 *
 * The result goes through performQuickLog, the same path as the shell's quick
 * log, so the amount rules (a refusal has none) live in one place. The note is
 * edited as a whole here, so it is written with noteMode 'replace'.
 */

/** Past this many characters the counter appears. */
const COUNTER_FROM = 400;

const patchSchema = z.object({
  notes: z.string().max(NOTE_MAX_LENGTH),
  amount_eaten: z.enum([...AMOUNT_EATEN_VALUES] as [AmountEaten, ...AmountEaten[]]).nullable(),
});

export interface EditJournalItemPatch {
  result?: MealResult;
  notes?: string | null;
  amount_eaten?: AmountEaten | null;
}

export interface EditJournalItemDialogProps {
  item: JournalItem | null;
  /** The plan entry behind `item`, as AppContext holds it now. */
  entry: PlanEntry | undefined;
  /** "Maria, 12:40" for a note someone else wrote, or null when unknown. */
  authorLabel: (note: JournalNote) => string | null;
  onClose: () => void;
  /** AppContext's updatePlanEntry: resolves to the error, or null. */
  save: (entryId: string, patch: EditJournalItemPatch) => PromiseLike<{ error: unknown }>;
}

const RESULTS: ReadonlyArray<Exclude<MealResult, null>> = ["ate", "tasted", "refused"];

const entryNoteOf = (item: JournalItem, entry: PlanEntry | undefined): string =>
  entry ? entry.notes ?? "" : item.notes.find((n) => n.source === "entry")?.text ?? "";

export function EditJournalItemDialog({ item, entry, authorLabel, onClose, save }: EditJournalItemDialogProps) {
  const { t } = useTranslation();
  const online = useOnline();
  const unknownFood = t("foodJournal.unknownFood", { defaultValue: "Unknown food" });
  const noteId = useId();
  const resultGroupId = useId();
  const amountGroupId = useId();
  const counterId = useId();

  // The close animation runs after `item` goes null; keep the last one so the
  // title and fields do not blank while the dialog fades out.
  const lastItem = useRef<JournalItem | null>(item);
  if (item) lastItem.current = item;
  const shown = item ?? lastItem.current;

  const [result, setResult] = useState<MealResult>(null);
  const [amount, setAmount] = useState<AmountEaten | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  /** The entry note this edit started from, or last reconciled with. */
  const seededNote = useRef("");
  const initial = useRef<{ result: MealResult; amount: AmountEaten | null; note: string }>({
    result: null,
    amount: null,
    note: "",
  });

  useEffect(() => {
    if (!item) return;
    const startNote = entryNoteOf(item, entry);
    const startResult = entry ? entry.result : item.result;
    const startAmount = (entry ? entry.amount_eaten : item.amountEaten) ?? null;
    seededNote.current = startNote;
    initial.current = { result: startResult, amount: startAmount, note: startNote };
    setResult(startResult);
    setAmount(startAmount);
    setNote(startNote);
    setFailed(false);
    // Reset only when a different entry opens, not on every realtime update:
    // a note changed elsewhere is surfaced below instead of overwriting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.entryId]);

  const liveNote = entry?.notes ?? "";
  const conflict = item !== null && entry !== undefined && liveNote !== seededNote.current && !saving;

  const effectiveAmount = amountForSave(result, amount);
  const dirty =
    result !== initial.current.result ||
    note.trim() !== initial.current.note.trim() ||
    effectiveAmount !== amountForSave(initial.current.result, initial.current.amount);
  const tooLong = note.length > NOTE_MAX_LENGTH;
  const canSave = !!item && dirty && online && !saving && !conflict && !tooLong;

  // Either answer moves the seed to what the entry holds now, which clears the
  // notice. "Use theirs" also takes their text; "Keep mine" saves over it.
  const [, setReconciled] = useState(0);
  const adoptTheirs = () => {
    seededNote.current = liveNote;
    initial.current = { ...initial.current, note: liveNote };
    setNote(liveNote);
    setReconciled((n) => n + 1);
  };
  const keepMine = () => {
    seededNote.current = liveNote;
    setReconciled((n) => n + 1);
  };

  const handleSave = async () => {
    if (!item || !canSave) return;
    const parsed = patchSchema.safeParse({ notes: note.trim(), amount_eaten: effectiveAmount });
    if (!parsed.success) {
      setFailed(true);
      return;
    }
    const entryId = item.entryId;
    const trimmed = parsed.data.notes;
    const before: QuickLogUndoSnapshot = {
      result: entry ? entry.result : item.result,
      notes: entry ? entry.notes : initial.current.note,
      amount_eaten: entry ? entry.amount_eaten : item.amountEaten,
    };

    setSaving(true);
    setFailed(false);
    // Our own optimistic write changes entry.notes before the save resolves;
    // that is not someone else's edit.
    const previousSeed = seededNote.current;
    seededNote.current = trimmed;

    let sent: EditJournalItemPatch | null = null;
    let error: unknown = null;
    try {
      if (result === null) {
        const patch: EditJournalItemPatch = { result: null, amount_eaten: null, notes: trimmed };
        const res = await save(entryId, patch);
        error = res?.error ?? null;
        sent = patch;
      } else {
        const outcome = await performQuickLog({
          meals: [
            {
              id: entryId,
              label: item.name ?? unknownFood,
              notes: entry?.notes ?? initial.current.note,
              amount_eaten: before.amount_eaten,
            },
          ],
          mealId: entryId,
          result,
          notes: trimmed,
          amount: parsed.data.amount_eaten,
          noteMode: "replace",
          save,
        });
        if (outcome.status === "saved") sent = outcome.patch;
        else error = outcome.status === "failed" ? outcome.error ?? true : true;
      }
    } catch (e) {
      error = e;
    } finally {
      setSaving(false);
    }

    if (error || !sent) {
      logger.error("Food journal edit failed:", error);
      seededNote.current = previousSeed;
      setFailed(true);
      return;
    }

    const undoPatch = buildUndoPatch(before, { ...sent });
    toast.success(t("foodJournal.saved"), {
      action: {
        label: t("quickLog.undo", { defaultValue: "Undo" }),
        onClick: async () => {
          let undoError: unknown = null;
          try {
            undoError = (await save(entryId, undoPatch))?.error ?? null;
          } catch (e) {
            undoError = e;
          }
          if (undoError) {
            toast.error(
              t("quickLog.undoFailed", { defaultValue: "Couldn't undo that. Check the meal in the planner." })
            );
          }
        },
      },
    });
    onClose();
  };

  // Notes other people wrote (iOS feedback, reactions, attempts). RLS lets
  // only the author edit those, so they are context here, not fields.
  const otherNotes = shown?.notes.filter((n) => n.source !== "entry") ?? [];
  const showAmount = result === "ate" || result === "tasted";

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{shown ? t("foodJournal.editTitle", { name: shown.name ?? unknownFood }) : ""}</DialogTitle>
          <DialogDescription>
            {t("foodJournal.editor.description", {
              defaultValue: "Correct the result, how much was eaten, or the note everyone in your household sees.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div role="group" aria-labelledby={resultGroupId} className="space-y-2">
          <p id={resultGroupId} className="text-sm font-medium">
            {t("foodJournal.editor.resultLabel", { defaultValue: "How did it go?" })}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RESULTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setResult(value)}
                aria-pressed={result === value}
                disabled={saving}
                className={cn(TOGGLE_CHIP_CLASS, toggleChipState(result === value))}
              >
                {t(`foodJournal.result.${value}`)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setResult(null)}
              aria-pressed={result === null}
              disabled={saving}
              className={cn(TOGGLE_CHIP_CLASS, toggleChipState(result === null))}
            >
              {t("foodJournal.editor.notLogged", { defaultValue: "Not logged" })}
            </button>
          </div>
        </div>

        {showAmount ? (
          <div role="group" aria-labelledby={amountGroupId} className="space-y-2">
            <p id={amountGroupId} className="text-sm font-medium">
              {t("foodJournal.amountLabel")}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {AMOUNT_EATEN_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount((current) => (current === value ? null : value))}
                  aria-pressed={amount === value}
                  disabled={saving}
                  className={cn(TOGGLE_CHIP_CLASS, toggleChipState(amount === value))}
                >
                  {t(`foodJournal.amount.${value}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {result === "refused"
              ? t("foodJournal.editor.amountNotForRefused", { defaultValue: "No amount for a refusal." })
              : t("foodJournal.editor.logResultFirst", { defaultValue: "Pick a result to record how much." })}
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor={noteId}>{t("foodJournal.noteLabel")}</Label>
          <Textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("foodJournal.notePlaceholder")}
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            aria-describedby={note.length > COUNTER_FROM ? counterId : undefined}
            aria-invalid={tooLong || undefined}
            disabled={saving}
          />
          {note.length > COUNTER_FROM && (
            <p
              id={counterId}
              aria-live="polite"
              className={cn("text-right text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}
            >
              {t("foodJournal.editor.charCount", {
                defaultValue: "{{count}} / {{max}}",
                count: note.length,
                max: NOTE_MAX_LENGTH,
              })}
            </p>
          )}
        </div>

        {conflict && (
          <div role="status" className="space-y-2 rounded-lg bg-muted px-3 py-2">
            <p className="text-sm text-foreground">
              {t("foodJournal.editor.changedElsewhere", {
                defaultValue: "Someone else changed this note while you were editing.",
              })}
            </p>
            {liveNote && <p className="whitespace-pre-wrap text-sm text-foreground">{liveNote}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={adoptTheirs}>
                {t("foodJournal.editor.useTheirs", { defaultValue: "Use theirs" })}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={keepMine}>
                {t("foodJournal.editor.keepMine", { defaultValue: "Keep mine" })}
              </Button>
            </div>
          </div>
        )}

        {otherNotes.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("foodJournal.otherNotes")}</p>
            <ul className="space-y-1">
              {otherNotes.map((n) => {
                const by = authorLabel(n);
                return (
                  <li key={n.key} className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {by && <span className="font-medium text-foreground">{by}: </span>}
                    {n.text}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t("foodJournal.editor.saveFailed", {
              defaultValue: "That didn't save. Your changes are still here; try again.",
            })}
          </p>
        )}

        {!online && (
          <p className="text-sm text-muted-foreground">
            {t("foodJournal.editor.offline", { defaultValue: "You're offline. Reconnect to save." })}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("foodJournal.cancel")}
          </Button>
          <Button disabled={!canSave} onClick={handleSave}>
            {t("foodJournal.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
