import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Food, PlanEntry, NutritionData } from "@/types";
import { Apple, Droplets, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface DailyMacrosSummaryProps {
  date: string;
  kidId: string;
  kidName: string;
  kidAge?: number;
  kidWeight?: number;
  planEntries: PlanEntry[];
  foods: Food[];
  nutritionData: NutritionData[];
}

// Calculate recommended daily intake based on age and weight
const calculateRecommendedIntake = (age?: number, weight?: number) => {
  // Default recommendations (can be refined based on questionnaire data)
  if (!age) {
    return { calories: 1600, protein: 50, carbs: 220, fat: 55 };
  }

  // Rough estimation based on age (can be enhanced with more precise formulas)
  let calories = 1000 + (age * 100); // Basic estimate
  if (weight) {
    // More accurate calculation with weight (kg)
    // Rough estimate: 1000 + (100 × age) for 2-10 year olds
    calories = Math.round(1000 + (100 * Math.min(age, 10)));
  }

  // Macros based on 50-30-20 ratio (carbs-fat-protein)
  const protein = Math.round((calories * 0.20) / 4); // 4 cal per gram
  const carbs = Math.round((calories * 0.50) / 4); // 4 cal per gram
  const fat = Math.round((calories * 0.30) / 9); // 9 cal per gram

  return { calories, protein, carbs, fat };
};

/** Spoken units, so aria-valuetext reads as a quantity rather than a bare number. */
const MACRO_UNITS = {
  calories: "kilocalories",
  protein: "grams",
  carbs: "grams",
  fat: "grams",
} as const;

export function DailyMacrosSummary({
  date,
  kidId,
  kidName,
  kidAge,
  kidWeight,
  planEntries,
  foods,
  nutritionData,
}: DailyMacrosSummaryProps) {
  const macros = useMemo(() => {
    const dayEntries = planEntries.filter(
      e => e.date === date && e.kid_id === kidId
    );

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let itemsWithData = 0;

    dayEntries.forEach(entry => {
      const food = foods.find(f => f.id === entry.food_id);
      if (!food) return;

      // Try to find nutrition data for this food
      const nutrition = nutritionData.find(
        n => n.name.toLowerCase() === food.name.toLowerCase()
      );

      if (nutrition) {
        totalCalories += nutrition.calories || 0;
        totalProtein += parseFloat(nutrition.protein_g) || 0;
        totalCarbs += parseFloat(nutrition.carbs_g) || 0;
        totalFat += parseFloat(nutrition.fat_g) || 0;
        itemsWithData++;
      }
    });

    return {
      calories: Math.round(totalCalories),
      protein: Math.round(totalProtein),
      carbs: Math.round(totalCarbs),
      fat: Math.round(totalFat),
      totalItems: dayEntries.length,
      itemsWithData,
    };
  }, [date, kidId, planEntries, foods, nutritionData]);

  const recommended = calculateRecommendedIntake(kidAge, kidWeight);

  const getPercentage = (actual: number, target: number) => {
    return Math.min(Math.round((actual / target) * 100), 100);
  };

  /*
   * US-859: the four bars had no accessible name, so a screen reader announced
   * "progressbar, 50%" four times over with nothing to tell them apart. The
   * visible label sits in a sibling row, which a sighted reader pairs up by
   * position and nothing else does.
   *
   * aria-valuetext as well as the label because the value these bars carry is a
   * PERCENTAGE OF A RECOMMENDATION, and "50%" on its own is the one number a
   * parent cannot act on -- 14 of 28 grams is.
   */
  const getProgressColor = (percentage: number) => {
    if (percentage < 50) return "bg-yellow-500";
    if (percentage < 80) return "bg-blue-500";
    if (percentage <= 100) return "bg-green-500";
    return "bg-orange-500";
  };

  if (macros.totalItems === 0) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Daily Nutrition - {kidName}
          </CardTitle>
          {macros.itemsWithData < macros.totalItems && (
            <Badge variant="outline" className="text-xs">
              {macros.itemsWithData}/{macros.totalItems} items tracked
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Calories */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-600" />
              <span className="font-medium">Calories</span>
            </div>
            <span className="text-muted-foreground">
              {macros.calories} / {recommended.calories} kcal
            </span>
          </div>
          <Progress 
            value={getPercentage(macros.calories, recommended.calories)} 
            className={cn("h-2", getProgressColor(getPercentage(macros.calories, recommended.calories)))}
            aria-label="Calories"
            aria-valuetext={`${macros.calories} of ${recommended.calories} ${MACRO_UNITS.calories}`}
          />
        </div>

        {/* Protein */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Apple className="h-4 w-4 text-red-600" />
              <span className="font-medium">Protein</span>
            </div>
            <span className="text-muted-foreground">
              {macros.protein}g / {recommended.protein}g
            </span>
          </div>
          <Progress 
            value={getPercentage(macros.protein, recommended.protein)} 
            className={cn("h-2", getProgressColor(getPercentage(macros.protein, recommended.protein)))}
            aria-label="Protein"
            aria-valuetext={`${macros.protein} of ${recommended.protein} ${MACRO_UNITS.protein}`}
          />
        </div>

        {/* Carbs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-blue-600" />
              <span className="font-medium">Carbs</span>
            </div>
            <span className="text-muted-foreground">
              {macros.carbs}g / {recommended.carbs}g
            </span>
          </div>
          <Progress 
            value={getPercentage(macros.carbs, recommended.carbs)} 
            className={cn("h-2", getProgressColor(getPercentage(macros.carbs, recommended.carbs)))}
            aria-label="Carbs"
            aria-valuetext={`${macros.carbs} of ${recommended.carbs} ${MACRO_UNITS.carbs}`}
          />
        </div>

        {/* Fat */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-orange-600" />
              <span className="font-medium">Fat</span>
            </div>
            <span className="text-muted-foreground">
              {macros.fat}g / {recommended.fat}g
            </span>
          </div>
          <Progress 
            value={getPercentage(macros.fat, recommended.fat)} 
            className={cn("h-2", getProgressColor(getPercentage(macros.fat, recommended.fat)))}
            aria-label="Fat"
            aria-valuetext={`${macros.fat} of ${recommended.fat} ${MACRO_UNITS.fat}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
