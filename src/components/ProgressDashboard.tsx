import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useApp } from '@/contexts/AppContext';
import { TrendingUp, TrendingDown, Target, Award, Calendar, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ProgressDashboard() {
  const { planEntries, foods, activeKidId, kids } = useApp();

  const activeKid = kids.find(k => k.id === activeKidId);

  // Calculate statistics
  const stats = useMemo(() => {
    const kidEntries = planEntries.filter(p => p.kid_id === activeKidId);

    // This week's stats
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);

    const thisWeekEntries = kidEntries.filter(entry => {
      const entryDate = new Date(entry.date);
      return entryDate >= weekStart;
    });

    const totalMeals = thisWeekEntries.length;
    const ateMeals = thisWeekEntries.filter(e => e.result === 'ate').length;
    const tastedMeals = thisWeekEntries.filter(e => e.result === 'tasted').length;
    const refusedMeals = thisWeekEntries.filter(e => e.result === 'refused').length;

    const successRate = totalMeals > 0 ? Math.round(((ateMeals + tastedMeals * 0.5) / totalMeals) * 100) : 0;

    // Try bites this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEntries = kidEntries.filter(entry => {
      const entryDate = new Date(entry.date);
      return entryDate >= monthStart && entry.meal_slot === 'try_bite';
    });

    const tryBitesAttempted = thisMonthEntries.length;
    const tryBitesSuccessful = thisMonthEntries.filter(e => e.result === 'ate' || e.result === 'tasted').length;

    // New foods accepted (try bites that became safe foods)
    const tryBiteFoods = foods.filter(f => f.is_try_bite);
    const safeFoods = foods.filter(f => f.is_safe);

    // Food diversity
    const foodsByCategory: { [key: string]: number } = {};
    safeFoods.forEach(food => {
      if (food.category) {
        foodsByCategory[food.category] = (foodsByCategory[food.category] || 0) + 1;
      }
    });

    // Streak calculation
    const sortedEntries = [...kidEntries]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let currentStreak = 0;
    let lastDate: Date | null = null;

    for (const entry of sortedEntries) {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);

      if (!lastDate) {
        lastDate = entryDate;
        currentStreak = 1;
      } else {
        const dayDiff = Math.floor((lastDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
        if (dayDiff === 1) {
          currentStreak++;
          lastDate = entryDate;
        } else if (dayDiff > 1) {
          break;
        }
      }
    }

    return {
      thisWeek: {
        total: totalMeals,
        ate: ateMeals,
        tasted: tastedMeals,
        refused: refusedMeals,
        successRate,
      },
      tryBites: {
        attempted: tryBitesAttempted,
        successful: tryBitesSuccessful,
        successRate: tryBitesAttempted > 0 ? Math.round((tryBitesSuccessful / tryBitesAttempted) * 100) : 0,
      },
      foods: {
        safe: safeFoods.length,
        tryBite: tryBiteFoods.length,
        byCategory: foodsByCategory,
      },
      streak: currentStreak,
    };
  }, [planEntries, foods, activeKidId]);

  // Determine trend
  const getTrend = (current: number, previous: number = 50) => {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'same';
  };

  const trend = getTrend(stats.thisWeek.successRate, 50);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2">Progress Overview</h2>
        {activeKid && (
          <p className="text-muted-foreground">
            Tracking {activeKid.name}'s journey
          </p>
        )}
      </div>

      {/* Hero Stat - Success Rate */}
      <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <div className="relative inline-flex items-center justify-center w-32 h-32 mb-4">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-muted"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 56}`}
                  strokeDashoffset={`${2 * Math.PI * 56 * (1 - stats.thisWeek.successRate / 100)}`}
                  className="text-primary transition-all duration-1000"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold text-primary">{stats.thisWeek.successRate}%</div>
              </div>
            </div>

            <h3 className="text-lg font-semibold mb-1">Meal Success Rate</h3>
            <p className="text-sm text-muted-foreground mb-3">This week</p>

            {/* Trend indicator */}
            <div className="flex items-center gap-2">
              {trend === 'up' && (
                <Badge className="bg-green-500 hover:bg-green-600">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Better than average!
                </Badge>
              )}
              {trend === 'down' && (
                <Badge variant="secondary">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  Keep going!
                </Badge>
              )}
              {trend === 'same' && (
                <Badge variant="outline">
                  On track
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Try Bites
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {stats.tryBites.attempted}
            </div>
            <p className="text-xs text-muted-foreground mt-1">This month</p>
            {stats.tryBites.attempted > 0 && (
              <Progress value={stats.tryBites.successRate} className="mt-2 h-1.5" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.tryBites.successRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Try bites</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {stats.streak}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Days in a row</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Safe Foods
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.foods.safe}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total foods</p>
          </CardContent>
        </Card>
      </div>

      {/* This Week Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>This Week's Meals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Ate */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                Ate
              </span>
              <span className="text-sm text-muted-foreground">
                {stats.thisWeek.ate} meals
              </span>
            </div>
            <Progress
              value={stats.thisWeek.total > 0 ? (stats.thisWeek.ate / stats.thisWeek.total) * 100 : 0}
              className="h-2"
            />
          </div>

          {/* Tasted */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                Tasted
              </span>
              <span className="text-sm text-muted-foreground">
                {stats.thisWeek.tasted} meals
              </span>
            </div>
            <Progress
              value={stats.thisWeek.total > 0 ? (stats.thisWeek.tasted / stats.thisWeek.total) * 100 : 0}
              className="h-2"
            />
          </div>

          {/* Refused */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                Refused
              </span>
              <span className="text-sm text-muted-foreground">
                {stats.thisWeek.refused} meals
              </span>
            </div>
            <Progress
              value={stats.thisWeek.total > 0 ? (stats.thisWeek.refused / stats.thisWeek.total) * 100 : 0}
              className="h-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Food Diversity */}
      <Card>
        <CardHeader>
          <CardTitle>Food Diversity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(stats.foods.byCategory).map(([category, count]) => (
              <div
                key={category}
                className="p-3 rounded-lg bg-muted/50 border"
              >
                <div className="text-lg font-bold">{count}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {category}
                </div>
              </div>
            ))}
          </div>

          {Object.keys(stats.foods.byCategory).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Add foods to your pantry to see category breakdown
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
