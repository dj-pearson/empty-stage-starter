import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Clock,
  Users,
  Heart,
  ShoppingCart,
  ChefHat,
  Sparkles,
  Calendar,
  DollarSign,
  CheckCircle,
  Award,
  AlertTriangle,
  Lightbulb,
  Shuffle,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface WeeklyReport {
  id: string;
  household_id: string;
  week_start_date: string;
  week_end_date: string;

  // Planning
  meals_planned: number;
  meals_completed: number;
  planning_completion_rate: number;
  templates_used: number;
  time_saved_minutes: number;

  // Nutrition
  nutrition_score: number;
  avg_calories_per_day: number;
  avg_protein_per_day: number;
  avg_carbs_per_day: number;
  avg_fat_per_day: number;

  // Grocery
  grocery_items_added: number;
  grocery_items_purchased: number;
  grocery_completion_rate: number;
  estimated_grocery_cost: number;

  // Recipes
  unique_recipes_used: number;
  new_recipes_tried: number;
  recipe_diversity_score: number;

  // Kids
  kids_voted: number;
  total_kids: number;
  voting_participation_rate: number;
  total_votes_cast: number;
  avg_meal_approval_score: number;
  achievements_unlocked: number;

  // Top performers
  most_loved_meals: any[];
  least_loved_meals: any[];
  most_used_recipes: any[];

  // Insights
  insights: any[];

  status: string;
  generated_at: string;
  viewed_at?: string;
}

interface Insight {
  id: string;
  insight_type: string;
  title: string;
  description: string;
  metric_value?: number;
  metric_label?: string;
  icon_name: string;
  color_scheme: string;
  priority: number;
}

interface WeeklyReportCardProps {
  report: WeeklyReport;
  insights?: Insight[];
  detailed?: boolean;
  className?: string;
  onMarkViewed?: (reportId: string) => void;
}

const iconMap: Record<string, any> = {
  trophy: Trophy,
  clock: Clock,
  users: Users,
  heart: Heart,
  'shopping-cart': ShoppingCart,
  'chef-hat': ChefHat,
  sparkles: Sparkles,
  calendar: Calendar,
  'dollar-sign': DollarSign,
  'check-circle': CheckCircle,
  award: Award,
  'alert-triangle': AlertTriangle,
  lightbulb: Lightbulb,
  shuffle: Shuffle,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
};

const colorSchemeClasses: Record<string, string> = {
  green: 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  blue: 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  yellow: 'bg-yellow-50 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  red: 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  purple: 'bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
};

export function WeeklyReportCard({
  report,
  insights = [],
  detailed = true,
  className,
  onMarkViewed,
}: WeeklyReportCardProps) {
  const weekStart = new Date(report.week_start_date);
  const weekEnd = new Date(report.week_end_date);

  // Mark as viewed on mount if not already viewed
  if (!report.viewed_at && onMarkViewed) {
    onMarkViewed(report.id);
  }

  // Use insights from props or from report.insights
  const displayInsights = insights.length > 0 ? insights : (report.insights || []);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Weekly Report
            </CardTitle>
            <CardDescription className="mt-1">
              {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
            </CardDescription>
          </div>
          {report.status === 'generated' && !report.viewed_at && (
            <Badge variant="secondary">New</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {/* Key Insights Section */}
        {displayInsights.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Key Insights
            </h3>
            <div className="grid gap-2">
              {displayInsights.slice(0, detailed ? undefined : 3).map((insight: any, index: number) => {
                const Icon = iconMap[insight.icon_name] || Trophy;
                const colorClass = colorSchemeClasses[insight.color_scheme] || colorSchemeClasses.blue;

                return (
                  <div
                    key={insight.id || index}
                    className={cn(
                      "p-3 rounded-lg border",
                      colorClass
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{insight.title}</p>
                        <p className="text-sm mt-1 opacity-90">{insight.description}</p>
                      </div>
                      {insight.metric_value !== undefined && (
                        <div className="text-right shrink-0">
                          <div className="text-2xl font-bold">
                            {insight.metric_value.toFixed(0)}
                          </div>
                          {insight.metric_label && (
                            <div className="text-xs opacity-75">{insight.metric_label}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!detailed && <Separator />}

        {/* Metrics Summary (always shown) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            icon={ChefHat}
            label="Meals Planned"
            value={report.meals_planned}
            subValue={`${report.planning_completion_rate.toFixed(0)}% completed`}
          />
          <MetricCard
            icon={Heart}
            label="Kid Approval"
            value={`${report.avg_meal_approval_score.toFixed(0)}%`}
            subValue={`${report.total_votes_cast} votes`}
          />
          <MetricCard
            icon={Clock}
            label="Time Saved"
            value={report.time_saved_minutes}
            suffix="min"
            subValue="via templates"
          />
          <MetricCard
            icon={ShoppingCart}
            label="Grocery Items"
            value={report.grocery_items_added}
            subValue={`${report.grocery_completion_rate.toFixed(0)}% purchased`}
          />
        </div>

        {detailed && (
          <>
            <Separator />

            {/* Planning Metrics */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Meal Planning
              </h3>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Completion Rate</span>
                    <span className="font-medium">{report.planning_completion_rate.toFixed(0)}%</span>
                  </div>
                  <Progress value={report.planning_completion_rate} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Planned: </span>
                    <span className="font-medium">{report.meals_planned}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Completed: </span>
                    <span className="font-medium">{report.meals_completed}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Templates Used: </span>
                    <span className="font-medium">{report.templates_used}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Time Saved: </span>
                    <span className="font-medium">{report.time_saved_minutes} min</span>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Nutrition Metrics */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Nutrition
              </h3>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Nutrition Score</span>
                    <span className="font-medium">{report.nutrition_score.toFixed(0)}/100</span>
                  </div>
                  <Progress value={report.nutrition_score} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Avg Calories: </span>
                    <span className="font-medium">{report.avg_calories_per_day.toFixed(0)}/day</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Protein: </span>
                    <span className="font-medium">{report.avg_protein_per_day.toFixed(1)}g/day</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Carbs: </span>
                    <span className="font-medium">{report.avg_carbs_per_day.toFixed(1)}g/day</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Fat: </span>
                    <span className="font-medium">{report.avg_fat_per_day.toFixed(1)}g/day</span>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Recipe Variety */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <ChefHat className="h-4 w-4" />
                Recipe Variety
              </h3>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Diversity Score</span>
                    <span className="font-medium">{report.recipe_diversity_score.toFixed(0)}%</span>
                  </div>
                  <Progress value={report.recipe_diversity_score} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Unique Recipes: </span>
                    <span className="font-medium">{report.unique_recipes_used}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">New Tried: </span>
                    <span className="font-medium">{report.new_recipes_tried}</span>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Kid Engagement */}
            {report.total_kids > 0 && (
              <>
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Kid Engagement
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Participation Rate</span>
                        <span className="font-medium">{report.voting_participation_rate.toFixed(0)}%</span>
                      </div>
                      <Progress value={report.voting_participation_rate} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Meal Approval</span>
                        <span className="font-medium">{report.avg_meal_approval_score.toFixed(0)}%</span>
                      </div>
                      <Progress value={report.avg_meal_approval_score} className="h-2" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Kids Voted: </span>
                        <span className="font-medium">{report.kids_voted}/{report.total_kids}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total Votes: </span>
                        <span className="font-medium">{report.total_votes_cast}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Achievements: </span>
                        <span className="font-medium">{report.achievements_unlocked}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />
              </>
            )}

            {/* Grocery */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Grocery Shopping
              </h3>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Completion Rate</span>
                    <span className="font-medium">{report.grocery_completion_rate.toFixed(0)}%</span>
                  </div>
                  <Progress value={report.grocery_completion_rate} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Items Added: </span>
                    <span className="font-medium">{report.grocery_items_added}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Purchased: </span>
                    <span className="font-medium">{report.grocery_items_purchased}</span>
                  </div>
                  {report.estimated_grocery_cost > 0 && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Estimated Cost: </span>
                      <span className="font-medium">${report.estimated_grocery_cost.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Top Meals */}
            {report.most_loved_meals && report.most_loved_meals.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Most Loved Meals
                  </h3>
                  <div className="space-y-2">
                    {report.most_loved_meals.slice(0, 3).map((meal: any, index: number) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span>{meal.meal_name}</span>
                        <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30">
                          {meal.approval_score}% ({meal.votes} votes)
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div className="text-xs text-muted-foreground text-center pt-2">
          Generated {format(new Date(report.generated_at), 'MMM d, yyyy')}
        </div>
      </CardContent>
    </Card>
  );
}

interface MetricCardProps {
  icon: any;
  label: string;
  value: number | string;
  suffix?: string;
  subValue?: string;
}

function MetricCard({ icon: Icon, label, value, suffix, subValue }: MetricCardProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-bold">
        {value}{suffix}
      </div>
      {subValue && (
        <div className="text-xs text-muted-foreground">{subValue}</div>
      )}
    </div>
  );
}
