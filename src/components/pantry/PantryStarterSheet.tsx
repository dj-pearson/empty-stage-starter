import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertOctagon, AlertTriangle, Check, Loader2, Sprout } from "lucide-react";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { KidFitBadges } from "@/components/recipes/KidFitBadges";
import type { Food, Kid, PlanEntry } from "@/types";
import {
  buildStarterRows,
  isStarterSelectable,
  starterSelectionToFoods,
  type StarterFood,
  type StarterRow,
} from "@/lib/pantryStarter";
import { CATEGORY_ORDER, getCategoryConfig } from "./pantryConstants";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

interface PantryStarterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kids: readonly Kid[];
  foods: readonly Food[];
  planEntries?: readonly PlanEntry[];
  /** Inserts the foods; resolves false when nothing was added (a plan limit). */
  onAdd: (foods: Omit<Food, "id">[]) => Promise<boolean>;
}

/**
 * Item 20: a checklist of common starter foods, scored against every kid.
 *
 * Nothing starts ticked. A row carrying any kid's allergen cannot be ticked
 * and says whose and which, with a severe allergy called out as severe. What
 * is added goes in at quantity 1 and is not marked safe (US-803).
 */
export function PantryStarterSheet({ open, onOpenChange, kids, foods, planEntries, onAdd }: PantryStarterSheetProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const nameOf = useCallback(
    (food: StarterFood) => t(`pantry.starter.food.${food.key}`, food.name),
    [t]
  );
  const rows = useMemo(
    () => buildStarterRows({ kids, pantryFoods: foods, planEntries, nameOf }),
    [kids, foods, planEntries, nameOf]
  );
  const byCategory = useMemo(
    () => CATEGORY_ORDER.map((cat) => ({ cat, rows: rows.filter((r) => r.food.category === cat) })).filter((g) => g.rows.length > 0),
    [rows]
  );
  // Only what can still be added counts, so a row that became blocked or
  // arrived in the pantry meanwhile drops out of the total.
  const count = useMemo(
    () => rows.filter((r) => selected.has(r.food.key) && isStarterSelectable(r)).length,
    [rows, selected]
  );

  const toggle = (key: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const handleOpenChange = (next: boolean) => {
    if (!next) setSelected(new Set());
    onOpenChange(next);
  };

  const handleAdd = async () => {
    const toAdd = starterSelectionToFoods(rows, selected, nameOf);
    if (toAdd.length === 0) return;
    setSaving(true);
    try {
      const ok = await onAdd(toAdd);
      if (ok) handleOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sprout className="h-5 w-5" aria-hidden="true" />
            {t("pantry.starter.title", "Starter foods")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "pantry.starter.description",
              "Tick what you have. Each one goes in at 1, and none is marked safe: that's for your kids to decide as they try them."
            )}
          </DialogDescription>
        </DialogHeader>

        {kids.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("pantry.starter.noKids", "Add your kids to see which of these fit them.")}
          </p>
        )}

        <div className="space-y-4">
          {byCategory.map(({ cat, rows: catRows }) => {
            const config = getCategoryConfig(cat);
            return (
              <section key={cat} aria-labelledby={`starter-cat-${cat}`}>
                <h3
                  id={`starter-cat-${cat}`}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold",
                    config.bgLight,
                    config.border,
                    config.text
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full", config.dot)} aria-hidden="true" />
                  {t(config.labelKey, config.label)}
                </h3>
                <ul className="mt-1 divide-y">
                  {catRows.map((row) => (
                    <StarterRowItem
                      key={row.food.key}
                      row={row}
                      name={nameOf(row.food)}
                      checked={selected.has(row.food.key)}
                      onCheckedChange={(on) => toggle(row.food.key, on)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("pantry.starter.cancel", "Cancel")}
          </Button>
          <Button onClick={handleAdd} disabled={count === 0 || saving} aria-busy={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 motion-safe:animate-spin" aria-hidden="true" />}
            {count === 0
              ? t("pantry.starter.addNone", "Tick foods to add")
              : t("pantry.starter.add", {
                  defaultValue_one: "Add {{count}} food",
                  defaultValue: "Add {{count}} foods",
                  count,
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StarterRowItem({
  row,
  name,
  checked,
  onCheckedChange,
}: {
  row: StarterRow;
  name: string;
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = `starter-${row.food.key}`;
  const reasonId = `${id}-reason`;
  const selectable = isStarterSelectable(row);
  const blocked = row.blocks.length > 0;

  return (
    <li className={cn("flex items-start gap-3 py-2", blocked && "bg-destructive/5 -mx-1 px-1 rounded-md")}>
      <Checkbox
        id={id}
        checked={selectable && checked}
        disabled={!selectable}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        aria-describedby={blocked || row.inPantry ? reasonId : undefined}
        className="mt-0.5 h-5 w-5"
      />
      <div className="min-w-0 flex-1">
        <Label
          htmlFor={id}
          className={cn("block text-sm font-medium", !selectable && "text-muted-foreground")}
        >
          {name}
        </Label>
        {blocked ? (
          <ul id={reasonId} className="mt-0.5 space-y-0.5">
            {row.blocks.map((b) => {
              const severe = b.severity === "severe";
              const Icon = severe ? AlertOctagon : AlertTriangle;
              return (
                <li
                  key={b.kid.id}
                  className={cn("flex items-center gap-1 text-xs text-destructive", severe && "font-semibold")}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {severe && !b.severityRecorded
                    ? t("pantry.starter.blockedUnrated", {
                        defaultValue: "Allergy (severity not recorded, treated as severe), not for {{name}}: {{allergen}}",
                        name: b.kid.name,
                        allergen: b.allergen,
                      })
                    : severe
                    ? t("pantry.starter.blockedSevere", {
                        defaultValue: "Severe allergy, not for {{name}}: {{allergen}}",
                        name: b.kid.name,
                        allergen: b.allergen,
                      })
                    : t("pantry.starter.blocked", {
                        defaultValue: "Not for {{name}}: {{allergen}}",
                        name: b.kid.name,
                        allergen: b.allergen,
                      })}
                </li>
              );
            })}
          </ul>
        ) : row.inPantry ? (
          <p id={reasonId} className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {t("pantry.starter.inPantry", "Already in your pantry")}
          </p>
        ) : (
          row.fit && <KidFitBadges fit={row.fit} mode="compact" className="mt-1" />
        )}
      </div>
    </li>
  );
}
