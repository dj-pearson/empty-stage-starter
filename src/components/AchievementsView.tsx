import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useApp } from '@/contexts/AppContext';
import { AchievementBadge, type Achievement } from './AchievementBadge';
import { Trophy, Lock, Star, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

export function AchievementsView() {
  const { planEntries, foods, activeKidId, kids } = useApp();
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');

  const activeKid = kids.find(k => k.id === activeKidId);

  // Calculate achievement progress based on actual data
  const achievements = useMemo((): Achievement[] => {
    const kidEntries = planEntries.filter(e => e.kid_id === activeKidId);
    const tryBiteEntries = kidEntries.filter(e => e.meal_slot === 'try_bite');
    const successfulTryBites = tryBiteEntries.filter(
      e => e.result === 'ate' || e.result === 'tasted'
    );

    // Calculate streak
    const sortedEntries = [...kidEntries]
      .filter(e => e.result)
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
        const dayDiff = Math.floor(
          (lastDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (dayDiff === 1) {
          currentStreak++;
          lastDate = entryDate;
        } else if (dayDiff > 1) {
          break;
        }
      }
    }

    // Count consecutive successful try bites
    let consecutiveSuccessful = 0;
    let maxConsecutive = 0;
    for (const entry of tryBiteEntries) {
      if (entry.result === 'ate' || entry.result === 'tasted') {
        consecutiveSuccessful++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveSuccessful);
      } else {
        consecutiveSuccessful = 0;
      }
    }

    // Food diversity by category
    const safeFoods = foods.filter(f => f.is_safe);
    const categories = new Set(safeFoods.map(f => f.category).filter(Boolean));

    // Track first achievements
    const hasFirstTryBite = tryBiteEntries.length > 0;
    const firstTryBiteDate = hasFirstTryBite
      ? format(new Date(tryBiteEntries[0].date), 'MMM d, yyyy')
      : undefined;

    return [
      {
        id: 'first-bite',
        title: 'First Bite',
        description: 'Logged your first try bite',
        icon: 'star',
        unlocked: hasFirstTryBite,
        unlockedDate: firstTryBiteDate,
        rarity: 'common',
      },
      {
        id: 'week-streak',
        title: 'Week Warrior',
        description: '7 days of consistent meal logging',
        icon: 'flame',
        unlocked: currentStreak >= 7,
        progress: currentStreak,
        total: 7,
        unlockedDate:
          currentStreak >= 7 ? format(new Date(), 'MMM d, yyyy') : undefined,
        rarity: 'rare',
      },
      {
        id: 'bullseye',
        title: 'Bullseye',
        description: '5 successful try bites in a row',
        icon: 'target',
        unlocked: maxConsecutive >= 5,
        progress: maxConsecutive,
        total: 5,
        unlockedDate:
          maxConsecutive >= 5 ? format(new Date(), 'MMM d, yyyy') : undefined,
        rarity: 'epic',
      },
      {
        id: 'food-explorer',
        title: 'Food Explorer',
        description: 'Try 25 new foods',
        icon: 'trophy',
        unlocked: tryBiteEntries.length >= 25,
        progress: tryBiteEntries.length,
        total: 25,
        unlockedDate:
          tryBiteEntries.length >= 25 ? format(new Date(), 'MMM d, yyyy') : undefined,
        rarity: 'epic',
      },
      {
        id: 'rainbow-eater',
        title: 'Rainbow Eater',
        description: 'Have foods from 6+ categories',
        icon: 'sparkles',
        unlocked: categories.size >= 6,
        progress: categories.size,
        total: 6,
        unlockedDate:
          categories.size >= 6 ? format(new Date(), 'MMM d, yyyy') : undefined,
        rarity: 'legendary',
      },
      {
        id: 'progress-pro',
        title: 'Progress Pro',
        description: '30 days of tracking',
        icon: 'trending',
        unlocked: currentStreak >= 30,
        progress: currentStreak,
        total: 30,
        unlockedDate:
          currentStreak >= 30 ? format(new Date(), 'MMM d, yyyy') : undefined,
        rarity: 'rare',
      },
      {
        id: 'pantry-pro',
        title: 'Pantry Pro',
        description: '50+ foods in pantry',
        icon: 'award',
        unlocked: foods.length >= 50,
        progress: foods.length,
        total: 50,
        unlockedDate:
          foods.length >= 50 ? format(new Date(), 'MMM d, yyyy') : undefined,
        rarity: 'rare',
      },
      {
        id: 'consistency-champion',
        title: 'Consistency Champion',
        description: '30 day logging streak',
        icon: 'flame',
        unlocked: currentStreak >= 30,
        progress: currentStreak,
        total: 30,
        unlockedDate:
          currentStreak >= 30 ? format(new Date(), 'MMM d, yyyy') : undefined,
        rarity: 'legendary',
      },
      {
        id: 'try-bite-master',
        title: 'Try Bite Master',
        description: '50 successful try bites',
        icon: 'trophy',
        unlocked: successfulTryBites.length >= 50,
        progress: successfulTryBites.length,
        total: 50,
        unlockedDate:
          successfulTryBites.length >= 50
            ? format(new Date(), 'MMM d, yyyy')
            : undefined,
        rarity: 'legendary',
      },
    ];
  }, [planEntries, foods, activeKidId]);

  const filteredAchievements = useMemo(() => {
    if (filter === 'unlocked') {
      return achievements.filter(a => a.unlocked);
    } else if (filter === 'locked') {
      return achievements.filter(a => !a.unlocked);
    }
    return achievements;
  }, [achievements, filter]);

  const stats = useMemo(() => {
    const unlocked = achievements.filter(a => a.unlocked).length;
    const total = achievements.length;
    const percentage = Math.round((unlocked / total) * 100);

    const byRarity = achievements.reduce(
      (acc, a) => {
        if (a.unlocked) {
          acc[a.rarity || 'common']++;
        }
        return acc;
      },
      { common: 0, rare: 0, epic: 0, legendary: 0 }
    );

    return {
      unlocked,
      total,
      percentage,
      byRarity,
    };
  }, [achievements]);

  if (!activeKid) {
    return (
      <Card className="p-12 text-center">
        <h3 className="text-xl font-semibold mb-2">No Child Selected</h3>
        <p className="text-muted-foreground">
          Please select a child to view achievements
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Trophy className="h-7 w-7 text-primary" />
          {activeKid.name}'s Achievements
        </h2>
        <p className="text-muted-foreground">
          Track milestones and celebrate progress!
        </p>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Achievement Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-muted-foreground">
                {stats.unlocked} / {stats.total} unlocked
              </span>
            </div>
            <Progress value={stats.percentage} className="h-3" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-lg bg-gray-100 dark:bg-gray-900">
              <div className="text-lg font-bold">{stats.byRarity.common}</div>
              <div className="text-xs text-muted-foreground">Common</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {stats.byRarity.rare}
              </div>
              <div className="text-xs text-muted-foreground">Rare</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {stats.byRarity.epic}
              </div>
              <div className="text-xs text-muted-foreground">Epic</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                {stats.byRarity.legendary}
              </div>
              <div className="text-xs text-muted-foreground">Legendary</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">
            All ({achievements.length})
          </TabsTrigger>
          <TabsTrigger value="unlocked">
            Unlocked ({stats.unlocked})
          </TabsTrigger>
          <TabsTrigger value="locked">
            Locked ({achievements.length - stats.unlocked})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAchievements.map((achievement) => (
              <AchievementBadge
                key={achievement.id}
                achievement={achievement}
                size="md"
                showProgress={true}
              />
            ))}
          </div>

          {filteredAchievements.length === 0 && (
            <Card className="p-12 text-center border-dashed">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Lock className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {filter === 'unlocked' ? 'No Achievements Yet' : 'All Unlocked!'}
              </h3>
              <p className="text-muted-foreground">
                {filter === 'unlocked'
                  ? 'Keep tracking meals to unlock your first achievement!'
                  : 'Congratulations on unlocking all achievements!'}
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Recent Unlocks */}
      {stats.unlocked > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              Recently Unlocked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {achievements
                .filter(a => a.unlocked)
                .slice(0, 3)
                .map((achievement) => (
                  <div
                    key={achievement.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Trophy className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">{achievement.title}</h4>
                      <p className="text-xs text-muted-foreground">
                        {achievement.unlockedDate}
                      </p>
                    </div>
                    <Badge variant="outline">{achievement.rarity}</Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
