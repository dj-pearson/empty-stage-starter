import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Food, PlanEntry, NutritionData } from "@/types";
import { perServingFromCatalog } from "@/lib/catalogNutrition";
import { indexNutritionByName } from "@/lib/trustedNutritionCatalog";
import { Apple, Droplets, Wheat, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  /**
   * Optional name -> catalog row index. The week grid renders seven of these
   * off one catalog, so it builds the Map once and passes it down; without it
   * each card builds its own.
   */
  nutritionByName?: Map<string, NutritionData>;
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
  nutritionByName,
}: DailyMacrosSummaryProps) {
  const { t } = useTranslation();
  const nutritionIndex = useMemo(
    () => nutritionByName ?? indexNutritionByName(nutritionData),
    [nutritionByName, nutritionData]
  );
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

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
      const food = foodById.get(entry.food_id);
      if (!food) return;

      // US-799: the catalog stores PER 100g and this panel adds up a day, so
      // every row has to come back through the serving mass.
      // perServingFromCatalog returns null when that mass is unknown -- the
      // parser refuses "2 cookies" and "1 cup (240 ml)" rather than guess --
      // and such a row is counted as MISSING here, not as zero.
      //
      // That distinction is the point of the panel. Five unmeasured foods
      // summed as zeroes read "0 calories, 5 items tracked", which looks like
      // an answer; "0 of 5 items have nutrition data" is the truth.
      const nutrition = nutritionIndex.get(food.name.toLowerCase());
      const perServing = perServingFromCatalog(nutrition);

      if (perServing) {
        totalCalories += perServing.calories;
        totalProtein += perServing.protein_g;
        totalCarbs += perServing.carbs_g;
        totalFat += perServing.fat_g;
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
  }, [date, kidId, planEntries, foodById, nutritionIndex]);

  const recommended = calculateRecommendedIntake(kidAge, kidWeight);

  /** Unclamped, so a day at 140% can say "over" instead of reading as 100%. */
  const getPercentage = (actual: number, target: number) =>
    target > 0 ? Math.round((actual / target) * 100) : 0;

  /*
   * US-859: the four bars had no accessible name, so a screen reader announced
   * "progressbar, 50%" four times over with nothing to tell them apart. The
   * visible label sits in a sibling row, which a sighted reader pairs up by
   * position and nothing else does.
   *
   * aria-valuetext as well as the label because the value these bars carry is a
   * PERCENTAGE OF A RECOMMENDATION, and "50%" on its own is the one number a
   * parent cannot act on -- 14 of 28 grams is.
   *
   * The colour goes on the indicator, not the track. It used to be a class on
   * the Progress root, which painted the whole track and left the bar itself
   * the default primary -- a full-width yellow strip for a day at 10%.
   */
  const getIndicatorClass = (percentage: number) => {
    if (percentage < 50) return "[&>div]:bg-muted-foreground/50";
    if (percentage < 80) return "[&>div]:bg-primary";
    if (percentage <= 100) return "[&>div]:bg-success";
    return "[&>div]:bg-warning";
  };

  if (macros.totalItems === 0) {
    // A quiet cell rather than null: in the week grid each summary sits in a
    // grid-cols-7 track, and a missing card shifted every later day's
    // nutrition under the wrong column.
    return (
      <div
        className="w-full min-h-[3rem] rounded-lg border border-dashed border-border/60 bg-muted/20 flex items-center justify-center px-2 text-center text-xs text-muted-foreground"
        data-testid="daily-macros-empty"
      >
        {t("planner.macros.empty", { defaultValue: "No meals planned" })}
      </div>
    );
  }

  const rows: {
    key: keyof typeof MACRO_UNITS;
    label: string;
    icon: typeof Zap;
    actual: number;
    target: number;
    unit: string;
  }[] = [
    { key: "calories", label: t("planner.macros.calories", { defaultValue: "Calories" }), icon: Zap, actual: macros.calories, target: recommended.calories, unit: " kcal" },
    { key: "protein", label: t("planner.macros.protein", { defaultValue: "Protein" }), icon: Apple, actual: macros.protein, target: recommended.protein, unit: "g" },
    { key: "carbs", label: t("planner.macros.carbs", { defaultValue: "Carbs" }), icon: Wheat, actual: macros.carbs, target: recommended.carbs, unit: "g" },
    { key: "fat", label: t("planner.macros.fat", { defaultValue: "Fat" }), icon: Droplets, actual: macros.fat, target: recommended.fat, unit: "g" },
  ];

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {t("planner.macros.title", { defaultValue: "Daily Nutrition - {{name}}", name: kidName })}
          </CardTitle>
          {macros.itemsWithData < macros.totalItems && (
            <Badge variant="outline" className="text-xs">
              {t("planner.macros.tracked", {
                defaultValue: "{{count}}/{{total}} items tracked",
                count: macros.itemsWithData,
                total: macros.totalItems,
              })}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map(({ key, label, icon: Icon, actual, target, unit }) => {
          const pct = getPercentage(actual, target);
          const over = pct > 100;
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium">{label}</span>
                </div>
                <span className="text-muted-foreground">
                  {actual}{unit} / {target}{unit}
                  {over && (
                    <span className="ml-1 font-medium text-foreground">
                      {t("planner.macros.over", { defaultValue: "({{pct}}%, over)", pct })}
                    </span>
                  )}
                </span>
              </div>
              <Progress
                value={Math.min(pct, 100)}
                className={cn("h-2", getIndicatorClass(pct))}
                aria-label={label}
                aria-valuetext={`${actual} of ${target} ${MACRO_UNITS[key]}${over ? `, ${pct}%, over` : ""}`}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
