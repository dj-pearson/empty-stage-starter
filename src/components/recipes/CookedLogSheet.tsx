import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, CircleDot, Loader2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TOGGLE_CHIP_CLASS, toggleChipState } from "@/lib/toggleChip";
import { slotForTime, type QuickLogResult } from "@/lib/quickLog";
import { slotLabel } from "@/hooks/useRecipeQuickPlan";
import { useRecipeCookLog } from "@/hooks/useRecipeCookLog";
import type { CookLogGate } from "@/lib/recipeCookLog";
import type { Recipe } from "@/types";
import "@/i18n/appLocale";

const RESULTS: readonly QuickLogResult[] = ["ate", "tasted", "refused"];
const RESULT_ICON = { ate: Check, tasted: CircleDot, refused: X } as const;
const RESULT_DEFAULT: Record<QuickLogResult, string> = { ate: "Ate", tasted: "Tasted", refused: "Refused" };

interface CookedLogSheetProps {
  recipe: Recipe;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "How did it go?" after cooking: ate / tasted / refused for each kid in one
 * sheet, saved through the plan (useRecipeCookLog) with Undo.
 */
export function CookedLogSheet({ recipe, open, onOpenChange }: CookedLogSheetProps) {
  const { t } = useTranslation();
  const { preview, logCooked } = useRecipeCookLog();
  const [choices, setChoices] = useState<Record<string, QuickLogResult>>({});
  const [saving, setSaving] = useState(false);

  // Fixed for as long as the sheet is open: a row that moved mid-choice
  // would put the parent's tap on a different kid.
  const [openedAt, setOpenedAt] = useState(() => new Date());
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOpenedAt(new Date());
      setChoices({});
    }
  }
  const rows = useMemo(() => (open ? preview(recipe, openedAt) : []), [open, preview, recipe, openedAt]);
  const slotName = slotLabel(t, slotForTime(openedAt));
  const chosen = Object.keys(choices).length;

  const gateText = (gate: CookLogGate): string => {
    if (gate.reason === "allergen") {
      return gate.severe
        ? t("recipes.cooked.gateSevere", {
            defaultValue: "Severe {{allergen}} allergy. Not added to the plan.",
            allergen: gate.allergen,
          })
        : t("recipes.cooked.gateAllergen", {
            defaultValue: "Allergy: {{allergen}}. Not added to the plan.",
            allergen: gate.allergen,
          });
    }
    if (gate.reason === "no-foods") {
      return t("recipes.cooked.gateNoFoods", {
        defaultValue: "Link an ingredient to a food to log this recipe.",
      });
    }
    return t("recipes.cooked.gateUnknown", {
      defaultValue: "Allergy info not checked. Plan it from the planner to log it.",
    });
  };

  const choose = (kidId: string, result: QuickLogResult) =>
    setChoices((prev) => {
      const next = { ...prev };
      if (next[kidId] === result) delete next[kidId];
      else next[kidId] = result;
      return next;
    });

  const save = async () => {
    if (saving || chosen === 0) return;
    setSaving(true);
    try {
      const outcome = await logCooked(
        recipe,
        Object.entries(choices).map(([kidId, result]) => ({ kidId, result })),
        openedAt,
      );
      const name = (id: string) => rows.find((r) => r.kid.id === id)?.kid.name ?? "";
      if (outcome.logged.length > 0) {
        toast.success(
          t("recipes.cooked.logged", {
            defaultValue: "Logged {{recipe}} for {{names}}",
            recipe: recipe.name,
            names: outcome.logged.map(name).join(", "),
          }),
          {
            action: {
              label: t("planner.actions.undo", { defaultValue: "Undo" }),
              onClick: () => void outcome.undo(),
            },
          },
        );
      }
      if (outcome.failed.length > 0) {
        toast.error(
          t("recipes.cooked.failed", {
            defaultValue: "Couldn't log it for {{names}}. Please try again.",
            names: outcome.failed.map(name).join(", "),
          }),
        );
      }
      if (outcome.failed.length === 0) onOpenChange(false);
      // Kids already logged come off the sheet, so Save again retries only
      // the ones that failed instead of writing the others a second time.
      else {
        const failed = new Set(outcome.failed);
        setChoices((prev) => Object.fromEntries(Object.entries(prev).filter(([kidId]) => failed.has(kidId))));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>{t("recipes.cooked.title", { defaultValue: "How did it go?" })}</SheetTitle>
          <SheetDescription>
            {t("recipes.cooked.description", {
              defaultValue: "{{recipe}}, today's {{slot}}. Tap what each child did.",
              recipe: recipe.name,
              slot: slotName,
            })}
          </SheetDescription>
        </SheetHeader>

        {rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {t("recipes.cooked.noKids", { defaultValue: "Add a child to log how meals go." })}
          </p>
        ) : (
          <ul className="mt-4 space-y-4" data-testid="cooked-log-rows">
            {rows.map(({ kid, entry, gate }) => {
              const picked = choices[kid.id];
              return (
                <li key={kid.id} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{kid.name}</span>
                    {entry && (
                      <span className="text-xs text-muted-foreground">
                        {t("recipes.cooked.onPlan", {
                          defaultValue: "On today's {{slot}}",
                          slot: slotLabel(t, entry.meal_slot),
                        })}
                      </span>
                    )}
                  </div>
                  {gate ? (
                    <p className="text-sm text-muted-foreground" data-testid={`cooked-gate-${kid.id}`}>
                      {gateText(gate)}
                    </p>
                  ) : (
                    <div
                      role="radiogroup"
                      aria-label={t("recipes.cooked.kidLabel", { defaultValue: "What {{name}} did", name: kid.name })}
                      className="grid grid-cols-3 gap-2"
                    >
                      {RESULTS.map((result) => {
                        const Icon = RESULT_ICON[result];
                        const on = picked === result;
                        return (
                          <button
                            key={result}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={saving}
                            onClick={() => choose(kid.id, result)}
                            className={cn(
                              TOGGLE_CHIP_CLASS,
                              toggleChipState(on),
                              "inline-flex items-center justify-center gap-1.5",
                            )}
                          >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {t(`recipes.cooked.result.${result}`, { defaultValue: RESULT_DEFAULT[result] })}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6 flex gap-2 pb-[env(safe-area-inset-bottom)]">
          <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("recipes.cooked.skip", { defaultValue: "Skip" })}
          </Button>
          <Button className="h-11 flex-1" onClick={() => void save()} disabled={saving || chosen === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
            {t("recipes.cooked.save", { defaultValue: "Save" })}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
