import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/contexts/AppContext';
import {
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Brain,
  Target,
  Clock,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, getDay } from 'date-fns';

type InsightType = 'positive' | 'warning' | 'tip' | 'pattern' | 'recommendation';

interface Insight {
  type: InsightType;
  title: string;
  message: string;
  action?: string;
  priority: 'high' | 'medium' | 'low';
}

export function SmartInsights() {
  const { planEntries, foods, activeKidId, kids } = useApp();

  const activeKid = kids.find(k => k.id === activeKidId);

  // Generate insights based on data patterns
  const insights = useMemo((): Insight[] => {
    const kidEntries = planEntries.filter(e => e.kid_id === activeKidId && e.result);
    if (kidEntries.length < 5) {
      return [
        {
          type: 'tip',
          title: 'Start Tracking',
          message:
            'Track at least 5 meals to start seeing personalized insights and patterns.',
          priority: 'high',
        },
      ];
    }

    const insights: Insight[] = [];

    // Analyze meal success by day of week
    const mealsByDay: { [key: number]: { total: number; ate: number } } = {};
    kidEntries.forEach(entry => {
      const day = getDay(parseISO(entry.date));
      if (!mealsByDay[day]) {
        mealsByDay[day] = { total: 0, ate: 0 };
      }
      mealsByDay[day].total++;
      if (entry.result === 'ate') {
        mealsByDay[day].ate++;
      }
    });

    // Find best and worst days
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayStats = Object.entries(mealsByDay).map(([day, stats]) => ({
      day: parseInt(day),
      name: dayNames[parseInt(day)],
      rate: stats.total > 0 ? (stats.ate / stats.total) * 100 : 0,
      total: stats.total,
    })).filter(d => d.total >= 2); // Only days with enough data

    if (dayStats.length > 0) {
      const bestDay = dayStats.reduce((best, curr) =>
        curr.rate > best.rate ? curr : best
      );
      const worstDay = dayStats.reduce((worst, curr) =>
        curr.rate < worst.rate ? curr : worst
      );

      if (bestDay.rate >= 70) {
        insights.push({
          type: 'pattern',
          title: 'Best Day Pattern',
          message: `${activeKid?.name} eats better on ${bestDay.name}s (${Math.round(bestDay.rate)}% success rate). Consider introducing new foods on this day.`,
          action: 'Schedule try bites on ' + bestDay.name,
          priority: 'medium',
        });
      }

      if (worstDay.rate < 50 && worstDay.total >= 3) {
        insights.push({
          type: 'warning',
          title: 'Challenging Day',
          message: `${worstDay.name}s seem more challenging (${Math.round(worstDay.rate)}% success rate). Focus on familiar favorites on this day.`,
          priority: 'medium',
        });
      }
    }

    // Analyze meal slot success
    const mealSlots: { [key: string]: { total: number; ate: number } } = {};
    kidEntries.forEach(entry => {
      const slot = entry.meal_slot;
      if (!mealSlots[slot]) {
        mealSlots[slot] = { total: 0, ate: 0 };
      }
      mealSlots[slot].total++;
      if (entry.result === 'ate') {
        mealSlots[slot].ate++;
      }
    });

    const slotStats = Object.entries(mealSlots)
      .map(([slot, stats]) => ({
        slot,
        rate: (stats.ate / stats.total) * 100,
        total: stats.total,
      }))
      .filter(s => s.total >= 3);

    if (slotStats.length > 0) {
      const bestSlot = slotStats.reduce((best, curr) =>
        curr.rate > best.rate ? curr : best
      );

      if (bestSlot.rate >= 75) {
        const slotName = bestSlot.slot === 'try_bite' ? 'try bite time' :
                        bestSlot.slot.replace('_', ' ');
        insights.push({
          type: 'positive',
          title: 'Perfect Timing',
          message: `${activeKid?.name} does great at ${slotName} (${Math.round(bestSlot.rate)}% success). Keep this timing!`,
          priority: 'low',
        });
      }
    }

    // Analyze food categories
    const categorySuccess: { [key: string]: { total: number; success: number } } = {};
    kidEntries.forEach(entry => {
      entry.food_ids?.forEach(foodId => {
        const food = foods.find(f => f.id === foodId);
        if (food && food.category) {
          if (!categorySuccess[food.category]) {
            categorySuccess[food.category] = { total: 0, success: 0 };
          }
          categorySuccess[food.category].total++;
          if (entry.result === 'ate' || entry.result === 'tasted') {
            categorySuccess[food.category].success++;
          }
        }
      });
    });

    const categoryStats = Object.entries(categorySuccess)
      .map(([category, stats]) => ({
        category,
        rate: (stats.success / stats.total) * 100,
        total: stats.total,
      }))
      .filter(c => c.total >= 2);

    if (categoryStats.length > 0) {
      const bestCategory = categoryStats.reduce((best, curr) =>
        curr.rate > best.rate ? curr : best
      );
      const worstCategory = categoryStats.reduce((worst, curr) =>
        curr.rate < worst.rate ? curr : worst
      );

      if (bestCategory.rate >= 80) {
        insights.push({
          type: 'positive',
          title: 'Favorite Category',
          message: `${activeKid?.name} loves ${bestCategory.category} foods (${Math.round(bestCategory.rate)}% success). Great for pairing with new foods!`,
          priority: 'low',
        });
      }

      if (worstCategory.rate < 40 && worstCategory.total >= 3) {
        insights.push({
          type: 'recommendation',
          title: 'Category Challenge',
          message: `${worstCategory.category} foods are challenging. Try different preparations or textures within this category.`,
          action: 'Explore ' + worstCategory.category + ' alternatives',
          priority: 'medium',
        });
      }
    }

    // Try bite analysis
    const tryBites = kidEntries.filter(e => e.meal_slot === 'try_bite');
    if (tryBites.length >= 5) {
      const successful = tryBites.filter(e => e.result === 'ate' || e.result === 'tasted').length;
      const rate = (successful / tryBites.length) * 100;

      if (rate >= 60) {
        insights.push({
          type: 'positive',
          title: 'Excellent Explorer!',
          message: `${Math.round(rate)}% try bite success rate! ${activeKid?.name} is doing amazing with new foods.`,
          priority: 'high',
        });
      } else if (rate < 30) {
        insights.push({
          type: 'tip',
          title: 'Try Bite Strategy',
          message: 'Try bites work best when introduced alongside favorite foods. Consider smaller portions and no pressure.',
          priority: 'high',
        });
      }
    }

    // Food fatigue detection
    const recentEntries = kidEntries.slice(-14); // Last 14 entries
    const foodFrequency: { [key: string]: number } = {};
    recentEntries.forEach(entry => {
      entry.food_ids?.forEach(foodId => {
        const food = foods.find(f => f.id === foodId);
        if (food) {
          foodFrequency[food.name] = (foodFrequency[food.name] || 0) + 1;
        }
      });
    });

    const overusedFoods = Object.entries(foodFrequency)
      .filter(([_, count]) => count >= 5)
      .sort((a, b) => b[1] - a[1]);

    if (overusedFoods.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Food Fatigue Alert',
        message: `${overusedFoods[0][0]} has appeared ${overusedFoods[0][1]} times recently. Consider rotating with similar foods to prevent burnout.`,
        action: 'Suggest alternatives',
        priority: 'medium',
      });
    }

    // Consistency check
    const last7Days = kidEntries.slice(-21); // Roughly last week (3 meals/day)
    if (last7Days.length >= 15) {
      const rate = (last7Days.filter(e => e.result === 'ate').length / last7Days.length) * 100;
      if (rate >= 75) {
        insights.push({
          type: 'positive',
          title: 'Consistent Success',
          message: `Great consistency! ${Math.round(rate)}% success rate over the past week. Keep up this routine!`,
          priority: 'low',
        });
      }
    }

    // Sort by priority
    return insights.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [planEntries, foods, activeKidId, activeKid]);

  const getInsightIcon = (type: InsightType) => {
    switch (type) {
      case 'positive':
        return TrendingUp;
      case 'warning':
        return AlertTriangle;
      case 'tip':
        return Lightbulb;
      case 'pattern':
        return Brain;
      case 'recommendation':
        return Target;
      default:
        return Sparkles;
    }
  };

  const getInsightColor = (type: InsightType) => {
    switch (type) {
      case 'positive':
        return {
          bg: 'bg-green-50 dark:bg-green-950/20',
          border: 'border-green-200 dark:border-green-800',
          text: 'text-green-700 dark:text-green-300',
          icon: 'text-green-600 dark:text-green-400',
        };
      case 'warning':
        return {
          bg: 'bg-orange-50 dark:bg-orange-950/20',
          border: 'border-orange-200 dark:border-orange-800',
          text: 'text-orange-700 dark:text-orange-300',
          icon: 'text-orange-600 dark:text-orange-400',
        };
      case 'tip':
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/20',
          border: 'border-blue-200 dark:border-blue-800',
          text: 'text-blue-700 dark:text-blue-300',
          icon: 'text-blue-600 dark:text-blue-400',
        };
      case 'pattern':
        return {
          bg: 'bg-purple-50 dark:bg-purple-950/20',
          border: 'border-purple-200 dark:border-purple-800',
          text: 'text-purple-700 dark:text-purple-300',
          icon: 'text-purple-600 dark:text-purple-400',
        };
      case 'recommendation':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-950/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          text: 'text-yellow-700 dark:text-yellow-300',
          icon: 'text-yellow-600 dark:text-yellow-400',
        };
    }
  };

  if (!activeKid) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Smart Insights
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          AI-powered patterns and recommendations
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Keep tracking meals to unlock personalized insights!
            </p>
          </div>
        ) : (
          insights.map((insight, index) => {
            const Icon = getInsightIcon(insight.type);
            const colors = getInsightColor(insight.type);

            return (
              <div
                key={index}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-lg border',
                  colors.bg,
                  colors.border
                )}
              >
                <div className={cn('mt-0.5 flex-shrink-0', colors.icon)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={cn('font-semibold text-sm mb-1', colors.text)}>
                    {insight.title}
                  </h4>
                  <p className={cn('text-sm', colors.text)}>{insight.message}</p>
                  {insight.action && (
                    <button className={cn('text-xs font-medium underline mt-2', colors.text)}>
                      {insight.action} →
                    </button>
                  )}
                </div>
                {insight.priority === 'high' && (
                  <Badge variant="outline" className={cn('shrink-0', colors.text)}>
                    Important
                  </Badge>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
