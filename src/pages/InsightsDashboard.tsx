import { useState, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  Apple, 
  ShieldCheck, 
  Lightbulb, 
  Calendar, 
  Award,
  PieChart,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock
} from "lucide-react";
import { format, subDays } from "date-fns";

export default function InsightsDashboard() {
  const { kids, foods, planEntries, activeKidId, setActiveKidId } = useApp();
  const activeKid = kids.find(k => k.id === activeKidId);
  const isFamilyMode = !activeKidId;
  const [insights, setInsights] = useState<any>({});

  useEffect(() => {
    if (isFamilyMode && kids.length > 0) {
      calculateFamilyInsights();
    } else if (activeKid) {
      calculateInsights();
    }
  }, [activeKid, isFamilyMode, kids, foods, planEntries]);

  const calculateInsights = () => {
    if (!activeKid) return;

    const kidAllergens = activeKid.allergens || [];
    const safeFoods = foods.filter(f => f.is_safe && !f.allergens?.some(a => kidAllergens.includes(a)));
    const tryBites = foods.filter(f => f.is_try_bite && !f.allergens?.some(a => kidAllergens.includes(a)));

    // Food coverage by category
    const categories = ['protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack'];
    const coverage = categories.map(cat => ({
      category: cat,
      count: safeFoods.filter(f => f.category === cat).length,
      percentage: (safeFoods.filter(f => f.category === cat).length / Math.max(safeFoods.length, 1)) * 100
    }));

    // Recent meal history (last 30 days)
    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const recentEntries = planEntries.filter(e => 
      e.kid_id === activeKid.id && e.date >= thirtyDaysAgo
    );

    // Success metrics
    const completedMeals = recentEntries.filter(e => e.result === 'ate').length;
    const tastedMeals = recentEntries.filter(e => e.result === 'tasted').length;
    const refusedMeals = recentEntries.filter(e => e.result === 'refused').length;
    const totalTracked = completedMeals + tastedMeals + refusedMeals;

    // Unique foods tried
    const uniqueFoodsTried = new Set(recentEntries.map(e => e.food_id)).size;

    // Try bites tracking
    const tryBiteEntries = recentEntries.filter(e => {
      const food = foods.find(f => f.id === e.food_id);
      return food?.is_try_bite;
    });
    const successfulTryBites = tryBiteEntries.filter(e => e.result === 'ate' || e.result === 'tasted').length;

    setInsights({
      safeFoodsCount: safeFoods.length,
      tryBitesCount: tryBites.length,
      coverage,
      completedMeals,
      tastedMeals,
      refusedMeals,
      totalTracked,
      successRate: totalTracked > 0 ? ((completedMeals + tastedMeals) / totalTracked) * 100 : 0,
      uniqueFoodsTried,
      successfulTryBites,
      totalTryBites: tryBiteEntries.length
    });
  };

  const calculateFamilyInsights = () => {
    // Aggregate insights across all kids
    const allSafeFoods = foods.filter(f => f.is_safe);
    const allTryBites = foods.filter(f => f.is_try_bite);

    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const recentEntries = planEntries.filter(e => e.date >= thirtyDaysAgo);

    const completedMeals = recentEntries.filter(e => e.result === 'ate').length;
    const tastedMeals = recentEntries.filter(e => e.result === 'tasted').length;
    const refusedMeals = recentEntries.filter(e => e.result === 'refused').length;
    const totalTracked = completedMeals + tastedMeals + refusedMeals;

    const uniqueFoodsTried = new Set(recentEntries.map(e => e.food_id)).size;

    setInsights({
      safeFoodsCount: allSafeFoods.length,
      tryBitesCount: allTryBites.length,
      completedMeals,
      tastedMeals,
      refusedMeals,
      totalTracked,
      successRate: totalTracked > 0 ? ((completedMeals + tastedMeals) / totalTracked) * 100 : 0,
      uniqueFoodsTried,
      familyMode: true
    });
  };

  if (kids.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Add a child profile first to view nutrition insights
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const educationalTips = [
    "Children often need 8-15 exposures to accept a new food. Don't give up!",
    "Always include at least one familiar food per meal to build confidence.",
    "Small portions reduce pressure and make trying new foods less intimidating.",
    "Let your child explore new foods without pressure to eat them.",
    "Model adventurous eating - children learn by watching you!"
  ];

  const randomTip = educationalTips[Math.floor(Math.random() * educationalTips.length)];

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <PieChart className="h-8 w-8 text-primary" />
          Nutrition Insights Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive overview of {activeKid.name}'s eating patterns and progress
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Safe Foods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{insights.safeFoodsCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Foods accepted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Try Bites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{insights.tryBitesCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Foods to explore</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{Math.round(insights.successRate || 0)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Foods Variety</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{insights.uniqueFoodsTried || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Unique foods tried</p>
          </CardContent>
        </Card>
      </div>

      {/* Safe Food Coverage Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Apple className="h-5 w-5" />
            Food Group Coverage
          </CardTitle>
          <CardDescription>
            Balance of safe foods across different food groups
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {insights.coverage?.map((item: unknown) => (
            <div key={item.category}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium capitalize">{item.category}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{item.count} foods</span>
                  <Badge variant={item.count > 3 ? "default" : item.count > 1 ? "secondary" : "destructive"}>
                    {Math.round(item.percentage)}%
                  </Badge>
                </div>
              </div>
              <Progress 
                value={item.percentage} 
                className={item.count < 2 ? "bg-red-100" : ""}
              />
            </div>
          ))}
          
          {insights.coverage?.some((c: any) => c.count < 2) && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Some food groups have low coverage. Try adding more variety in: {
                  insights.coverage
                    .filter((c: any) => c.count < 2)
                    .map((c: any) => c.category)
                    .join(', ')
                }
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allergen Safety */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Allergen Safety
            </CardTitle>
            <CardDescription>
              Foods are filtered to avoid these allergens
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeKid.allergens && activeKid.allergens.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {activeKid.allergens.map((allergen: string) => (
                    <Badge key={allergen} variant="destructive" className="text-sm">
                      <XCircle className="h-3 w-3 mr-1" />
                      {allergen}
                    </Badge>
                  ))}
                </div>
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertDescription>
                    All meal plans automatically exclude these ingredients
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No allergens recorded</p>
            )}
          </CardContent>
        </Card>

        {/* Try Bite Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Try Bite Progress
            </CardTitle>
            <CardDescription>
              Success with new food introductions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Successful Try Bites</span>
                <span className="font-medium">{insights.successfulTryBites || 0} / {insights.totalTryBites || 0}</span>
              </div>
              <Progress 
                value={insights.totalTryBites > 0 ? (insights.successfulTryBites / insights.totalTryBites) * 100 : 0} 
              />
            </div>
            
            {insights.totalTryBites > 0 && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{insights.successfulTryBites}</div>
                  <div className="text-xs text-muted-foreground">Accepted</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {insights.totalTryBites - insights.successfulTryBites}
                  </div>
                  <div className="text-xs text-muted-foreground">Need Retry</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Meal Tracking Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Recent Meal Tracking (Last 30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted">
              <div className="text-sm text-muted-foreground mb-1">Total Tracked</div>
              <div className="text-3xl font-bold">{insights.totalTracked || 0}</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <div className="text-sm text-muted-foreground mb-1">Ate</div>
              <div className="text-3xl font-bold text-green-600">{insights.completedMeals || 0}</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
              <Clock className="h-5 w-5 text-yellow-600 mx-auto mb-1" />
              <div className="text-sm text-muted-foreground mb-1">Tasted</div>
              <div className="text-3xl font-bold text-yellow-600">{insights.tastedMeals || 0}</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-red-50 dark:bg-red-950/20">
              <XCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
              <div className="text-sm text-muted-foreground mb-1">Refused</div>
              <div className="text-3xl font-bold text-red-600">{insights.refusedMeals || 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Educational Insights */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Daily Feeding Tip
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{randomTip}</p>
        </CardContent>
      </Card>

      {/* Profile Review Reminder */}
      {activeKid.profile_last_reviewed && (
        <Alert>
          <Calendar className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              Profile last reviewed: {format(new Date(activeKid.profile_last_reviewed), 'MMMM dd, yyyy')}
            </span>
            <Button variant="outline" size="sm">
              Update Profile
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
