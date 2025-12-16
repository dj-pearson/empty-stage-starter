// @ts-nocheck
import { useState } from "react";
import { Food, Recipe } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface RecipeBuilderProps {
  foods: Food[];
  editRecipe?: Recipe | null;
  onSave: (recipeData: any) => void;
  onCancel: () => void;
}

type AIRecipe = {
  name: string;
  description: string;
  instructions: string;
  prepTime: string;
  cookTime: string;
  servings: string;
  additionalIngredients: string[];
  tips: string;
};

export function RecipeBuilder({ foods, editRecipe, onSave, onCancel, kids, activeKidId }: RecipeBuilderProps & { kids?: Kid[], activeKidId?: string }) {
  const [formData, setFormData] = useState({
    name: editRecipe?.name || "",
    description: editRecipe?.description || "",
    image_url: editRecipe?.image_url || "",
    food_ids: editRecipe?.food_ids || [] as string[],
    assigned_kid_ids: editRecipe?.assigned_kid_ids || [] as string[],
    instructions: "",
    prepTime: "",
    cookTime: "",
    servings: "",
    additionalIngredients: "",
    tips: "",
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AIRecipe | null>(null);

  const toggleFood = (foodId: string) => {
    setFormData(prev => ({
      ...prev,
      food_ids: prev.food_ids.includes(foodId)
        ? prev.food_ids.filter(id => id !== foodId)
        : [...prev.food_ids, foodId],
    }));
  };

  const toggleKid = (kidId: string) => {
    setFormData(prev => ({
      ...prev,
      assigned_kid_ids: prev.assigned_kid_ids.includes(kidId)
        ? prev.assigned_kid_ids.filter(id => id !== kidId)
        : [...prev.assigned_kid_ids, kidId],
    }));
  };

  const handleAIGenerate = async () => {
    if (formData.food_ids.length === 0) {
      toast.error("Please select at least one ingredient first");
      return;
    }

    setIsGenerating(true);
    try {
      // Get active AI model
      const { data: aiSettings, error: aiError } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('is_active', true)
        .single();

      if (aiError || !aiSettings) {
        toast.error("No active AI model configured. Please set one up in Admin settings.");
        setIsGenerating(false);
        return;
      }

      // Get selected food names
      const selectedFoodNames = formData.food_ids
        .map(id => foods.find(f => f.id === id)?.name)
        .filter(Boolean);

      // Get active child's profile for personalized recipe
      const activeKid = activeKidId && kids ? kids.find(k => k.id === activeKidId) : null;

      const { data, error } = await invokeEdgeFunction('suggest-recipe', {
        body: {
          selectedFoodNames,
          aiModel: aiSettings,
          childProfile: activeKid || undefined
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const recipe = data.recipe;
      setAiSuggestion(recipe);
      
      // Pre-fill the form with AI suggestions
      setFormData(prev => ({
        ...prev,
        name: recipe.name || prev.name,
        description: recipe.description || prev.description,
        instructions: recipe.instructions || prev.instructions,
        prepTime: recipe.prepTime || prev.prepTime,
        cookTime: recipe.cookTime || prev.cookTime,
        servings: recipe.servings || prev.servings,
        additionalIngredients: recipe.additionalIngredients?.join(', ') || prev.additionalIngredients,
        tips: recipe.tips || prev.tips,
      }));

      toast.success("AI recipe generated! Review and adjust as needed.");
    } catch (error) {
      logger.error('Error generating recipe:', error);
      toast.error("Failed to generate recipe. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error("Please enter a recipe name");
      return;
    }

    if (formData.food_ids.length === 0) {
      toast.error("Please select at least one ingredient");
      return;
    }

    onSave(formData);
  };

  const safeFoods = foods.filter(f => f.is_safe);
  const selectedFoods = formData.food_ids
    .map(id => foods.find(f => f.id === id))
    .filter(Boolean);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Child Assignment */}
      {kids && kids.length > 0 && (
        <div className="space-y-3">
          <Label>Assign to Children (optional - leave empty for family-wide)</Label>
          <Card>
            <CardContent className="p-4 space-y-2">
              {kids.map((kid: any) => (
                <div key={kid.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`kid-${kid.id}`}
                    checked={formData.assigned_kid_ids.includes(kid.id)}
                    onCheckedChange={() => toggleKid(kid.id)}
                  />
                  <label
                    htmlFor={`kid-${kid.id}`}
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    {kid.name}
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Food Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Select Ingredients ({formData.food_ids.length} selected)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAIGenerate}
            disabled={isGenerating || formData.food_ids.length === 0}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Recipe with AI
              </>
            )}
          </Button>
        </div>

        {selectedFoods.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-lg">
            {selectedFoods.map((food) => food && (
              <Badge key={food.id} variant="secondary">
                {food.name}
              </Badge>
            ))}
          </div>
        )}

        <Card>
          <CardContent className="p-4 max-h-[200px] overflow-y-auto space-y-2">
            {safeFoods.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No safe foods available. Add some in the Pantry first.
              </p>
            ) : (
              safeFoods.map((food) => (
                <div key={food.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={food.id}
                    checked={formData.food_ids.includes(food.id)}
                    onCheckedChange={() => toggleFood(food.id)}
                  />
                  <label
                    htmlFor={food.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1 cursor-pointer"
                  >
                    {food.name}
                    <span className="text-muted-foreground ml-2">
                      ({food.category})
                    </span>
                  </label>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recipe Details */}
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Recipe Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Taco Night, Pizza Party"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of the recipe..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="image_url">Recipe Photo URL (optional)</Label>
          <Input
            id="image_url"
            value={formData.image_url}
            onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
            placeholder="https://example.com/recipe-photo.jpg"
            type="url"
          />
          <p className="text-xs text-muted-foreground">
            Add a link to a photo of the finished recipe
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="prepTime">Prep Time</Label>
            <Input
              id="prepTime"
              value={formData.prepTime}
              onChange={(e) => setFormData({ ...formData, prepTime: e.target.value })}
              placeholder="15 min"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cookTime">Cook Time</Label>
            <Input
              id="cookTime"
              value={formData.cookTime}
              onChange={(e) => setFormData({ ...formData, cookTime: e.target.value })}
              placeholder="30 min"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="servings">Servings</Label>
            <Input
              id="servings"
              value={formData.servings}
              onChange={(e) => setFormData({ ...formData, servings: e.target.value })}
              placeholder="4"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="instructions">Cooking Instructions</Label>
          <Textarea
            id="instructions"
            value={formData.instructions}
            onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
            placeholder="Step-by-step cooking instructions..."
            rows={6}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="additionalIngredients">Additional Ingredients Needed</Label>
          <Input
            id="additionalIngredients"
            value={formData.additionalIngredients}
            onChange={(e) => setFormData({ ...formData, additionalIngredients: e.target.value })}
            placeholder="e.g., salt, pepper, olive oil (comma separated)"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tips">Tips for Picky Eaters</Label>
          <Textarea
            id="tips"
            value={formData.tips}
            onChange={(e) => setFormData({ ...formData, tips: e.target.value })}
            placeholder="Helpful tips to make this recipe more appealing..."
            rows={3}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1">
          {editRecipe ? "Update Recipe" : "Create Recipe"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
