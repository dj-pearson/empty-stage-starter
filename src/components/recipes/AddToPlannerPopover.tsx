import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { Recipe, Kid, MealSlot } from "@/types";

interface AddToPlannerPopoverProps {
  recipe: Recipe;
  kids: Kid[];
  activeKidId: string | null;
  onAddToPlan: (entries: { kid_id: string; date: string; meal_slot: MealSlot; food_id: string; result: null }[]) => void;
  trigger?: React.ReactNode;
}

const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack1", label: "Snack" },
];

export function AddToPlannerPopover({
  recipe,
  kids,
  activeKidId,
  onAddToPlan,
  trigger,
}: AddToPlannerPopoverProps) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const defaultDate = now.getHours() >= 16
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    : now;

  const [date, setDate] = useState<Date>(defaultDate);
  const [mealSlot, setMealSlot] = useState<MealSlot>("dinner");
  const [selectedKids, setSelectedKids] = useState<string[]>(
    activeKidId ? [activeKidId] : kids.map((k) => k.id)
  );

  const toggleKid = (kidId: string) => {
    setSelectedKids((prev) =>
      prev.includes(kidId)
        ? prev.filter((id) => id !== kidId)
        : [...prev, kidId]
    );
  };

  const handleAdd = () => {
    if (selectedKids.length === 0) {
      toast.error("Select at least one child");
      return;
    }
    if (recipe.food_ids.length === 0) {
      toast.error("Recipe has no ingredients to plan");
      return;
    }

    const dateStr = date.toISOString().split("T")[0];
    const entries = selectedKids.flatMap((kidId) =>
      recipe.food_ids.map((foodId) => ({
        kid_id: kidId,
        date: dateStr,
        meal_slot: mealSlot,
        food_id: foodId,
        result: null as null,
        recipe_id: recipe.id,
      }))
    );

    onAddToPlan(entries);
    toast.success(`Added "${recipe.name}" to ${mealSlot} on ${dateStr}`, {
      description: `For ${selectedKids.length} kid${selectedKids.length > 1 ? "s" : ""}`,
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <CalendarPlus className="h-4 w-4" />
            Add to Planner
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          <h4 className="font-medium text-sm">Schedule "{recipe.name}"</h4>

          {/* Date picker */}
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && setDate(d)}
            className="rounded-md border"
          />

          {/* Meal slot */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Meal</label>
            <div className="flex gap-1.5 flex-wrap">
              {MEAL_SLOTS.map((slot) => (
                <Button
                  key={slot.value}
                  variant={mealSlot === slot.value ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMealSlot(slot.value)}
                >
                  {slot.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Kid selector */}
          {kids.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">For</label>
              <div className="space-y-1.5">
                {kids.map((kid) => (
                  <label key={kid.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedKids.includes(kid.id)}
                      onCheckedChange={() => toggleKid(kid.id)}
                    />
                    <span className="text-sm">{kid.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <Button onClick={handleAdd} className="w-full" size="sm">
            Add to Plan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
