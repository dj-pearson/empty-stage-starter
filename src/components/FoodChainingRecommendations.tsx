import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, TrendingUp, CheckCircle, ChevronRight, Info, Plus, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FoodChainSuggestion {
  food_id: string;
  food_name: string;
  similarity_score: number;
  reasons: string[];
}

interface FoodWithSuccess {
  id: string;
  name: string;
  success_rate: number;
  total_attempts: number;
}

export function FoodChainingRecommendations() {
  const { activeKidId, foods, addFood } = useApp();
  const [successfulFoods, setSuccessfulFoods] = useState<FoodWithSuccess[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodWithSuccess | null>(null);
  const [chainSuggestions, setChainSuggestions] = useState<FoodChainSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (activeKidId) {
      loadSuccessfulFoods();
    }
  }, [activeKidId]);

  const loadSuccessfulFoods = async () => {
    try {
      setLoading(true);

      // Get foods with at least one successful or partial attempt
      const { data: attempts, error } = await supabase
        .from("food_attempts")
        .select(`
          food_id,
          outcome,
          foods (
            id,
            name
          )
        `)
        .eq("kid_id", activeKidId)
        .in("outcome", ["success", "partial"]);

      if (error) throw error;

      // Group by food and calculate success rate
      const foodStats: Map<string, { id: string; name: string; successes: number; total: number }> = new Map();

      attempts?.forEach((attempt: any) => {
        const foodId = attempt.food_id;
        const foodName = attempt.foods?.name || "Unknown";

        if (!foodStats.has(foodId)) {
          foodStats.set(foodId, {
            id: foodId,
            name: foodName,
            successes: 0,
            total: 0,
          });
        }

        const stats = foodStats.get(foodId)!;
        stats.total += 1;
        if (attempt.outcome === "success") {
          stats.successes += 1;
        }
      });

      // Convert to array and calculate success rate
      const foodArray: FoodWithSuccess[] = Array.from(foodStats.values())
        .map((stats) => ({
          id: stats.id,
          name: stats.name,
          success_rate: (stats.successes / stats.total) * 100,
          total_attempts: stats.total,
        }))
        .filter((f) => f.success_rate >= 50) // Only show foods with 50%+ success
        .sort((a, b) => b.success_rate - a.success_rate);

      setSuccessfulFoods(foodArray);

      // Auto-select first food if available
      if (foodArray.length > 0 && !selectedFood) {
        handleSelectFood(foodArray[0]);
      }
    } catch (error: any) {
      console.error("Error loading successful foods:", error);
      toast.error("Failed to load food success data");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFood = async (food: FoodWithSuccess) => {
    setSelectedFood(food);
    await loadChainSuggestions(food.id);
  };

  const loadChainSuggestions = async (sourceFoodId: string) => {
    try {
      setLoading(true);

      // Call the get_food_chain_suggestions function
      const { data, error } = await supabase.rpc("get_food_chain_suggestions", {
        source_food: sourceFoodId,
        limit_count: 10,
      });

      if (error) throw error;

      setChainSuggestions(data || []);

      // If no suggestions exist, try to generate them
      if (!data || data.length === 0) {
        await generateChainSuggestions(sourceFoodId);
      }
    } catch (error: any) {
      console.error("Error loading chain suggestions:", error);
      toast.error("Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  };

  const generateChainSuggestions = async (sourceFoodId: string) => {
    try {
      // Get properties of source food
      const { data: sourceProps, error: sourceError } = await supabase
        .from("food_properties")
        .select("*")
        .eq("food_id", sourceFoodId)
        .single();

      if (sourceError || !sourceProps) {
        toast.info("No recommendations available yet. Try this food a few more times!");
        return;
      }

      // Find similar foods based on properties
      const { data: similarFoods, error: similarError } = await supabase
        .from("food_properties")
        .select("food_id, foods(id, name)")
        .neq("food_id", sourceFoodId);

      if (similarError) throw similarError;

      // Calculate similarity and create suggestions
      const suggestions: any[] = [];

      for (const food of similarFoods || []) {
        const { data: score } = await supabase.rpc("calculate_food_similarity", {
          food1_id: sourceFoodId,
          food2_id: food.food_id,
        });

        if (score && score > 30) {
          // Only suggest if similarity > 30%
          const reasons: string[] = [];
          const { data: targetProps } = await supabase
            .from("food_properties")
            .select("*")
            .eq("food_id", food.food_id)
            .single();

          if (targetProps) {
            if (sourceProps.texture_primary === targetProps.texture_primary) {
              reasons.push("similar_texture");
            }
            if (sourceProps.food_category === targetProps.food_category) {
              reasons.push("same_category");
            }
            if (
              sourceProps.flavor_profile &&
              targetProps.flavor_profile &&
              sourceProps.flavor_profile.some((f: string) => targetProps.flavor_profile.includes(f))
            ) {
              reasons.push("similar_flavor");
            }
          }

          suggestions.push({
            source_food_id: sourceFoodId,
            target_food_id: food.food_id,
            similarity_score: score,
            chain_reason: reasons,
            recommended_order: suggestions.length + 1,
          });
        }
      }

      // Save suggestions to database
      if (suggestions.length > 0) {
        const { error: insertError } = await supabase
          .from("food_chain_suggestions")
          .insert(suggestions);

        if (insertError) throw insertError;

        // Reload suggestions
        await loadChainSuggestions(sourceFoodId);
        toast.success("Generated recommendations!");
      }
    } catch (error: any) {
      console.error("Error generating suggestions:", error);
    }
  };

  const handleAddToPantry = (suggestion: FoodChainSuggestion) => {
    // Check if food already exists
    const existingFood = foods.find((f) => f.id === suggestion.food_id);

    if (existingFood) {
      toast.info(`${suggestion.food_name} is already in your pantry!`);
      return;
    }

    // Add as a try bite to pantry
    addFood({
      name: suggestion.food_name,
      category: "snack", // Default category
      is_safe: false,
      is_try_bite: true,
      quantity: 0,
    });

    toast.success(`${suggestion.food_name} added to pantry as Try Bite!`, {
      description: "Add it to your grocery list to purchase"
    });
  };

  const getReasonBadge = (reason: string) => {
    const badges: Record<string, { label: string; color: string }> = {
      similar_texture: { label: "Similar Texture", color: "bg-blue-500" },
      same_category: { label: "Same Type", color: "bg-green-500" },
      similar_flavor: { label: "Similar Flavor", color: "bg-purple-500" },
    };

    const badge = badges[reason] || { label: reason, color: "bg-gray-500" };
    return (
      <Badge key={reason} className={`${badge.color} text-white text-xs`}>
        {badge.label}
      </Badge>
    );
  };

  if (!activeKidId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <Info className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Please select a child to see food recommendations</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Food Chaining Recommendations
          </CardTitle>
          <CardDescription>
            Based on foods your child loves, we suggest similar foods they might be ready to try
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: Successful Foods */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-safe-food" />
              Successful Foods
            </CardTitle>
            <CardDescription className="text-xs">
              Foods with 50%+ success rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && successfulFoods.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Loading...
              </div>
            ) : successfulFoods.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                <p className="mb-2">No successful food attempts yet!</p>
                <p className="text-xs">
                  Track some food attempts in the Success Tracker to get personalized
                  recommendations.
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {successfulFoods.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => handleSelectFood(food)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedFood?.id === food.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-muted"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-sm">{food.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {Math.round(food.success_rate)}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {food.total_attempts} {food.total_attempts === 1 ? "attempt" : "attempts"}
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Right: Chain Suggestions */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent" />
              Recommended Next Foods
            </CardTitle>
            <CardDescription className="text-xs">
              {selectedFood
                ? `Based on success with ${selectedFood.name}`
                : "Select a food to see recommendations"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedFood ? (
              <div className="text-center text-sm text-muted-foreground py-12">
                <ChevronRight className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Select a successful food to see recommendations</p>
              </div>
            ) : loading ? (
              <div className="text-center text-sm text-muted-foreground py-12">
                Generating recommendations...
              </div>
            ) : chainSuggestions.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-12">
                <p className="mb-2">No recommendations available yet.</p>
                <p className="text-xs">
                  Food properties are being analyzed. Try again in a moment!
                </p>
                <Button
                  onClick={() => loadChainSuggestions(selectedFood.id)}
                  variant="outline"
                  size="sm"
                  className="mt-4"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Recommendations
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {chainSuggestions.map((suggestion, index) => (
                    <Card
                      key={suggestion.food_id}
                      className="hover:shadow-md transition-shadow"
                    >
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">
                                #{index + 1}
                              </Badge>
                              <h4 className="font-semibold">{suggestion.food_name}</h4>
                            </div>
                            <div className="flex flex-wrap gap-1 mb-3">
                              {suggestion.reasons?.map((reason) => getReasonBadge(reason))}
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-2xl font-bold text-primary">
                              {Math.round(suggestion.similarity_score)}%
                            </div>
                            <p className="text-xs text-muted-foreground">Match</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleAddToPantry(suggestion)}
                            size="sm"
                            variant="default"
                            className="flex-1"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add to Pantry
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How Food Chaining Works</DialogTitle>
            <DialogDescription>
              <div className="space-y-4 mt-4">
                <p>
                  Food chaining helps introduce new foods by building on foods your child already
                  accepts.
                </p>
                <div className="space-y-2">
                  <h4 className="font-semibold">We analyze:</h4>
                  <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                    <li>Texture similarity (40% weight)</li>
                    <li>Food category (30% weight)</li>
                    <li>Flavor profiles (20% weight)</li>
                    <li>Temperature preferences (10% weight)</li>
                  </ul>
                </div>
                <p className="text-sm">
                  <strong>Example:</strong> If your child loves chicken nuggets (crunchy protein),
                  we might suggest fish sticks, then baked chicken fingers, gradually moving toward
                  plain baked chicken.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={() => setShowDetails(true)}>
          <Info className="h-4 w-4 mr-2" />
          How does this work?
        </Button>
      </div>
    </div>
  );
}
