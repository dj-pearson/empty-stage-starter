import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/contexts/AppContext';
import { Clock, CheckCircle2, Circle, Sparkles, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday } from 'date-fns';

interface TodayMealsProps {
  onLogMeal?: (mealSlot: string, planEntryId: string) => void;
}

const MEAL_SLOTS = [
  { id: 'breakfast', label: 'Breakfast', time: '7:30 AM', icon: '🍳' },
  { id: 'lunch', label: 'Lunch', time: '12:00 PM', icon: '🥪' },
  { id: 'dinner', label: 'Dinner', time: '6:00 PM', icon: '🍽️' },
  { id: 'try_bite', label: 'Try Bite', time: 'Any time', icon: '✨' },
];

export function TodayMeals({ onLogMeal }: TodayMealsProps) {
  const { planEntries, foods, activeKidId, kids } = useApp();

  const activeKid = kids.find(k => k.id === activeKidId);

  // Get today's meals for the active kid
  const todaysMeals = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return MEAL_SLOTS.map((slot) => {
      const entry = planEntries.find(
        (p) =>
          p.kid_id === activeKidId &&
          p.meal_slot === slot.id &&
          isToday(new Date(p.date))
      );

      if (!entry) {
        return {
          ...slot,
          status: 'not_planned',
          foods: [],
          entry: null,
        };
      }

      const mealFoods = foods.filter((f) => entry.food_ids?.includes(f.id));

      // Determine status based on result or time
      let status = 'upcoming';
      if (entry.result === 'ate') status = 'completed';
      else if (entry.result === 'tasted') status = 'partial';
      else if (entry.result === 'refused') status = 'refused';
      else {
        // Check if meal time has passed
        const now = new Date();
        const currentHour = now.getHours();
        const mealHour = parseInt(slot.time.split(':')[0]);
        if (currentHour > mealHour) status = 'ready';
      }

      return {
        ...slot,
        status,
        foods: mealFoods,
        entry,
      };
    });
  }, [planEntries, foods, activeKidId]);

  const hasMeals = todaysMeals.some((m) => m.foods.length > 0);

  const getMealStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Ate
          </Badge>
        );
      case 'partial':
        return (
          <Badge className="bg-yellow-500 hover:bg-yellow-600">
            <Circle className="h-3 w-3 mr-1" />
            Tasted
          </Badge>
        );
      case 'refused':
        return (
          <Badge variant="destructive">
            <Circle className="h-3 w-3 mr-1" />
            Refused
          </Badge>
        );
      case 'ready':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Ready to log
          </Badge>
        );
      case 'upcoming':
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Upcoming
          </Badge>
        );
      default:
        return null;
    }
  };

  if (!hasMeals) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Calendar className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No meals planned for today</h3>
          <p className="text-muted-foreground mb-4">
            Get started by creating your first meal plan!
          </p>
          <Button onClick={() => window.location.href = '/dashboard/planner'}>
            Plan Today's Meals
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Today's Meals
          {activeKid && (
            <span className="text-sm font-normal text-muted-foreground ml-auto">
              for {activeKid.name}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {todaysMeals.map((meal) => {
          if (meal.foods.length === 0) return null;

          const isTryBite = meal.id === 'try_bite';

          return (
            <div
              key={meal.id}
              className={cn(
                'flex items-start gap-3 p-4 rounded-lg border transition-colors',
                meal.status === 'completed' && 'bg-green-50 dark:bg-green-950/20 border-green-200',
                meal.status === 'partial' && 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200',
                meal.status === 'refused' && 'bg-orange-50 dark:bg-orange-950/20 border-orange-200',
                meal.status === 'ready' && 'bg-blue-50 dark:bg-blue-950/20 border-blue-200',
                isTryBite && 'bg-purple-50 dark:bg-purple-950/20 border-purple-200'
              )}
            >
              {/* Meal Icon */}
              <div className="text-2xl mt-1">{meal.icon}</div>

              {/* Meal Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold">{meal.label}</h4>
                  {getMealStatusBadge(meal.status)}
                </div>

                {/* Time */}
                <p className="text-xs text-muted-foreground mb-2">
                  {meal.time}
                </p>

                {/* Foods */}
                <div className="flex flex-wrap gap-1">
                  {meal.foods.map((food) => (
                    <Badge key={food.id} variant="secondary" className="text-xs">
                      {food.name}
                    </Badge>
                  ))}
                </div>

                {/* Try Bite Encouragement */}
                {isTryBite && meal.status !== 'completed' && (
                  <p className="text-xs text-purple-700 dark:text-purple-300 mt-2 italic">
                    Today's adventure: {meal.foods[0]?.name}!
                  </p>
                )}
              </div>

              {/* Log Button */}
              {meal.entry && meal.status !== 'completed' && meal.status !== 'partial' && meal.status !== 'refused' && (
                <Button
                  size="sm"
                  onClick={() => onLogMeal?.(meal.id, meal.entry!.id)}
                  className="shrink-0"
                >
                  Log Result
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
