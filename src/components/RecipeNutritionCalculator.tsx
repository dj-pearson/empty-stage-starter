import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";

interface NutritionSummary {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

interface RecipeNutritionCalculatorProps {
  foodIds: string[];
  servings?: number;
}

export function RecipeNutritionCalculator({ foodIds, servings = 1 }: RecipeNutritionCalculatorProps) {
  const { foods } = useApp();

  const nutrition = useMemo((): NutritionSummary => {
    const totals: NutritionSummary = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

    foodIds.forEach((id) => {
      const food = foods.find((f) => f.id === id);
      if (!food?.nutrition_info) return;

      const info = typeof food.nutrition_info === "string"
        ? JSON.parse(food.nutrition_info)
        : food.nutrition_info;

      totals.calories += Number(info.calories) || 0;
      totals.protein += Number(info.protein) || 0;
      totals.carbs += Number(info.carbs || info.carbohydrates) || 0;
      totals.fat += Number(info.fat) || 0;
      totals.fiber += Number(info.fiber) || 0;
    });

    if (servings > 1) {
      totals.calories = Math.round(totals.calories / servings);
      totals.protein = Math.round((totals.protein / servings) * 10) / 10;
      totals.carbs = Math.round((totals.carbs / servings) * 10) / 10;
      totals.fat = Math.round((totals.fat / servings) * 10) / 10;
      totals.fiber = Math.round((totals.fiber / servings) * 10) / 10;
    }

    return totals;
  }, [foodIds, foods, servings]);

  const hasData = nutrition.calories > 0 || nutrition.protein > 0;

  if (!hasData) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Add foods with nutrition data to see totals
        </CardContent>
      </Card>
    );
  }

  const items = [
    { label: "Calories", value: `${Math.round(nutrition.calories)}`, unit: "kcal" },
    { label: "Protein", value: `${nutrition.protein}`, unit: "g" },
    { label: "Carbs", value: `${nutrition.carbs}`, unit: "g" },
    { label: "Fat", value: `${nutrition.fat}`, unit: "g" },
    { label: "Fiber", value: `${nutrition.fiber}`, unit: "g" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Nutrition {servings > 1 ? `(per serving, ${servings} total)` : "(total)"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-2 text-center">
          {items.map((item) => (
            <div key={item.label}>
              <p className="text-lg font-bold">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.unit}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
