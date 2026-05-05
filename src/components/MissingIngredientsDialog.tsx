/**
 * US-284: prompt the user to bulk-add a recipe's missing ingredients to
 * the grocery list when a recipe is added to the planner without enough
 * pantry stock to cover it.
 *
 * Behaviour rules:
 *   - Default-checked: every shortfall row starts selected so the
 *     happy-path is one tap. User can uncheck what they don't want.
 *   - Unit-mismatch rows show a small "verify" badge — they're still
 *     selected by default, but the help text reminds the user the
 *     conservative shortfall may overshoot.
 *   - "Skip" closes without writing anything. The recipe is still added
 *     to the plan (caller decides; this dialog is purely additive).
 *   - "Add N" inserts each selected row as a grocery_items row with
 *     `added_via='recipe'` and `source_recipe_id` set, so US-262's
 *     auto-check on mark-made and US-290 plan-aware flags can find
 *     them later.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, AlertTriangle } from "lucide-react";
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

interface MissingIngredientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeName: string;
  shortfalls: Shortfall[];
  onConfirm: (selected: Shortfall[]) => void | Promise<void>;
}

export function MissingIngredientsDialog({
  open,
  onOpenChange,
  recipeName,
  shortfalls,
  onConfirm,
}: MissingIngredientsDialogProps) {
  // Default every row checked when the dialog opens or shortfalls change.
  const initialSelected = useMemo(
    () => new Set(shortfalls.map((s) => s.ingredient.id)),
    [shortfalls]
  );
  const [selected, setSelected] = useState<Set<string>>(initialSelected);

  useEffect(() => {
    if (open) setSelected(new Set(shortfalls.map((s) => s.ingredient.id)));
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
    const picked = shortfalls.filter((s) => selected.has(s.ingredient.id));
    await onConfirm(picked);
    onOpenChange(false);
  };

  if (total === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Missing ingredients
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{recipeName}</span> needs{" "}
            {total} item{total === 1 ? "" : "s"} you don&rsquo;t have on hand.
            Add the ones you want to your grocery list.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
          {shortfalls.map((s) => {
            const id = s.ingredient.id;
            const isOn = selected.has(id);
            const formattedNeeded = formatQty(s.needed, s.neededUnit);
            const formattedOnHand = s.matchedFood
              ? formatQty(s.onHand, s.onHandUnit)
              : "Not in pantry";
            return (
              <label
                key={id}
                className="flex items-start gap-3 p-3 rounded-md border hover:bg-muted/40 cursor-pointer"
              >
                <Checkbox
                  checked={isOn}
                  onCheckedChange={() => toggle(id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {s.ingredient.name}
                    </span>
                    {!s.comparable && (
                      <Badge
                        variant="outline"
                        className="text-amber-600 border-amber-300 text-[10px] uppercase tracking-wide"
                      >
                        verify
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Need {formattedNeeded}
                    {s.matchedFood && (
                      <> &middot; Have {formattedOnHand}</>
                    )}
                    {!s.matchedFood && (
                      <> &middot; Not in pantry</>
                    )}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button onClick={handleConfirm} disabled={selectedCount === 0}>
            <Check className="h-4 w-4 mr-1.5" />
            Add {selectedCount} to grocery
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
