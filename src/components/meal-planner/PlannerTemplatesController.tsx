import { lazy, Suspense, useCallback, useState } from "react";
import { addDays, format } from "date-fns";
import type { Kid } from "@/types";
import type { MealPlanTemplate } from "@/lib/mealPlanTemplatesApi";

/**
 * One owner for the planner's three template dialogs (contract C6).
 *
 * The desktop grid used to mount Save, Gallery and Apply inside every
 * GSAPCalendarMealPlanner, so family view with four kids carried twelve
 * closed dialogs, and the mobile branch passed props none of the dialogs
 * accepted (weekStart/onApply), which is why "Save as template" did nothing
 * on a phone. The page renders this once; each dialog is code-split and only
 * mounted while it is open.
 */
const SaveMealPlanTemplateDialog = lazy(() =>
  import("@/components/SaveMealPlanTemplateDialog").then((m) => ({ default: m.SaveMealPlanTemplateDialog }))
);
const MealPlanTemplateGallery = lazy(() =>
  import("@/components/MealPlanTemplateGallery").then((m) => ({ default: m.MealPlanTemplateGallery }))
);
const ApplyTemplateDialog = lazy(() =>
  import("@/components/ApplyTemplateDialog").then((m) => ({ default: m.ApplyTemplateDialog }))
);

export interface PlannerTemplatesControllerProps {
  kids: Kid[];
  activeKidId: string | null | undefined;
  /** First day of the week on screen. */
  weekStart: Date;
  saveOpen: boolean;
  onSaveOpenChange: (open: boolean) => void;
  galleryOpen: boolean;
  onGalleryOpenChange: (open: boolean) => void;
  /** A template was applied starting on this 'YYYY-MM-DD'. The page refreshes or navigates there. */
  onApplied: (startDate: string) => void;
}

export function PlannerTemplatesController({
  kids,
  activeKidId,
  weekStart,
  saveOpen,
  onSaveOpenChange,
  galleryOpen,
  onGalleryOpenChange,
  onApplied,
}: PlannerTemplatesControllerProps) {
  const [selected, setSelected] = useState<MealPlanTemplate | null>(null);

  const handleSelect = useCallback((template: MealPlanTemplate) => {
    setSelected(template);
  }, []);

  const handleApplyOpenChange = useCallback((open: boolean) => {
    if (!open) setSelected(null);
  }, []);

  return (
    <Suspense fallback={null}>
      {saveOpen && (
        <SaveMealPlanTemplateDialog
          open={saveOpen}
          onOpenChange={onSaveOpenChange}
          startDate={format(weekStart, "yyyy-MM-dd")}
          endDate={format(addDays(weekStart, 6), "yyyy-MM-dd")}
          kidId={activeKidId ?? undefined}
        />
      )}
      {galleryOpen && (
        <MealPlanTemplateGallery
          open={galleryOpen}
          onOpenChange={onGalleryOpenChange}
          onSelectTemplate={handleSelect}
        />
      )}
      {selected && (
        <ApplyTemplateDialog
          open={selected !== null}
          onOpenChange={handleApplyOpenChange}
          template={selected}
          kids={kids}
          activeKidId={activeKidId ?? undefined}
          defaultStartDate={weekStart}
          onTemplateApplied={onApplied}
        />
      )}
    </Suspense>
  );
}
