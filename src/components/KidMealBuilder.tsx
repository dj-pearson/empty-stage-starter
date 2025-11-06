import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Smile,
  Star,
  Trophy,
  Sparkles,
  Save,
  Plus,
  Trash2,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface MealCreation {
  id: string;
  creation_name: string;
  creation_type: string;
  foods: FoodPlacement[];
  plate_template: string;
  times_requested: number;
  stars_earned: number;
  kid_approved: boolean;
  created_at: string;
}

interface FoodPlacement {
  food_id: string;
  food_name: string;
  position: { x: number; y: number };
  section: string;
  size: string;
}

interface Achievement {
  id: string;
  achievement_name: string;
  achievement_description: string;
  icon_name: string;
  points_value: number;
}

const PLATE_TEMPLATES = [
  { id: "standard", name: "Round Plate", emoji: "🍽️", color: "bg-gray-100" },
  { id: "divided", name: "Divided Plate", emoji: "🍱", color: "bg-blue-50" },
  { id: "face", name: "Make a Face", emoji: "😊", color: "bg-yellow-50" },
  { id: "rainbow", name: "Rainbow", emoji: "🌈", color: "bg-purple-50" },
];

const PLATE_SECTIONS = {
  standard: ["center"],
  divided: ["protein", "vegetable", "carb", "fruit"],
  face: ["left_eye", "right_eye", "nose", "mouth", "hair"],
  rainbow: ["red", "orange", "yellow", "green", "blue", "purple"],
};

export function KidMealBuilder() {
  const { activeKidId, kids, foods, setActiveKidId } = useApp();
  const [creations, setCreations] = useState<MealCreation[]>([]);
  const [recentAchievements, setRecentAchievements] = useState<Achievement[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("standard");
  const [creationName, setCreationName] = useState("");
  const [selectedFoods, setSelectedFoods] = useState<FoodPlacement[]>([]);
  const [loading, setLoading] = useState(false);

  const activeKid = kids.find((k) => k.id === activeKidId);
  const totalStars = creations.reduce((sum, c) => sum + c.stars_earned, 0);

  useEffect(() => {
    if (activeKidId || kids.length > 0) {
      loadCreations();
      loadRecentAchievements();
    }
  }, [activeKidId, kids]);

  const loadCreations = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("kid_meal_creations")
        .select("*")
        .eq("kid_id", activeKidId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setCreations((data || []).map(creation => ({
        ...creation,
        foods: Array.isArray(creation.foods) ? creation.foods as any : []
      })));
    } catch (error: unknown) {
      logger.error("Error loading creations:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentAchievements = async () => {
    try {
      const { data, error } = await supabase
        .from("kid_achievements")
        .select("*")
        .eq("kid_id", activeKidId)
        .order("earned_at", { ascending: false })
        .limit(3);

      if (error) throw error;
      setRecentAchievements(data || []);
    } catch (error: unknown) {
      logger.error("Error loading achievements:", error);
    }
  };

  const handleAddFood = (food: any, section: string) => {
    // Check if food already exists in this section
    const existingIndex = selectedFoods.findIndex(
      (f) => f.food_id === food.id && f.section === section
    );

    if (existingIndex >= 0) {
      toast.info(`${food.name} is already in this section`);
      return;
    }

    const newFood: FoodPlacement = {
      food_id: food.id,
      food_name: food.name,
      position: { x: 50, y: 50 }, // Center of section
      section,
      size: "medium",
    };

    setSelectedFoods([...selectedFoods, newFood]);
  };

  const handleRemoveFood = (index: number) => {
    setSelectedFoods(selectedFoods.filter((_, i) => i !== index));
  };

  const handleSaveCreation = async () => {
    if (!creationName.trim()) {
      toast.error("Please give your meal a name!");
      return;
    }

    if (selectedFoods.length === 0) {
      toast.error("Add at least one food to your plate!");
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.from("kid_meal_creations").insert([
        {
          kid_id: activeKidId,
          creation_name: creationName,
          creation_type: selectedTemplate,
          foods: selectedFoods as any,
          plate_template: selectedTemplate,
          kid_approved: true,
          stars_earned: Math.min(selectedFoods.length, 5), // Earn stars for foods added
        },
      ]);

      if (error) throw error;

      toast.success(`🎉 ${creationName} saved! +${Math.min(selectedFoods.length, 5)} stars!`);
      setShowBuilder(false);
      resetBuilder();
      loadCreations();
      loadRecentAchievements();
    } catch (error: unknown) {
      logger.error("Error saving creation:", error);
      toast.error("Failed to save meal");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestMeal = async (creationId: string) => {
    try {
      const { error } = await supabase
        .from("kid_meal_creations")
        .update({
          times_requested: creations.find((c) => c.id === creationId)!.times_requested + 1,
          last_requested_at: new Date().toISOString(),
        })
        .eq("id", creationId);

      if (error) throw error;

      toast.success("Added to meal requests! ⭐");
      loadCreations();
    } catch (error: unknown) {
      logger.error("Error requesting meal:", error);
      toast.error("Failed to request meal");
    }
  };

  const handleDeleteCreation = async (creationId: string) => {
    try {
      const { error } = await supabase
        .from("kid_meal_creations")
        .delete()
        .eq("id", creationId);

      if (error) throw error;

      toast.success("Meal deleted");
      loadCreations();
    } catch (error: unknown) {
      logger.error("Error deleting creation:", error);
      toast.error("Failed to delete meal");
    }
  };

  const resetBuilder = () => {
    setCreationName("");
    setSelectedTemplate("standard");
    setSelectedFoods([]);
  };

  const safeFoods = foods.filter((f) => f.is_safe);
  const sections = PLATE_SECTIONS[selectedTemplate as keyof typeof PLATE_SECTIONS] || ["center"];

  if (!activeKidId) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <Smile className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Please select a child to start building meals!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - Kid-Friendly */}
      <Card className="bg-gradient-to-br from-yellow-100 to-orange-100 dark:from-yellow-900 dark:to-orange-900 border-yellow-300">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Smile className="h-6 w-6" />
                {activeKid?.name}'s Meal Builder
              </CardTitle>
              <CardDescription className="text-base">
                Create fun meals and earn stars! ⭐
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2">
                <Star className="h-6 w-6 text-yellow-500 fill-yellow-500" />
                <span className="text-3xl font-bold">{totalStars}</span>
              </div>
              <p className="text-sm text-muted-foreground">Total Stars</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Recent Achievements */}
      {recentAchievements.length > 0 && (
        <Card className="border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900 dark:to-pink-900">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Recent Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 overflow-x-auto">
              {recentAchievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className="flex flex-col items-center min-w-[140px] p-4 bg-white dark:bg-gray-800 rounded-xl border-2 border-yellow-300"
                >
                  <div className="text-4xl mb-2">🏆</div>
                  <p className="text-sm font-bold text-center">{achievement.achievement_name}</p>
                  <Badge className="mt-2 bg-yellow-500 text-white">
                    +{achievement.points_value} pts
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-center">
        <Button
          onClick={() => setShowBuilder(true)}
          size="lg"
          className="text-lg h-16 px-8 bg-gradient-to-r from-primary to-accent hover:opacity-90"
        >
          <Plus className="h-6 w-6 mr-2" />
          Create New Meal
        </Button>
      </div>

      {/* My Creations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            My Favorite Meals
          </CardTitle>
          <CardDescription>Meals you've created</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && creations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : creations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Smile className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">No meals created yet!</p>
              <p>Click "Create New Meal" to get started</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {creations.map((creation) => (
                <Card key={creation.id} className="hover:shadow-lg transition-all">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg mb-1">{creation.creation_name}</h3>
                        <Badge variant="outline" className="mb-2">
                          {PLATE_TEMPLATES.find((t) => t.id === creation.plate_template)?.emoji}{" "}
                          {PLATE_TEMPLATES.find((t) => t.id === creation.plate_template)?.name}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                        <span className="font-bold text-xl">{creation.stars_earned}</span>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <p className="text-sm font-medium">Foods:</p>
                      <div className="flex flex-wrap gap-1">
                        {creation.foods.slice(0, 5).map((food, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {food.food_name}
                          </Badge>
                        ))}
                        {creation.foods.length > 5 && (
                          <Badge variant="secondary" className="text-xs">
                            +{creation.foods.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>

                    {creation.times_requested > 0 && (
                      <div className="mb-4">
                        <Badge className="bg-purple-500 text-white">
                          Requested {creation.times_requested} {creation.times_requested === 1 ? "time" : "times"}
                        </Badge>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleRequestMeal(creation.id)}
                        className="flex-1"
                      >
                        <ThumbsUp className="h-4 w-4 mr-1" />
                        I Want This!
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteCreation(creation.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meal Builder Dialog */}
      <Dialog open={showBuilder} onOpenChange={setShowBuilder}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Create Your Meal
            </DialogTitle>
            <DialogDescription>
              Choose a plate and add your favorite foods! Earn stars for being creative!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Meal Name */}
            <div className="space-y-2">
              <Label className="text-lg">Give your meal a fun name!</Label>
              <Input
                value={creationName}
                onChange={(e) => setCreationName(e.target.value)}
                placeholder="My Super Awesome Dinner"
                className="text-lg"
              />
            </div>

            {/* Plate Template Selection */}
            <div className="space-y-2">
              <Label className="text-lg">Choose your plate:</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {PLATE_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => {
                      setSelectedTemplate(template.id);
                      setSelectedFoods([]); // Reset foods when changing template
                    }}
                    className={cn(
                      "p-4 rounded-xl border-2 transition-all hover:scale-105",
                      selectedTemplate === template.id
                        ? "border-primary bg-primary/10 shadow-lg"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="text-4xl mb-2">{template.emoji}</div>
                    <p className="font-semibold text-sm">{template.name}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Food Selection by Section */}
            <div className="space-y-4">
              <Label className="text-lg">Add foods to your plate:</Label>
              {sections.map((section) => (
                <Card key={section}>
                  <CardHeader>
                    <CardTitle className="text-sm capitalize">
                      {section.replace("_", " ")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {selectedFoods
                        .filter((f) => f.section === section)
                        .map((food, idx) => (
                          <Badge
                            key={idx}
                            className="bg-safe-food text-white flex items-center gap-1"
                          >
                            {food.food_name}
                            <button
                              onClick={() =>
                                handleRemoveFood(selectedFoods.indexOf(food))
                              }
                              className="ml-1 hover:text-red-300"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                    </div>
                    <ScrollArea className="h-24">
                      <div className="flex flex-wrap gap-2">
                        {safeFoods
                          .filter(
                            (f) =>
                              !selectedFoods.some(
                                (sf) => sf.food_id === f.id && sf.section === section
                              )
                          )
                          .map((food) => (
                            <Button
                              key={food.id}
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddFood(food, section)}
                            >
                              + {food.name}
                            </Button>
                          ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Preview */}
            {selectedFoods.length > 0 && (
              <Card className="bg-gradient-to-br from-primary/5 to-accent/5">
                <CardHeader>
                  <CardTitle className="text-sm">Your Meal Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-2">
                    <strong>Foods added:</strong> {selectedFoods.length}
                  </p>
                  <p className="text-sm mb-2">
                    <strong>Stars to earn:</strong>{" "}
                    <Star className="h-4 w-4 inline text-yellow-500 fill-yellow-500" />{" "}
                    {Math.min(selectedFoods.length, 5)}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedFoods.map((food, idx) => (
                      <Badge key={idx} variant="secondary">
                        {food.food_name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowBuilder(false);
                resetBuilder();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveCreation} disabled={loading} size="lg">
              <Save className="h-5 w-5 mr-2" />
              Save My Meal!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
