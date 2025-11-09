import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Calendar, AlertCircle, TrendingUp, Apple, Target, Leaf } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KidSelector } from "@/components/KidSelector";
import { logger } from "@/lib/logger";

export default function AIPlanner() {
  const { kids, activeKidId, setActiveKidId, addPlanEntries } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [mealPlan, setMealPlan] = useState<any[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [strategy, setStrategy] = useState<any>(null);
  const [selectedKidForPlan, setSelectedKidForPlan] = useState<string | null>(null);

  const activeKid = kids.find(k => k.id === activeKidId);
  const isFamilyMode = !activeKidId;

  const handleGeneratePlan = async (kidId?: string) => {
    const targetKidId = kidId || selectedKidForPlan;
    if (!targetKidId) {
      toast.error("Please select a child first");
      return;
    }

    setIsGenerating(true);
    setSelectedKidForPlan(targetKidId);
    try {
      const { data, error } = await supabase.functions.invoke('ai-meal-plan', {
        body: { kidId: targetKidId, days: 7 }
      });

      if (error) throw error;

      setMealPlan(data.plan || []);
      setInsights(data.nutritional_insights || {});
      setStrategy(data.try_bite_strategy || {});
      
      const kidName = kids.find(k => k.id === targetKidId)?.name;
      toast.success(`AI meal plan generated for ${kidName}!`);
    } catch (error) {
      logger.error('Error generating meal plan:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate meal plan";
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSavePlan = async () => {
    if (mealPlan.length === 0) {
      toast.error("No meal plan to save");
      return;
    }

    try {
      await addPlanEntries(mealPlan);
      toast.success("Meal plan saved to calendar!");
      setMealPlan([]);
      setInsights(null);
      setStrategy(null);
    } catch (error: unknown) {
      logger.error('Error saving plan:', error);
      toast.error("Failed to save meal plan");
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            AI Meal Planner
          </h1>
          <p className="text-muted-foreground mt-2">
            Generate personalized, nutritionally balanced meal plans using AI
          </p>
        </div>
      </div>

      {kids.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Add a child profile first to generate personalized meal plans.
          </AlertDescription>
        </Alert>
      ) : isFamilyMode ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Select Child for AI Meal Plan</CardTitle>
              <CardDescription>
                Choose which child to generate a personalized 7-day meal plan for
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {kids.map(kid => (
                  <Card key={kid.id} className="hover:border-primary transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="font-semibold">{kid.name}</p>
                          <div className="flex gap-3 text-sm text-muted-foreground">
                            <span>Age: {kid.age || 'N/A'}</span>
                            <span>Allergens: {kid.allergens?.length || 0}</span>
                            <span className="capitalize">Pickiness: {kid.pickiness_level || 'Moderate'}</span>
                          </div>
                        </div>
                        <Button 
                          onClick={() => handleGeneratePlan(kid.id)}
                          disabled={isGenerating}
                        >
                          {isGenerating && selectedKidForPlan === kid.id ? (
                            <>
                              <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Generate Plan
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Generate AI Meal Plan</CardTitle>
              <CardDescription>
                Creating a personalized plan for {activeKid?.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeKid && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Age</p>
                    <p className="text-2xl font-bold">{activeKid.age || 'N/A'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Allergens</p>
                    <p className="text-2xl font-bold">{activeKid.allergens?.length || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Pickiness</p>
                    <p className="text-2xl font-bold capitalize">
                      {activeKid.pickiness_level || 'Moderate'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Profile</p>
                    <p className="text-2xl font-bold">
                      {activeKid.profile_completed ? '✓' : '○'}
                    </p>
                  </div>
                </div>
              )}

              <Button 
                onClick={() => handleGeneratePlan()}
                disabled={isGenerating}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Sparkles className="mr-2 h-5 w-5 animate-spin" />
                    Generating AI Plan...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Generate 7-Day Meal Plan
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {insights && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Nutritional Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {insights.daily_calories && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Daily Calories</span>
                        <Badge variant="outline">{insights.daily_calories} kcal</Badge>
                      </div>
                      <Progress value={85} />
                    </div>
                  )}
                  
                  {insights.protein_coverage !== undefined && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Protein Coverage</span>
                        <Badge variant="outline">{insights.protein_coverage}%</Badge>
                      </div>
                      <Progress value={insights.protein_coverage} />
                    </div>
                  )}
                  
                  {insights.variety_score !== undefined && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Food Variety</span>
                        <Badge variant="outline">{insights.variety_score}%</Badge>
                      </div>
                      <Progress value={insights.variety_score} />
                    </div>
                  )}
                </div>

                {insights.warnings && insights.warnings.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <ul className="list-disc pl-4">
                        {insights.warnings.map((warning: string, i: number) => (
                          <li key={i}>{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {strategy && strategy.introduction_order && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Try Bite Strategy
                </CardTitle>
                <CardDescription>
                  Gradual food introduction using food chaining
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Introduction Order:</p>
                  <div className="flex flex-wrap gap-2">
                    {strategy.introduction_order.map((food: string, i: number) => (
                      <Badge key={i} variant="secondary">
                        {i + 1}. {food}
                      </Badge>
                    ))}
                  </div>
                  
                  {strategy.similarity_chains && strategy.similarity_chains.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-2">Food Chains:</p>
                      <ul className="space-y-1">
                        {strategy.similarity_chains.map((chain: string, i: number) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                            <Leaf className="h-4 w-4" />
                            {chain}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {mealPlan.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Generated Meal Plan ({mealPlan.length} meals)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  {mealPlan.slice(0, 10).map((entry, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Apple className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{entry.date} - {entry.meal_slot}</p>
                          {entry.notes && (
                            <p className="text-sm text-muted-foreground">{entry.notes}</p>
                          )}
                        </div>
                      </div>
                      {entry.meal_slot === 'try_bite' && (
                        <Badge variant="outline">Try Bite</Badge>
                      )}
                    </div>
                  ))}
                </div>

                <Button onClick={handleSavePlan} className="w-full" size="lg">
                  Save Plan to Calendar
                </Button>
              </CardContent>
            </Card>
          )}
    </div>
  );
}
