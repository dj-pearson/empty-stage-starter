import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sparkles, ChevronDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { Recipe, Food, Kid } from "@/types";
import { cn } from "@/lib/utils";
import { IngredientSelector } from "./IngredientSelector";
import { IngredientRow, type IngredientRowData } from "./IngredientRow";
import { InstructionStepBuilder } from "./InstructionStepBuilder";
import { invokeEdgeFunction } from "@/lib/edge-functions";

interface EnhancedRecipeBuilderProps {
  foods: Food[];
  kids: Kid[];
  activeKidId: string | null;
  editRecipe?: Recipe | null;
  onSave: (recipe: Partial<Recipe>) => Promise<void>;
  onCancel: () => void;
}

const COMMON_TAGS = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "quick",
  "healthy",
  "comfort food",
  "freezer-friendly",
  "one-pot",
  "no-cook",
  "vegetarian",
  "gluten-free",
  "dairy-free",
];

function generateIngredientId() {
  return `ing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function EnhancedRecipeBuilder({
  foods,
  kids,
  activeKidId,
  editRecipe,
  onSave,
  onCancel,
}: EnhancedRecipeBuilderProps) {
  // Basic info
  const [name, setName] = useState(editRecipe?.name ?? "");
  const [description, setDescription] = useState(editRecipe?.description ?? "");
  const [imageUrl, setImageUrl] = useState(editRecipe?.image_url ?? "");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    editRecipe?.difficulty_level ?? "easy"
  );
  const [tags, setTags] = useState<string[]>(editRecipe?.tags ?? []);
  const [tagInput, setTagInput] = useState("");

  // Ingredients
  const [ingredients, setIngredients] = useState<IngredientRowData[]>(() => {
    if (editRecipe?.food_ids && editRecipe.food_ids.length > 0) {
      return editRecipe.food_ids.map((foodId) => {
        const food = foods.find((f) => f.id === foodId);
        return {
          id: generateIngredientId(),
          food_id: foodId,
          name: food?.name ?? "Unknown",
          quantity: "",
          unit: "",
          prepNotes: "",
          isOptional: false,
        };
      });
    }
    return [];
  });

  // Instructions
  const [steps, setSteps] = useState<string[]>(() => {
    if (!editRecipe?.instructions) return [""];
    try {
      const parsed = JSON.parse(editRecipe.instructions);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Split text into steps
      const lines = editRecipe.instructions
        .split(/\r?\n/)
        .map((l) => l.replace(/^\d+[.)]\s*/, "").trim())
        .filter((l) => l.length > 0);
      if (lines.length > 0) return lines;
    }
    return [editRecipe.instructions];
  });

  // Additional info
  const [prepTime, setPrepTime] = useState(editRecipe?.prepTime ?? "");
  const [cookTime, setCookTime] = useState(editRecipe?.cookTime ?? "");
  const [servings, setServings] = useState(editRecipe?.servings ?? "4");
  const [tips, setTips] = useState(editRecipe?.tips ?? "");
  const [sourceUrl, setSourceUrl] = useState(editRecipe?.source_url ?? "");
  const [selectedKids, setSelectedKids] = useState<string[]>(
    editRecipe?.assigned_kid_ids ?? (activeKidId ? [activeKidId] : [])
  );

  // Section open states
  const [sectionsOpen, setSectionsOpen] = useState({
    basic: true,
    ingredients: true,
    instructions: true,
    additional: false,
    ai: false,
  });

  // AI
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const toggleSection = (key: keyof typeof sectionsOpen) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Tag management
  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // Ingredient management
  const handleSelectFood = useCallback((food: Food) => {
    setIngredients((prev) => [
      ...prev,
      {
        id: generateIngredientId(),
        food_id: food.id,
        name: food.name,
        quantity: "",
        unit: "",
        prepNotes: "",
        isOptional: false,
      },
    ]);
  }, []);

  const handleAddCustomIngredient = useCallback((customName: string) => {
    setIngredients((prev) => [
      ...prev,
      {
        id: generateIngredientId(),
        name: customName,
        quantity: "",
        unit: "",
        prepNotes: "",
        isOptional: false,
      },
    ]);
  }, []);

  const updateIngredient = (id: string, updates: Partial<IngredientRowData>) => {
    setIngredients((prev) =>
      prev.map((ing) => (ing.id === id ? { ...ing, ...updates } : ing))
    );
  };

  const removeIngredient = (id: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  };

  // Kid toggle
  const toggleKid = (kidId: string) => {
    setSelectedKids((prev) =>
      prev.includes(kidId)
        ? prev.filter((id) => id !== kidId)
        : [...prev, kidId]
    );
  };

  // AI generation
  const handleAIGenerate = async () => {
    if (!name.trim()) {
      toast.error("Enter a recipe name first");
      return;
    }

    setIsGenerating(true);
    try {
      const activeKid = kids.find((k) => k.id === activeKidId);
      const { data, error } = await invokeEdgeFunction("suggest-recipe", {
        body: {
          recipeName: name,
          availableFoods: foods.map((f) => ({ id: f.id, name: f.name, category: f.category })),
          childProfile: activeKid,
        },
      });

      if (error) throw error;

      if (data?.recipe) {
        const r = data.recipe;
        if (r.description) setDescription(r.description);
        if (r.instructions) {
          const stepsArr = Array.isArray(r.instructions)
            ? r.instructions
            : r.instructions
                .split(/\r?\n/)
                .map((l: string) => l.replace(/^\d+[.)]\s*/, "").trim())
                .filter((l: string) => l.length > 0);
          setSteps(stepsArr);
        }
        if (r.food_ids && Array.isArray(r.food_ids)) {
          const newIngredients = r.food_ids.map((foodId: string) => {
            const food = foods.find((f) => f.id === foodId);
            return {
              id: generateIngredientId(),
              food_id: foodId,
              name: food?.name ?? "Unknown",
              quantity: "",
              unit: "",
              prepNotes: "",
              isOptional: false,
            };
          });
          setIngredients(newIngredients);
        }
        if (r.prepTime) setPrepTime(r.prepTime);
        if (r.cookTime) setCookTime(r.cookTime);
        if (r.tips) setTips(r.tips);
        if (r.difficulty) setDifficulty(r.difficulty);

        toast.success("AI generated recipe details!");
      }
    } catch (error) {
      logger.error("AI recipe generation failed:", error);
      toast.error("Failed to generate recipe with AI");
    } finally {
      setIsGenerating(false);
    }
  };

  // Save
  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Recipe name is required");
      return;
    }

    setIsSaving(true);
    try {
      const foodIds = ingredients
        .filter((ing) => ing.food_id)
        .map((ing) => ing.food_id!);

      const additionalIngredients = ingredients
        .filter((ing) => !ing.food_id)
        .map((ing) => {
          let str = ing.name;
          if (ing.quantity) str = `${ing.quantity} ${ing.unit} ${str}`;
          if (ing.prepNotes) str += ` (${ing.prepNotes})`;
          if (ing.isOptional) str += " [optional]";
          return str;
        })
        .join(", ");

      // Store steps as JSON array for structured display
      const instructionsStr =
        steps.filter((s) => s.trim()).length > 0
          ? JSON.stringify(steps.filter((s) => s.trim()))
          : undefined;

      const recipeData: Partial<Recipe> & { additionalIngredients?: string } = {
        name: name.trim(),
        description: description.trim() || undefined,
        food_ids: foodIds,
        instructions: instructionsStr,
        prepTime: prepTime || undefined,
        cookTime: cookTime || undefined,
        servings: servings || undefined,
        tips: tips.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
        source_url: sourceUrl.trim() || undefined,
        difficulty_level: difficulty,
        tags: tags.length > 0 ? tags : undefined,
        assigned_kid_ids: selectedKids.length > 0 ? selectedKids : undefined,
        additionalIngredients: additionalIngredients || undefined,
      };

      // Calculate total time
      const prep = parseInt(prepTime || "0");
      const cook = parseInt(cookTime || "0");
      if (prep + cook > 0) {
        recipeData.total_time_minutes = prep + cook;
      }

      await onSave(recipeData);
    } catch (error) {
      logger.error("Error saving recipe:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedFoodIds = ingredients
    .filter((ing) => ing.food_id)
    .map((ing) => ing.food_id!);

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Section 1: Basic Info */}
      <Collapsible open={sectionsOpen.basic} onOpenChange={() => toggleSection("basic")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 font-medium text-sm">
          <span>Basic Info</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", sectionsOpen.basic && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div>
            <Label htmlFor="recipe-name">Name *</Label>
            <Input
              id="recipe-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kid-Friendly Chicken Stir Fry"
            />
          </div>

          <div>
            <Label htmlFor="recipe-desc">Description</Label>
            <Textarea
              id="recipe-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A quick and healthy dinner..."
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="recipe-img">Image URL</Label>
            <Input
              id="recipe-img"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          {/* Difficulty */}
          <div>
            <Label>Difficulty</Label>
            <div className="flex gap-2 mt-1">
              {(["easy", "medium", "hard"] as const).map((level) => (
                <Button
                  key={level}
                  type="button"
                  variant={difficulty === level ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDifficulty(level)}
                  className={cn(
                    "capitalize flex-1",
                    difficulty === level && level === "easy" && "bg-green-600 hover:bg-green-700",
                    difficulty === level && level === "medium" && "bg-yellow-600 hover:bg-yellow-700",
                    difficulty === level && level === "hard" && "bg-red-600 hover:bg-red-700"
                  )}
                >
                  {level}
                </Button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag..."
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {COMMON_TAGS.filter((t) => !tags.includes(t))
                .slice(0, 6)
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="text-[10px] px-2 py-0.5 rounded-full border border-dashed text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    onClick={() => addTag(tag)}
                  >
                    + {tag}
                  </button>
                ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Section 2: Ingredients */}
      <Collapsible open={sectionsOpen.ingredients} onOpenChange={() => toggleSection("ingredients")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 font-medium text-sm">
          <span>Ingredients ({ingredients.length})</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", sectionsOpen.ingredients && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <IngredientSelector
            foods={foods}
            selectedFoodIds={selectedFoodIds}
            onSelectFood={handleSelectFood}
            onAddCustom={handleAddCustomIngredient}
          />

          {ingredients.length > 0 && (
            <div className="border rounded-md p-2 space-y-0.5">
              {ingredients.map((ing) => (
                <IngredientRow
                  key={ing.id}
                  ingredient={ing}
                  onUpdate={(updates) => updateIngredient(ing.id, updates)}
                  onRemove={() => removeIngredient(ing.id)}
                />
              ))}
            </div>
          )}

          {ingredients.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No ingredients added. Use the button above to search and add from your pantry.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Section 3: Instructions */}
      <Collapsible open={sectionsOpen.instructions} onOpenChange={() => toggleSection("instructions")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 font-medium text-sm">
          <span>Instructions ({steps.filter((s) => s.trim()).length} steps)</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", sectionsOpen.instructions && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <InstructionStepBuilder steps={steps} onChange={setSteps} />
        </CollapsibleContent>
      </Collapsible>

      {/* Section 4: Additional Info */}
      <Collapsible open={sectionsOpen.additional} onOpenChange={() => toggleSection("additional")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 font-medium text-sm">
          <span>Additional Info</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", sectionsOpen.additional && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="prep-time">Prep (min)</Label>
              <Input
                id="prep-time"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="15"
                type="number"
              />
            </div>
            <div>
              <Label htmlFor="cook-time">Cook (min)</Label>
              <Input
                id="cook-time"
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                placeholder="30"
                type="number"
              />
            </div>
            <div>
              <Label htmlFor="servings">Servings</Label>
              <Input
                id="servings"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="4"
                type="number"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="tips">Tips for Picky Eaters</Label>
            <Textarea
              id="tips"
              value={tips}
              onChange={(e) => setTips(e.target.value)}
              placeholder="Try serving the sauce on the side..."
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="source-url">Source URL</Label>
            <Input
              id="source-url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://recipe-site.com/..."
            />
          </div>

          {/* Kid assignment */}
          {kids.length > 0 && (
            <div>
              <Label>Assign to Kids</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {kids.map((kid) => (
                  <label key={kid.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedKids.includes(kid.id)}
                      onCheckedChange={() => toggleKid(kid.id)}
                    />
                    <span className="text-sm">{kid.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Section 5: AI Generation */}
      <Collapsible open={sectionsOpen.ai} onOpenChange={() => toggleSection("ai")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 font-medium text-sm">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-purple-500" />
            AI Assistant
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", sectionsOpen.ai && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <p className="text-sm text-muted-foreground mb-3">
            Enter a recipe name above and let AI fill in the details -- ingredients, instructions, and tips.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={handleAIGenerate}
            disabled={isGenerating || !name.trim()}
            className="w-full gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate with AI
              </>
            )}
          </Button>
        </CollapsibleContent>
      </Collapsible>

      {/* Action buttons */}
      <div className="flex gap-2 pt-4 border-t sticky bottom-0 bg-background pb-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSaving || !name.trim()}
          className="flex-1"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving...
            </>
          ) : editRecipe ? (
            "Update Recipe"
          ) : (
            "Create Recipe"
          )}
        </Button>
      </div>
    </div>
  );
}
