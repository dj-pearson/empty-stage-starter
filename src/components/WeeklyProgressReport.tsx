import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/contexts/AppContext';
import {
  Calendar,
  TrendingUp,
  Star,
  Sparkles,
  Share2,
  Download,
  Award,
  CheckCircle2,
  Circle,
  XCircle
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval } from 'date-fns';
import { cn } from '@/lib/utils';

interface WeeklyProgressReportProps {
  weekStart?: Date;
  kidId?: string;
}

export function WeeklyProgressReport({ weekStart, kidId }: WeeklyProgressReportProps) {
  const { planEntries, foods, kids, activeKidId } = useApp();

  const targetKidId = kidId || activeKidId;
  const targetKid = kids.find(k => k.id === targetKidId);

  // Calculate week range
  const weekStartDate = weekStart || startOfWeek(new Date());
  const weekEndDate = endOfWeek(weekStartDate);
  const weekDays = eachDayOfInterval({ start: weekStartDate, end: weekEndDate });

  // Get this week's entries
  const weekEntries = useMemo(() => {
    return planEntries.filter(entry => {
      const entryDate = new Date(entry.date);
      return (
        entry.kid_id === targetKidId &&
        isWithinInterval(entryDate, { start: weekStartDate, end: weekEndDate })
      );
    });
  }, [planEntries, targetKidId, weekStartDate, weekEndDate]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = weekEntries.filter(e => e.result).length;
    const ate = weekEntries.filter(e => e.result === 'ate').length;
    const tasted = weekEntries.filter(e => e.result === 'tasted').length;
    const refused = weekEntries.filter(e => e.result === 'refused').length;

    const successRate = total > 0 ? Math.round(((ate + tasted * 0.5) / total) * 100) : 0;

    // Try bites
    const tryBites = weekEntries.filter(e => e.meal_slot === 'try_bite');
    const tryBitesSuccessful = tryBites.filter(e => e.result === 'ate' || e.result === 'tasted').length;

    // New foods (try bites that were accepted)
    const newFoodsAccepted = tryBites
      .filter(e => e.result === 'ate')
      .map(e => foods.find(f => e.food_ids?.includes(f.id)))
      .filter(Boolean);

    return {
      total,
      ate,
      tasted,
      refused,
      successRate,
      tryBites: tryBites.length,
      tryBitesSuccessful,
      newFoodsAccepted,
    };
  }, [weekEntries, foods]);

  // Get meals by day
  const mealsByDay = useMemo(() => {
    return weekDays.map(day => {
      const dayEntries = weekEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate.toDateString() === day.toDateString();
      });

      const total = dayEntries.filter(e => e.result).length;
      const ate = dayEntries.filter(e => e.result === 'ate').length;

      return {
        date: day,
        entries: dayEntries,
        total,
        ate,
        successRate: total > 0 ? Math.round((ate / total) * 100) : 0,
      };
    });
  }, [weekDays, weekEntries]);

  // Determine trend
  const previousWeekRate = 65; // This would come from previous week's data
  const trend = stats.successRate > previousWeekRate ? 'up' :
                stats.successRate < previousWeekRate ? 'down' : 'same';

  // Insights
  const insights = useMemo(() => {
    const messages = [];

    if (stats.successRate >= 85) {
      messages.push({
        type: 'celebration',
        icon: Award,
        message: `🎉 Best Week Yet! ${targetKid?.name} ate ${stats.successRate}% of planned meals - up from ${previousWeekRate}% last week!`,
      });
    } else if (stats.successRate >= 70) {
      messages.push({
        type: 'positive',
        icon: TrendingUp,
        message: `Great progress! ${stats.successRate}% success rate this week.`,
      });
    }

    if (stats.newFoodsAccepted.length > 0) {
      messages.push({
        type: 'milestone',
        icon: Sparkles,
        message: `New Milestone! ${stats.newFoodsAccepted.length} new food${stats.newFoodsAccepted.length > 1 ? 's' : ''} accepted: ${stats.newFoodsAccepted.map(f => f?.name).join(', ')}`,
      });
    }

    if (stats.tryBites > 0) {
      const tryBiteRate = Math.round((stats.tryBitesSuccessful / stats.tryBites) * 100);
      if (tryBiteRate >= 60) {
        messages.push({
          type: 'positive',
          icon: Star,
          message: `${tryBiteRate}% try bite success rate - excellent exploration!`,
        });
      }
    }

    // Pattern detection
    const bestDay = mealsByDay.reduce((best, day) =>
      day.successRate > best.successRate ? day : best
    , mealsByDay[0]);

    if (bestDay && bestDay.successRate >= 80) {
      messages.push({
        type: 'insight',
        icon: TrendingUp,
        message: `Pattern detected: ${targetKid?.name} eats better on ${format(bestDay.date, 'EEEE')}s (${bestDay.successRate}% success rate).`,
      });
    }

    return messages;
  }, [stats, mealsByDay, targetKid, previousWeekRate]);

  const handleShare = () => {
    // TODO: Implement sharing functionality
    console.log('Share report');
  };

  const handleDownload = () => {
    // TODO: Implement PDF download
    console.log('Download report');
  };

  if (!targetKid) {
    return null;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-accent/10 border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Calendar className="h-6 w-6" />
              {targetKid.name}'s Week in Review
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {format(weekStartDate, 'MMM d')} - {format(weekEndDate, 'MMM d, yyyy')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Highlights */}
        <div className="space-y-3">
          {insights.map((insight, index) => {
            const Icon = insight.icon;
            const colorClasses = {
              celebration: 'bg-green-50 dark:bg-green-950/20 border-green-200 text-green-700 dark:text-green-300',
              positive: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 text-blue-700 dark:text-blue-300',
              milestone: 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 text-purple-700 dark:text-purple-300',
              insight: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 text-yellow-700 dark:text-yellow-300',
            };

            return (
              <div
                key={index}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-lg border',
                  colorClasses[insight.type as keyof typeof colorClasses]
                )}
              >
                <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <p className="text-sm font-medium">{insight.message}</p>
              </div>
            );
          })}
        </div>

        {/* Week Overview Grid */}
        <div>
          <h3 className="font-semibold mb-3">Daily Breakdown</h3>
          <div className="grid grid-cols-7 gap-2">
            {mealsByDay.map((day) => {
              const hasData = day.total > 0;
              return (
                <div
                  key={day.date.toISOString()}
                  className={cn(
                    'p-3 rounded-lg border text-center transition-colors',
                    hasData ? 'bg-muted/50' : 'bg-muted/20'
                  )}
                >
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    {format(day.date, 'EEE')}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {format(day.date, 'd')}
                  </div>
                  {hasData ? (
                    <div className="space-y-1">
                      {day.entries.map((entry, idx) => (
                        <div key={idx} className="flex justify-center">
                          {entry.result === 'ate' && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          {entry.result === 'tasted' && (
                            <Circle className="h-4 w-4 text-yellow-500" />
                          )}
                          {entry.result === 'refused' && (
                            <XCircle className="h-4 w-4 text-orange-500" />
                          )}
                        </div>
                      ))}
                      <div className="text-xs font-medium text-primary mt-1">
                        {day.successRate}%
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">-</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.ate}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Ate</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.tasted}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Tasted</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {stats.refused}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Refused</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {stats.tryBites}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Try Bites</div>
          </div>
        </div>

        {/* Coming Up Next Week */}
        <div className="bg-muted/50 rounded-lg p-4 border-dashed border-2">
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Looking Ahead
          </h4>
          <p className="text-sm text-muted-foreground">
            Keep up the momentum! Based on this week's success, we suggest continuing with
            familiar favorites while introducing 1-2 new try bites per day.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
