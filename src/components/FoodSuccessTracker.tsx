/**
 * The Food Tracker when the exposure ladder flag is off.
 *
 * It used to insert into food_attempts on its own, with "full bite / success /
 * happy / most" preselected, so a hurried save recorded a good meal nobody
 * saw. It now logs through useFoodLadder().logAttempt, the same path as the
 * ladder view, so the attempt row, the rung, the plan-limit gate and mastery
 * stay consistent whichever view is on. Nothing is preselected: the stage
 * comes from the food's rung, and mood and amount are written as null.
 *
 * The page decides which child is shown (and what to say when there is none),
 * so this renders nothing without an active kid.
 */
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useKids, useFoods } from "@/contexts/AppContext";
import {
  MAX_ATTEMPT_BITES,
  MAX_ATTEMPT_NOTE_LENGTH,
  useFoodLadder,
  type QuickLogResult,
} from "@/hooks/useFoodLadder";
import { FoodHistoryList } from "@/components/foodTracker/FoodHistoryList";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

export interface FoodSuccessTrackerProps {
  /** Kept for callers that still pass it; the page owns the no-kid state now. */
  onAddChild?: () => void;
}

const RESULTS: readonly QuickLogResult[] = ["accepted", "held", "refused"];
const RESULT_DEFAULTS: Record<QuickLogResult, string> = {
  accepted: "Took it",
  held: "Partway",
  refused: "Not today",
};

interface AttemptForm {
  foodId: string;
  result: QuickLogResult | null;
  hardTime: boolean;
  bites: string;
  reactionNotes: string;
  parentNotes: string;
  isMilestone: boolean;
}

const EMPTY_FORM: AttemptForm = {
  foodId: "",
  result: null,
  hardTime: false,
  bites: "",
  reactionNotes: "",
  parentNotes: "",
  isMilestone: false,
};

function parseBites(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, MAX_ATTEMPT_BITES);
}

export function FoodSuccessTracker(_props: FoodSuccessTrackerProps = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeKidId, kids } = useKids();
  const { foods } = useFoods();
  const activeKid = kids.find((k) => k.id === activeKidId) ?? null;
  const { logAttempt } = useFoodLadder(activeKidId, { kid: activeKid, foods });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AttemptForm>(EMPTY_FORM);
  const [foodSearch, setFoodSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const filteredFoods = useMemo(() => {
    const search = foodSearch.trim().toLowerCase();
    if (!search) return foods;
    return foods.filter(
      (food) =>
        food.name.toLowerCase().includes(search) ||
        (food.category ?? "").toLowerCase().includes(search)
    );
  }, [foods, foodSearch]);

  const selectedFood = foods.find((f) => f.id === form.foodId);

  const handleSave = async () => {
    if (savingRef.current) return;
    if (!form.foodId) {
      toast.error(t("foodTracker.legacy.selectFood", { defaultValue: "Pick a food first" }));
      return;
    }
    if (!form.result) {
      toast.error(t("foodTracker.legacy.selectResult", { defaultValue: "Pick how it went" }));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const outcome = await logAttempt({
        foodId: form.foodId,
        result: form.result,
        hardTime: form.hardTime,
        details: {
          reactionNotes: form.reactionNotes,
          parentNotes: form.parentNotes,
          bitesTaken: parseBites(form.bites),
          moodBefore: null,
          moodAfter: null,
          amountConsumed: null,
          isMilestone: form.isMilestone,
        },
      });
      if (outcome.ok) {
        toast.success(t("foodTracker.legacy.saved", { defaultValue: "Attempt logged" }));
        setForm(EMPTY_FORM);
        setFoodSearch("");
        setOpen(false);
        return;
      }
      // 'limit' has already raised the upgrade prompt inside the hook.
      if (outcome.reason === "in_flight") {
        toast.info(
          t("foodTracker.legacy.inFlight", { defaultValue: "Still saving the last one for this food." })
        );
      } else if (outcome.reason === "cap") {
        toast.error(
          t("foodTracker.legacy.cap", {
            defaultValue: "Too many foods are due that day. Try again tomorrow.",
          })
        );
      } else if (outcome.reason === "error") {
        toast.error(
          t("foodTracker.legacy.saveFailed", { defaultValue: "That didn't save. Try again in a moment." })
        );
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!activeKidId) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} className="min-h-11">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("foodTracker.legacy.logAttempt", { defaultValue: "Log attempt" })}
        </Button>
      </div>

      <FoodHistoryList key={activeKidId} kidId={activeKidId} />

      {/* An outside tap or Escape closes without clearing: the form is only reset once a log lands. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("foodTracker.legacy.dialogTitle", { defaultValue: "Log a food attempt" })}
            </DialogTitle>
            <DialogDescription>
              {t("foodTracker.legacy.dialogDescription", {
                defaultValue: "Only the food and how it went are needed. Everything else is optional.",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="legacy-food-search">
                {t("foodTracker.legacy.food", { defaultValue: "Food" })}
              </Label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="legacy-food-search"
                  value={foodSearch}
                  onChange={(e) => setFoodSearch(e.target.value)}
                  placeholder={t("foodTracker.legacy.searchFoods", { defaultValue: "Search foods..." })}
                  className="pl-9"
                />
              </div>
              {foods.length === 0 ? (
                <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                  <p className="mb-2">
                    {t("foodTracker.legacy.noFoods", { defaultValue: "No foods in your pantry yet." })}
                  </p>
                  <Button
                    variant="link"
                    className="h-auto p-0"
                    onClick={() => {
                      setOpen(false);
                      navigate("/dashboard/pantry");
                    }}
                  >
                    {t("foodTracker.legacy.addFoodsFirst", {
                      defaultValue: "Add foods in your Pantry first",
                    })}
                  </Button>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-md border p-2">
                  {filteredFoods.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {t("foodTracker.legacy.noMatch", {
                        defaultValue: 'No foods match "{{query}}"',
                        query: foodSearch,
                      })}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {filteredFoods.map((food) => {
                        const selected = form.foodId === food.id;
                        return (
                          <li key={food.id}>
                            <button
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setForm((f) => ({ ...f, foodId: food.id }))}
                              className={cn(
                                "min-h-11 w-full rounded-md px-3 py-2 text-left text-sm",
                                "transition-colors motion-reduce:transition-none",
                                "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selected ? "bg-primary text-primary-foreground" : "bg-background"
                              )}
                            >
                              <span className="font-medium">{food.name}</span>
                              {food.category && (
                                <span className="ml-2 text-xs capitalize opacity-70">{food.category}</span>
                              )}
                              {food.is_try_bite && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "ml-2 px-1 py-0 text-[10px]",
                                    selected && "border-primary-foreground/40 text-primary-foreground"
                                  )}
                                >
                                  {t("foodTracker.legacy.tryBite", { defaultValue: "Try bite" })}
                                </Badge>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
              {selectedFood && (
                <p className="text-xs text-muted-foreground">
                  {t("foodTracker.legacy.selected", {
                    defaultValue: "Selected: {{food}}",
                    food: selectedFood.name,
                  })}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium" id="legacy-result-label">
                {t("foodTracker.legacy.howDidItGo", { defaultValue: "How did it go?" })}
              </p>
              <ToggleGroup
                type="single"
                value={form.result ?? ""}
                onValueChange={(value) =>
                  setForm((f) => ({
                    ...f,
                    result: (RESULTS as readonly string[]).includes(value) ? (value as QuickLogResult) : null,
                  }))
                }
                aria-labelledby="legacy-result-label"
                className="flex-wrap justify-start"
              >
                {RESULTS.map((r) => (
                  <ToggleGroupItem key={r} value={r} variant="outline" className="min-h-11 px-4">
                    {t(`foodTracker.legacy.result.${r}`, { defaultValue: RESULT_DEFAULTS[r] })}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="legacy-hard-time"
                  checked={form.hardTime}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, hardTime: checked === true }))}
                />
                <Label htmlFor="legacy-hard-time" className="cursor-pointer text-sm font-normal">
                  {t("foodTracker.legacy.hardTime", {
                    defaultValue: "It was a hard time (upset, gagging, meltdown)",
                  })}
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="legacy-reaction">
                {t("foodTracker.legacy.reactionNotes", { defaultValue: "Reaction" })}
              </Label>
              <Textarea
                id="legacy-reaction"
                value={form.reactionNotes}
                maxLength={MAX_ATTEMPT_NOTE_LENGTH}
                onChange={(e) => setForm((f) => ({ ...f, reactionNotes: e.target.value }))}
                placeholder={t("foodTracker.legacy.reactionPlaceholder", {
                  defaultValue: "Gagging, a rash, a tummy ache... anything to watch for next time",
                })}
                rows={2}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[8rem_1fr]">
              <div className="space-y-2">
                <Label htmlFor="legacy-bites">
                  {t("foodTracker.legacy.bitesTaken", { defaultValue: "Bites taken" })}
                </Label>
                <Input
                  id="legacy-bites"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_ATTEMPT_BITES}
                  value={form.bites}
                  onChange={(e) => setForm((f) => ({ ...f, bites: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="legacy-notes">
                  {t("foodTracker.legacy.parentNotes", { defaultValue: "Parent notes" })}
                </Label>
                <Textarea
                  id="legacy-notes"
                  value={form.parentNotes}
                  maxLength={MAX_ATTEMPT_NOTE_LENGTH}
                  onChange={(e) => setForm((f) => ({ ...f, parentNotes: e.target.value }))}
                  placeholder={t("foodTracker.legacy.parentNotesPlaceholder", {
                    defaultValue: "Observations, strategies used, or context...",
                  })}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="legacy-milestone"
                checked={form.isMilestone}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isMilestone: checked === true }))}
              />
              <Label htmlFor="legacy-milestone" className="cursor-pointer text-sm font-normal">
                {t("foodTracker.legacy.milestone", {
                  defaultValue: "Mark as a milestone (first time, breakthrough)",
                })}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("foodTracker.legacy.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !form.foodId || !form.result}
              aria-busy={saving}
            >
              {saving
                ? t("foodTracker.legacy.saving", { defaultValue: "Saving..." })
                : t("foodTracker.legacy.save", { defaultValue: "Save attempt" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
