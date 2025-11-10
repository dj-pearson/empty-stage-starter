import { useState } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Calendar as CalendarIcon,
  Users,
  Loader2,
  AlertTriangle,
  Check,
  Clock
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Kid } from "@/types";
import { format, addDays, startOfWeek } from "date-fns";

interface MealPlanTemplate {
  id: string;
  name: string;
  description: string | null;
  meal_plan_template_entries: any[];
}

interface ApplyTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: MealPlanTemplate | null;
  kids: Kid[];
  onTemplateApplied?: () => void;
}

export function ApplyTemplateDialog({
  open,
  onOpenChange,
  template,
  kids,
  onTemplateApplied,
}: ApplyTemplateDialogProps) {
  const [startDate, setStartDate] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedKidIds, setSelectedKidIds] = useState<string[]>(kids.map(k => k.id));
  const [isLoading, setIsLoading] = useState(false);

  const handleApply = async () => {
    if (!template) return;

    if (selectedKidIds.length === 0) {
      toast.error("Please select at least one child");
      return;
    }

    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in");
        setIsLoading(false);
        return;
      }

      // Format start date
      const startDateStr = format(startDate, 'yyyy-MM-dd');

      // Call Edge Function to apply template
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-meal-plan-templates`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'apply',
            templateId: template.id,
            startDate: startDateStr,
            kidIds: selectedKidIds,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to apply template');
      }

      toast.success(
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Check className="h-4 w-4" />
            <span className="font-semibold">Template applied!</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {data.entriesCreated} meals added to your calendar
          </p>
        </div>
      );

      onOpenChange(false);

      if (onTemplateApplied) {
        onTemplateApplied();
      }
    } catch (error) {
      console.error('Error applying template:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to apply template');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleKid = (kidId: string) => {
    setSelectedKidIds((prev) =>
      prev.includes(kidId)
        ? prev.filter((id) => id !== kidId)
        : [...prev, kidId]
    );
  };

  const selectAllKids = () => {
    setSelectedKidIds(kids.map(k => k.id));
  };

  const deselectAllKids = () => {
    setSelectedKidIds([]);
  };

  if (!template) return null;

  const mealCount = template.meal_plan_template_entries?.length || 0;
  const endDate = addDays(startDate, 6);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Apply Template: {template.name}</DialogTitle>
          <DialogDescription>
            {template.description || "Choose when to apply this meal plan template"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Info */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              This template contains <strong>{mealCount} meals</strong> across 7 days
            </span>
          </div>

          {/* Start Date Picker */}
          <div className="space-y-2">
            <Label>Week Start Date</Label>
            <div className="border rounded-lg p-3">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => date && setStartDate(startOfWeek(date, { weekStartsOn: 1 }))}
                className="rounded-md"
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Template will be applied from{" "}
              <strong>{format(startDate, 'MMM d')}</strong> to{" "}
              <strong>{format(endDate, 'MMM d, yyyy')}</strong>
            </p>
          </div>

          {/* Kid Selection */}
          {kids.length > 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Apply to Children</Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllKids}
                    className="h-7 text-xs"
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={deselectAllKids}
                    className="h-7 text-xs"
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="space-y-2 border rounded-lg p-3">
                {kids.map((kid) => (
                  <div
                    key={kid.id}
                    className="flex items-center space-x-2 cursor-pointer"
                    onClick={() => toggleKid(kid.id)}
                  >
                    <Checkbox
                      id={`kid-${kid.id}`}
                      checked={selectedKidIds.includes(kid.id)}
                      onCheckedChange={() => toggleKid(kid.id)}
                    />
                    <Label
                      htmlFor={`kid-${kid.id}`}
                      className="flex-1 cursor-pointer flex items-center gap-2"
                    >
                      {kid.profile_picture_url ? (
                        <img
                          src={kid.profile_picture_url}
                          alt={kid.name}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold">
                          {kid.name.charAt(0)}
                        </div>
                      )}
                      <span>{kid.name}</span>
                      {kid.age && (
                        <Badge variant="secondary" className="text-xs">
                          {kid.age}y
                        </Badge>
                      )}
                    </Label>
                  </div>
                ))}
              </div>

              {selectedKidIds.length === 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Please select at least one child
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Warning about existing meals */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Note:</strong> Applying this template will add meals to your calendar.
              Existing meals on the selected dates will remain unchanged.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={isLoading || selectedKidIds.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <CalendarIcon className="mr-2 h-4 w-4" />
                Apply Template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
