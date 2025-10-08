import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanEntry, Food } from "@/types";
import { format } from "date-fns";
import { Clock } from "lucide-react";

interface ResultHistoryCardProps {
  entries: PlanEntry[];
  foods: Food[];
}

const resultColors = {
  ate: "bg-safe-food text-white",
  tasted: "bg-secondary text-secondary-foreground",
  refused: "bg-destructive text-destructive-foreground",
};

const mealSlotLabels: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack1: "Snack 1",
  snack2: "Snack 2",
  try_bite: "Try Bite",
};

export function ResultHistoryCard({ entries, foods }: ResultHistoryCardProps) {
  // Sort by date descending
  const sortedEntries = [...entries]
    .filter(e => e.result !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20); // Show last 20 entries

  if (sortedEntries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Meal History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No tracked meals yet. Mark meals in the Planner to see history here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Recent Meal History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {sortedEntries.map(entry => {
            const food = foods.find(f => f.id === entry.food_id);
            if (!food) return null;

            return (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium">{food.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(entry.date + "T00:00:00"), "MMM d, yyyy")} • {mealSlotLabels[entry.meal_slot]}
                  </p>
                  {entry.notes && (
                    <p className="text-xs text-muted-foreground italic mt-1">
                      "{entry.notes}"
                    </p>
                  )}
                </div>
                <Badge className={resultColors[entry.result as keyof typeof resultColors]}>
                  {entry.result}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
