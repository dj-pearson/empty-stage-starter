/**
 * US-284: prompt the user to bulk-add a recipe's missing ingredients to
 * the grocery list when a recipe is added to the planner without enough
 * pantry stock to cover it.
 *
 * Behaviour rules:
 *   - Default-checked: rows with a real amount (comparable units and a
 *     recipe quantity) start selected so the happy path is one tap.
 *   - Rows whose amount can't be trusted (cups vs lb, "to taste") show a
 *     "Check amount" badge with the reason inline and start unchecked.
 *   - "Skip" closes without writing anything. The recipe is still added
 *     to the plan (caller decides; this dialog is purely additive).
 *   - "Add N" inserts each selected row as a grocery_items row with
 *     `added_via='recipe'` and `source_recipe_id` set, so US-262's
 *     auto-check on mark-made and US-290 plan-aware flags can find
 *     them later.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { Shortfall } from "@/lib/recipeShortfall";
import { logger } from "@/lib/logger";
import "@/i18n/appLocale";

interface MissingIngredientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeName: string;
  shortfalls: Shortfall[];
  onConfirm: (selected: Shortfall[]) => void | Promise<void>;
}

/**
 * A row starts checked only when its amount is a real figure: comparable
 * units and a recipe quantity. "To taste" and cups-vs-lb rows are shown but
 * left for the parent to tick, so one tap never puts a guessed amount on the
 * list.
 */
const preChecked = (s: Shortfall) => s.comparable && s.needed > 0;

export function MissingIngredientsDialog({
  open,
  onOpenChange,
  recipeName,
  shortfalls,
  onConfirm,
}: MissingIngredientsDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(shortfalls.filter(preChecked).map((s) => s.ingredient.id)),
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(shortfalls.filter(preChecked).map((s) => s.ingredient.id)));
      setSubmitting(false);
    }
  }, [open, shortfalls]);

  const selectedCount = selected.size;
  const total = shortfalls.length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (submitting) return;
    const picked = shortfalls.filter((s) => selected.has(s.ingredient.id));
    setSubmitting(true);
    try {
      await onConfirm(picked);
      onOpenChange(false);
    } catch (error) {
      logger.error("MissingIngredientsDialog: add to grocery failed", error);
      toast.error(
        t("planner.missing.addFailed", {
          defaultValue: "Couldn't add those to your grocery list. Please try again.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (total === 0) return null;

  const describeRow = (s: Shortfall): string => {
    const need = formatQty(s.needed, s.neededUnit);
    switch (s.reason) {
      case "unknown_quantity":
        return t("planner.missing.noAmount", {
          defaultValue: "Recipe gives no amount, and none is on hand.",
        });
      case "not_in_pantry":
        return t("planner.missing.notInPantry", {
          defaultValue: "Need {{need}}. Not in your pantry.",
          need,
        });
      case "unit_mismatch":
        return t("planner.missing.unitMismatch", {
          defaultValue:
            "Recipe uses {{needUnit}}, your pantry has {{have}}. These can't be compared, so check before buying.",
          needUnit: s.neededUnit ?? t("planner.missing.noUnit", { defaultValue: "no unit" }),
          have: formatQty(s.onHand, s.onHandUnit),
        });
      default:
        return t("planner.missing.short", {
          defaultValue: "Need {{need}} more. Have {{have}}.",
          need,
          have: formatQty(s.onHand, s.onHandUnit),
        });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-none sm:w-full sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
            {t("planner.missing.title", { defaultValue: "Missing ingredients" })}
          </DialogTitle>
          <DialogDescription>
            {t("planner.missing.description", {
              defaultValue:
                "{{recipe}} needs {{count}} item you don't have on hand. Add the ones you want to your grocery list.",
              defaultValue_other:
                "{{recipe}} needs {{count}} items you don't have on hand. Add the ones you want to your grocery list.",
              recipe: recipeName,
              count: total,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-2">
          {shortfalls.map((s) => {
            const id = s.ingredient.id;
            const isOn = selected.has(id);
            const needsCheck = !s.comparable;
            return (
              <label
                key={id}
                htmlFor={`missing-${id}`}
                className="flex min-h-11 items-start gap-3 p-3 rounded-md border hover:bg-muted/40 cursor-pointer"
              >
                <Checkbox
                  id={`missing-${id}`}
                  checked={isOn}
                  onCheckedChange={() => toggle(id)}
                  disabled={submitting}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{s.ingredient.name}</span>
                    {needsCheck && (
                      <Badge variant="outline" className="text-warning border-warning/40 text-xs font-normal">
                        {t("planner.missing.checkAmount", { defaultValue: "Check amount" })}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{describeRow(s)}</p>
                </div>
              </label>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            className="min-h-11 sm:min-h-10"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("planner.missing.skip", { defaultValue: "Skip" })}
          </Button>
          <Button
            className="min-h-11 sm:min-h-10"
            onClick={handleConfirm}
            disabled={selectedCount === 0 || submitting}
            aria-busy={submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />
            )}
            {t("planner.missing.confirm", {
              defaultValue: "Add {{count}} to grocery",
              count: selectedCount,
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatQty(qty: number, unit: string | null): string {
  // Trim trailing zeroes for whole numbers ("2" not "2.0"), keep up to
  // 2 decimals for fractions.
  const rounded =
    Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, "");
  return unit ? `${rounded} ${unit}` : rounded;
}
