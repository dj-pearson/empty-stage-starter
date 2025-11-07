import { useUsageStats } from "@/hooks/useUsageStats";
import { UsageMeter } from "./UsageMeter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Baby, Apple, Bot, CheckSquare, TrendingUp, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { shouldShowUsageUpgradePrompt } from "@/lib/subscription-helpers";

export function UsageDashboard() {
  const { stats, loading, error, refetch } = useUsageStats();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error loading usage</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={refetch}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!stats) {
    return null;
  }

  // Check if user has complementary access
  const isComplementary = stats.plan.is_complementary || false;
  const isTopTier = stats.plan.name === 'Professional';

  const hasLimitWarnings =
    (stats.usage.children.limit !== null && stats.usage.children.percentage >= 75) ||
    (stats.usage.pantry_foods.limit !== null && stats.usage.pantry_foods.percentage >= 75) ||
    (stats.usage.ai_coach.limit !== null && stats.usage.ai_coach.percentage >= 75) ||
    (stats.usage.food_tracker.limit !== null && stats.usage.food_tracker.percentage >= 75);

  // Don't show upgrade prompts for complementary or top-tier users
  const showUpgradeButton = !isComplementary && !isTopTier && hasLimitWarnings;

  return (
    <div className="space-y-6">
      {/* Plan Info Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>Your {stats.plan.name} Plan</CardTitle>
                  {isComplementary && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium">
                      <Gift className="w-3 h-3" />
                      Complementary
                    </span>
                  )}
                </div>
                <CardDescription className="mt-1">
                  {isComplementary
                    ? "Enjoy all features with complimentary access"
                    : "Current usage across all features"}
                </CardDescription>
              </div>
            </div>
            {showUpgradeButton && (
              <Button onClick={() => navigate("/pricing")}>
                <TrendingUp className="w-4 h-4 mr-2" />
                Upgrade Plan
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Usage Meters Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <UsageMeter
          title="Child Profiles"
          description="Number of children you can track"
          current={stats.usage.children.current}
          limit={stats.usage.children.limit}
          percentage={stats.usage.children.percentage}
          icon={<Baby className="w-5 h-5" />}
        />

        <UsageMeter
          title="Pantry Foods"
          description="Foods stored in your pantry"
          current={stats.usage.pantry_foods.current}
          limit={stats.usage.pantry_foods.limit}
          percentage={stats.usage.pantry_foods.percentage}
          icon={<Apple className="w-5 h-5" />}
        />

        <UsageMeter
          title="AI Coach Requests"
          description="Daily AI assistance requests"
          current={stats.usage.ai_coach.current}
          limit={stats.usage.ai_coach.limit}
          percentage={stats.usage.ai_coach.percentage}
          resetsAt={stats.usage.ai_coach.resets_at}
          icon={<Bot className="w-5 h-5" />}
        />

        <UsageMeter
          title="Food Tracker Entries"
          description="Monthly tracking entries"
          current={stats.usage.food_tracker.current}
          limit={stats.usage.food_tracker.limit}
          percentage={stats.usage.food_tracker.percentage}
          resetsAt={stats.usage.food_tracker.resets_at}
          icon={<CheckSquare className="w-5 h-5" />}
        />
      </div>

      {/* Feature Availability */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available Features</CardTitle>
          <CardDescription>
            Features included in your current plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <FeatureItem
              name="Food Chaining"
              available={stats.plan.has_food_chaining}
            />
            <FeatureItem
              name="Kid Meal Builder"
              available={stats.plan.has_meal_builder}
            />
            <FeatureItem
              name="Nutrition Tracking"
              available={stats.plan.has_nutrition_tracking}
            />
          </div>
        </CardContent>
      </Card>

      {/* Global upgrade prompt if any limits are close */}
      {showUpgradeButton && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>You're approaching your plan limits</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              Consider upgrading to continue using all features without interruption
            </span>
            <Button variant="default" size="sm" onClick={() => navigate("/pricing")}>
              View Plans
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Info message for complementary users approaching limits */}
      {isComplementary && hasLimitWarnings && (
        <Alert>
          <Gift className="h-4 w-4" />
          <AlertTitle>Usage Notice</AlertTitle>
          <AlertDescription>
            You're approaching your plan limits. Please contact support if you need to adjust your complementary subscription.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function FeatureItem({ name, available }: { name: string; available: boolean }) {
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg ${
      available 
        ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300" 
        : "bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
    }`}>
      {available ? (
        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <span className="text-white text-xs">✓</span>
        </div>
      ) : (
        <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
          <span className="text-white text-xs">✗</span>
        </div>
      )}
      <span className="text-sm font-medium">{name}</span>
    </div>
  );
}

