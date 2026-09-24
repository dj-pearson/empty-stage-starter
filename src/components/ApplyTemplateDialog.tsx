import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KidPhoto } from "@/components/KidPhoto";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Loader2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { Kid } from "@/types";
import { format, addDays, startOfWeek } from "date-fns";
import { calculateAge, cn } from "@/lib/utils";
import { userFacingError } from "@/lib/networkFailure";
import { PLANNER_WEEK_STARTS_ON } from "@/lib/date-utils";
import { applyTemplate, type MealPlanTemplate } from "@/lib/mealPlanTemplatesApi";
import "@/i18n/appLocale";

type ApplyMode = "merge" | "replace";

/** The fields this dialog reads. A full MealPlanTemplate satisfies it. */
export type ApplyableTemplate = Pick<MealPlanTemplate, "id" | "name" | "description" | "meal_plan_template_entries">;

interface ApplyTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ApplyableTemplate | null;
  kids: Kid[];
  /**
   * The kid the planner is showing. Preselected on open; everyone is
   * preselected when it is absent. Applying a week to every child by
   * default used to overwrite siblings' plans the parent never looked at.
   */
  activeKidId?: string;
  /** Week to preselect, usually the planner's visible week. Snapped to the planner's week start. */
  defaultStartDate?: Date;
  /** Called with the applied week's start, 'YYYY-MM-DD'. */
  onTemplateApplied?: (startDate: string) => void;
}

const weekStartOf = (d: Date) => startOfWeek(d, { weekStartsOn: PLANNER_WEEK_STARTS_ON });

export function ApplyTemplateDialog({
  open,
  onOpenChange,
  template,
  kids,
  activeKidId,
  defaultStartDate,
  onTemplateApplied,
}: ApplyTemplateDialogProps) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState<Date>(() => weekStartOf(defaultStartDate ?? new Date()));
  // US-716: what to do with meals already planned for the target week.
  const [mode, setMode] = useState<ApplyMode>("merge");
  const [selectedKidIds, setSelectedKidIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Every open starts fresh: the last session's kids, week and "replace" are
  // not a default anyone chose for this one.
  const defaultStartKey = defaultStartDate ? format(defaultStartDate, "yyyy-MM-dd") : "";
  const kidIdsKey = kids.map((k) => k.id).join(",");
  useEffect(() => {
    if (!open) return;
    setStartDate(weekStartOf(defaultStartDate ?? new Date()));
    setMode("merge");
    const active = activeKidId && kids.some((k) => k.id === activeKidId) ? [activeKidId] : kids.map((k) => k.id);
    setSelectedKidIds(active);
    // Keyed on the open transition and on the inputs' identities, not their references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultStartKey, activeKidId, kidIdsKey]);

  const handleApply = async () => {
    if (!template) return;

    if (selectedKidIds.length === 0) {
      toast.error(t("planner.templates.apply.pickChild", { defaultValue: "Please select at least one child" }));
      return;
    }

    setIsLoading(true);
    const startDateStr = format(startDate, "yyyy-MM-dd");

    try {
      const { data, error } = await applyTemplate({
        templateId: template.id,
        startDate: startDateStr,
        kidIds: selectedKidIds,
        mode,
      });
      if (!data) throw error ?? new Error("Failed to apply template");

      toast.success(t("planner.templates.apply.applied", { defaultValue: "Template applied" }), {
        description:
          data.skippedCount > 0
            ? t("planner.templates.apply.appliedWithSkips", {
                defaultValue: "{{count}} meals added ({{skipped}} skipped for allergies)",
                count: data.entriesCreated,
                skipped: data.skippedCount,
              })
            : t("planner.templates.apply.appliedCount", {
                defaultValue: "{{count}} meals added to your calendar",
                count: data.entriesCreated,
              }),
      });

      onOpenChange(false);
      onTemplateApplied?.(startDateStr);
    } catch (error) {
      logger.error("Error applying template:", error);
      toast.error(
        userFacingError(error, t("planner.templates.apply.failed", { defaultValue: "Failed to apply template" }))
      );
    } finally {
      setIsLoading(false);
    }
  };

  const toggleKid = (kidId: string, checked: boolean) => {
    setSelectedKidIds((prev) =>
      checked ? (prev.includes(kidId) ? prev : [...prev, kidId]) : prev.filter((id) => id !== kidId)
    );
  };

  if (!template) return null;

  const mealCount = template.meal_plan_template_entries?.length || 0;
  const endDate = addDays(startDate, 6);
  const today = new Date(new Date().setHours(0, 0, 0, 0));

  const modes: { value: ApplyMode; label: string; hint: string }[] = [
    {
      value: "merge",
      label: t("planner.templates.apply.merge", { defaultValue: "Merge" }),
      hint: t("planner.templates.apply.mergeHint", { defaultValue: "Keep them" }),
    },
    {
      value: "replace",
      label: t("planner.templates.apply.replace", { defaultValue: "Replace" }),
      hint: t("planner.templates.apply.replaceHint", { defaultValue: "Clear the week first" }),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[85dvh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>
            {t("planner.templates.apply.title", { defaultValue: "Apply template: {{name}}", name: template.name })}
          </DialogTitle>
          <DialogDescription>
            {template.description ||
              t("planner.templates.apply.description", { defaultValue: "Choose when to apply this meal plan template" })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 space-y-4">
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm">
              {t("planner.templates.apply.mealCount", {
                defaultValue: "This template contains {{count}} meals across 7 days",
                count: mealCount,
              })}
            </span>
          </div>

          <div className="space-y-2">
            <Label>{t("planner.templates.apply.weekLabel", { defaultValue: "Week" })}</Label>
            <div className="border rounded-lg p-3">
              <Calendar
                mode="single"
                selected={startDate}
                defaultMonth={startDate}
                weekStartsOn={PLANNER_WEEK_STARTS_ON}
                onSelect={(date) => date && setStartDate(weekStartOf(date))}
                className="rounded-md"
                disabled={(date) => date < today}
              />
            </div>
            <p className="text-xs text-muted-foreground" data-testid="apply-template-range">
              {t("planner.templates.apply.range", {
                defaultValue: "Applied from {{from}} to {{to}}",
                from: format(startDate, "EEE MMM d"),
                to: format(endDate, "EEE MMM d, yyyy"),
              })}
            </p>
          </div>

          {/* US-716: what happens to meals already planned for that week. */}
          <div className="space-y-2">
            <Label id="apply-template-mode-label">
              {t("planner.templates.apply.modeLabel", { defaultValue: "Meals already planned that week" })}
            </Label>
            <div role="radiogroup" aria-labelledby="apply-template-mode-label" className="grid grid-cols-2 gap-2">
              {modes.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.value}
                  tabIndex={mode === m.value ? 0 : -1}
                  onClick={() => setMode(m.value)}
                  onKeyDown={(e) => {
                    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
                      e.preventDefault();
                      setMode(m.value === "merge" ? "replace" : "merge");
                    }
                  }}
                  className={cn(
                    "min-h-11 rounded-md border px-3 py-2 text-left flex flex-col items-start gap-0.5 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mode === m.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent"
                  )}
                >
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="text-xs opacity-80">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {kids.length > 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t("planner.templates.apply.kidsLabel", { defaultValue: "Apply to children" })}</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedKidIds(kids.map((k) => k.id))} className="h-8 text-xs">
                    {t("planner.templates.apply.selectAll", { defaultValue: "Select all" })}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedKidIds([])} className="h-8 text-xs">
                    {t("planner.templates.apply.clear", { defaultValue: "Clear" })}
                  </Button>
                </div>
              </div>

              <div className="space-y-1 border rounded-lg p-2">
                {kids.map((kid) => {
                  const age = calculateAge(kid.date_of_birth);
                  return (
                    <div key={kid.id} className="flex min-h-11 items-center space-x-2 px-1">
                      <Checkbox
                        id={`kid-${kid.id}`}
                        checked={selectedKidIds.includes(kid.id)}
                        onCheckedChange={(checked) => toggleKid(kid.id, checked === true)}
                      />
                      <Label htmlFor={`kid-${kid.id}`} className="flex-1 min-h-11 cursor-pointer flex items-center gap-2">
                        {kid.profile_picture_url ? (
                          <KidPhoto src={kid.profile_picture_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <div
                            className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold"
                            aria-hidden="true"
                          >
                            {kid.name.charAt(0)}
                          </div>
                        )}
                        <span>{kid.name}</span>
                        {age !== null && (
                          <Badge variant="secondary" className="text-xs">
                            {age}y
                          </Badge>
                        )}
                      </Label>
                    </div>
                  );
                })}
              </div>

              {selectedKidIds.length === 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <AlertDescription>
                    {t("planner.templates.apply.pickChild", { defaultValue: "Please select at least one child" })}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="text-xs" data-testid="apply-template-mode-warning">
              {mode === "replace"
                ? t("planner.templates.apply.replaceWarning", {
                    defaultValue:
                      "Replace removes every meal already planned from {{from}} to {{to}} for the selected children, then adds the template.",
                    from: format(startDate, "MMM d"),
                    to: format(endDate, "MMM d"),
                  })
                : t("planner.templates.apply.mergeWarning", {
                    defaultValue:
                      "Merge adds the template's meals. Meals already planned on those days stay where they are.",
                  })}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="sticky bottom-0 border-t bg-background p-4 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button onClick={handleApply} disabled={isLoading || selectedKidIds.length === 0}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {t("planner.templates.apply.applying", { defaultValue: "Applying..." })}
              </>
            ) : (
              <>
                <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("planner.templates.apply.submit", { defaultValue: "Apply template" })}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
