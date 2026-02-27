import { useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Star,
  Clock,
  Users,
  ChefHat,
  ShoppingCart,
  CalendarPlus,
  Heart,
  Pencil,
  Trash2,
  MoreHorizontal,
  FolderPlus,
  CookingPot,
  ExternalLink,
  Minus,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Recipe, Food, Kid, MealSlot } from "@/types";
import { cn } from "@/lib/utils";
import { CookMode } from "./CookMode";
import { AddToPlannerPopover } from "./AddToPlannerPopover";
import { calculateRecipeNutrition, perServingNutrition } from "@/lib/nutritionCalculator";
import { RecipeShareButton } from "./RecipeShareButton";
import { Helmet } from "react-helmet-async";

interface RecipeDetailViewProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: Food[];
  kids: Kid[];
  activeKidId: string | null;
  onUpdateRecipe: (id: string, updates: Partial<Recipe>) => void;
  onDeleteRecipe: (id: string) => void;
  onEdit: (recipe: Recipe) => void;
  onAddToGrocery: (recipe: Recipe) => void;
  onAddToPlan: (entries: { kid_id: string; date: string; meal_slot: MealSlot; food_id: string; result: null }[]) => void;
  onAddToCollections?: (recipe: Recipe) => void;
}

function StarRating({
  rating,
  onRate,
}: {
  rating: number;
  onRate: (rating: number) => void;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          className="p-0.5"
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onRate(star)}
          aria-label={`Rate ${star} stars`}
        >
          <Star
            className={cn(
              "h-5 w-5 transition-colors",
              star <= (hover || rating)
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground/30"
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function RecipeDetailView({
  recipe,
  open,
  onOpenChange,
  foods,
  kids,
  activeKidId,
  onUpdateRecipe,
  onDeleteRecipe,
  onEdit,
  onAddToGrocery,
  onAddToPlan,
  onAddToCollections,
}: RecipeDetailViewProps) {
  const [showCookMode, setShowCookMode] = useState(false);
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());

  if (!recipe) return null;

  const ogDescription = recipe.description || `${recipe.name} - A family-friendly recipe on EatPal`;
  const ogImage = recipe.image_url || "https://tryeatpal.com/og-recipe-default.png";
  const ogUrl = `${window.location.origin}/recipes/${recipe.id}`;

  const recipeFoods = recipe.food_ids
    .map((id) => foods.find((f) => f.id === id))
    .filter(Boolean) as Food[];

  const totalTime =
    recipe.total_time_minutes ||
    (parseInt(recipe.prepTime || "0") + parseInt(recipe.cookTime || "0"));

  const baseServings = parseInt(recipe.servings || "4");

  // Auto-calculate nutrition from food ingredients when recipe has no manual nutrition_info
  const autoNutrition = useMemo(() => {
    if (recipe.nutrition_info) return null; // Manual data takes precedence
    const total = calculateRecipeNutrition(recipe, foods);
    if (!total) return null;
    return perServingNutrition(total, baseServings);
  }, [recipe, foods, baseServings]);

  // Effective nutrition: manual data or auto-calculated
  const effectiveNutrition = recipe.nutrition_info || (autoNutrition ? {
    calories: autoNutrition.calories,
    protein_g: autoNutrition.protein_g,
    carbs_g: autoNutrition.carbs_g,
    fat_g: autoNutrition.fat_g,
    fiber_g: autoNutrition.fiber_g,
  } : null);

  const difficultyColors: Record<string, string> = {
    easy: "bg-green-50 text-green-700 border-green-200",
    medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
    hard: "bg-red-50 text-red-700 border-red-200",
  };

  const handleRate = (rating: number) => {
    onUpdateRecipe(recipe.id, { rating });
    toast.success(`Rated ${rating} star${rating !== 1 ? "s" : ""}`);
  };

  const handleIMadeIt = () => {
    const newTimesMade = (recipe.times_made ?? 0) + 1;
    onUpdateRecipe(recipe.id, {
      times_made: newTimesMade,
      last_made_date: new Date().toISOString().split("T")[0],
    });
    toast.success("Nice! Recipe logged as made", {
      description: `You've made "${recipe.name}" ${newTimesMade} time${newTimesMade !== 1 ? "s" : ""}`,
    });
  };

  const handleToggleFavorite = () => {
    onUpdateRecipe(recipe.id, { is_favorite: !recipe.is_favorite });
    toast.success(recipe.is_favorite ? "Removed from favorites" : "Added to favorites");
  };

  const toggleIngredient = (foodId: string) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(foodId)) {
        next.delete(foodId);
      } else {
        next.add(foodId);
      }
      return next;
    });
  };

  // Parse instructions into steps for display
  const instructionSteps = (() => {
    if (!recipe.instructions) return [];
    try {
      const parsed = JSON.parse(recipe.instructions);
      if (Array.isArray(parsed)) return parsed.filter((s: string) => s.trim());
    } catch {
      // plain text
    }
    return recipe.instructions
      .split(/\r?\n/)
      .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
      .filter((line) => line.length > 0);
  })();

  if (showCookMode && recipe.instructions) {
    return (
      <CookMode
        recipeName={recipe.name}
        instructions={recipe.instructions}
        onClose={() => setShowCookMode(false)}
      />
    );
  }

  return (
    <>
    {open && (
      <Helmet>
        <meta property="og:title" content={recipe.name} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={ogUrl} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={recipe.name} />
        <meta name="twitter:description" content={ogDescription} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>
    )}
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[600px] md:max-w-[700px] p-0 overflow-hidden"
      >
        <ScrollArea className="h-full">
          <div className="flex flex-col">
            {/* Hero image */}
            {recipe.image_url ? (
              <div className="relative w-full h-48 md:h-56">
                <img
                  src={recipe.image_url}
                  alt={recipe.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4">
                  <h2 className="text-xl font-bold text-white line-clamp-2">
                    {recipe.name}
                  </h2>
                </div>
                {/* Favorite button */}
                <button
                  className="absolute top-3 right-12 p-1.5 rounded-full bg-black/30 backdrop-blur-sm"
                  onClick={handleToggleFavorite}
                  aria-label={recipe.is_favorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <Heart
                    className={cn(
                      "h-5 w-5",
                      recipe.is_favorite
                        ? "fill-red-500 text-red-500"
                        : "text-white"
                    )}
                  />
                </button>
              </div>
            ) : (
              <SheetHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-xl">{recipe.name}</SheetTitle>
                  <button
                    onClick={handleToggleFavorite}
                    aria-label={recipe.is_favorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Heart
                      className={cn(
                        "h-5 w-5",
                        recipe.is_favorite
                          ? "fill-red-500 text-red-500"
                          : "text-muted-foreground"
                      )}
                    />
                  </button>
                </div>
                <SheetDescription>{recipe.description}</SheetDescription>
              </SheetHeader>
            )}

            <div className="p-4 space-y-4">
              {/* Description (if image hero was shown) */}
              {recipe.image_url && recipe.description && (
                <p className="text-sm text-muted-foreground">
                  {recipe.description}
                </p>
              )}

              {/* Rating */}
              <div className="flex items-center gap-3">
                <StarRating rating={recipe.rating ?? 0} onRate={handleRate} />
                {(recipe.rating ?? 0) > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {recipe.rating?.toFixed(1)}
                  </span>
                )}
              </div>

              {/* Quick action bar */}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={handleIMadeIt} className="gap-1.5">
                  <ChefHat className="h-4 w-4" />
                  I Made It
                  {(recipe.times_made ?? 0) > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 text-xs">
                      {recipe.times_made}x
                    </Badge>
                  )}
                </Button>

                <AddToPlannerPopover
                  recipe={recipe}
                  kids={kids}
                  activeKidId={activeKidId}
                  onAddToPlan={onAddToPlan}
                  trigger={
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <CalendarPlus className="h-4 w-4" />
                      Plan
                    </Button>
                  }
                />

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onAddToGrocery(recipe)}
                >
                  <ShoppingCart className="h-4 w-4" />
                  Grocery
                </Button>

                <RecipeShareButton recipe={recipe} />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      onOpenChange(false);
                      setTimeout(() => onEdit(recipe), 200);
                    }}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    {onAddToCollections && (
                      <DropdownMenuItem onClick={() => onAddToCollections(recipe)}>
                        <FolderPlus className="h-4 w-4 mr-2" />
                        Add to Collection
                      </DropdownMenuItem>
                    )}
                    {recipe.source_url && (
                      <DropdownMenuItem asChild>
                        <a href={recipe.source_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View Source
                        </a>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        onDeleteRecipe(recipe.id);
                        onOpenChange(false);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap gap-4 text-sm">
                {recipe.difficulty_level && (
                  <Badge
                    variant="outline"
                    className={cn(difficultyColors[recipe.difficulty_level])}
                  >
                    {recipe.difficulty_level}
                  </Badge>
                )}
                {recipe.prepTime && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Prep: {recipe.prepTime}</span>
                  </div>
                )}
                {recipe.cookTime && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Cook: {recipe.cookTime}</span>
                  </div>
                )}
                {totalTime > 0 && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="font-medium">{totalTime} min total</span>
                  </div>
                )}
                {recipe.servings && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{recipe.servings} servings</span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {recipe.tags && recipe.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {recipe.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Tabbed content */}
              <Tabs defaultValue="ingredients" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="ingredients" className="flex-1">
                    Ingredients
                  </TabsTrigger>
                  <TabsTrigger value="instructions" className="flex-1">
                    Instructions
                  </TabsTrigger>
                  <TabsTrigger value="nutrition" className="flex-1">
                    Nutrition
                  </TabsTrigger>
                </TabsList>

                {/* Ingredients tab */}
                <TabsContent value="ingredients" className="space-y-3 mt-3">
                  {/* Scaling control */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Servings: {Math.round(baseServings * servingMultiplier)}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          setServingMultiplier((prev) => Math.max(0.5, prev - 0.5))
                        }
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm w-8 text-center">
                        {servingMultiplier}x
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          setServingMultiplier((prev) => Math.min(5, prev + 0.5))
                        }
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Ingredient checklist */}
                  <div className="space-y-1">
                    {recipeFoods.map((food) => (
                      <label
                        key={food.id}
                        className={cn(
                          "flex items-center gap-3 py-2 px-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors",
                          checkedIngredients.has(food.id) && "opacity-50"
                        )}
                      >
                        <Checkbox
                          checked={checkedIngredients.has(food.id)}
                          onCheckedChange={() => toggleIngredient(food.id)}
                        />
                        <span
                          className={cn(
                            "text-sm flex-1",
                            checkedIngredients.has(food.id) && "line-through"
                          )}
                        >
                          {food.name}
                        </span>
                        {food.quantity !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            stock: {food.quantity}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>

                  {recipe.additionalIngredients && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Also needed:
                      </p>
                      <p className="text-sm">{recipe.additionalIngredients}</p>
                    </div>
                  )}
                </TabsContent>

                {/* Instructions tab */}
                <TabsContent value="instructions" className="space-y-3 mt-3">
                  {instructionSteps.length > 0 ? (
                    <>
                      <Button
                        onClick={() => setShowCookMode(true)}
                        className="w-full gap-2"
                        variant="outline"
                      >
                        <CookingPot className="h-4 w-4" />
                        Start Cook Mode
                      </Button>
                      <div className="space-y-3">
                        {instructionSteps.map((step, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                              {i + 1}
                            </div>
                            <p className="text-sm pt-0.5">{step}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No instructions added yet. Edit this recipe to add steps.
                    </p>
                  )}
                </TabsContent>

                {/* Nutrition tab */}
                <TabsContent value="nutrition" className="mt-3">
                  {effectiveNutrition ? (
                    <div className="space-y-3">
                      {autoNutrition?.isPartial && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                          <p className="text-xs">
                            Partial data — {autoNutrition.foodsWithData} of {autoNutrition.totalFoods} ingredients have nutrition info
                          </p>
                        </div>
                      )}
                      {autoNutrition && !autoNutrition.isPartial && (
                        <p className="text-xs text-muted-foreground">
                          Auto-calculated per serving ({baseServings} servings)
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        {effectiveNutrition.calories != null && (
                          <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                            <p className="text-xs text-muted-foreground">Calories</p>
                            <p className="text-lg font-bold">{effectiveNutrition.calories}</p>
                          </div>
                        )}
                        {effectiveNutrition.protein_g != null && (
                          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                            <p className="text-xs text-muted-foreground">Protein</p>
                            <p className="text-lg font-bold">{effectiveNutrition.protein_g}g</p>
                          </div>
                        )}
                        {effectiveNutrition.carbs_g != null && (
                          <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
                            <p className="text-xs text-muted-foreground">Carbs</p>
                            <p className="text-lg font-bold">{effectiveNutrition.carbs_g}g</p>
                          </div>
                        )}
                        {effectiveNutrition.fat_g != null && (
                          <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20">
                            <p className="text-xs text-muted-foreground">Fat</p>
                            <p className="text-lg font-bold">{effectiveNutrition.fat_g}g</p>
                          </div>
                        )}
                        {effectiveNutrition.fiber_g != null && (
                          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                            <p className="text-xs text-muted-foreground">Fiber</p>
                            <p className="text-lg font-bold">{effectiveNutrition.fiber_g}g</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No nutrition data available. Add nutrition info to food items to see auto-calculated totals.
                    </p>
                  )}
                </TabsContent>
              </Tabs>

              {/* Tips / Notes section */}
              {recipe.tips && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Picky Eater Tips
                  </p>
                  <p className="text-sm">{recipe.tips}</p>
                </div>
              )}

              {/* Assigned kids */}
              {recipe.assigned_kid_ids && recipe.assigned_kid_ids.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Assigned to
                  </p>
                  <div className="flex gap-1.5">
                    {recipe.assigned_kid_ids.map((kidId) => {
                      const kid = kids.find((k) => k.id === kidId);
                      return kid ? (
                        <Badge key={kidId} variant="outline">
                          {kid.name}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {/* Source */}
              {recipe.source_url && (
                <div className="text-xs text-muted-foreground">
                  Source:{" "}
                  <a
                    href={recipe.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {new URL(recipe.source_url).hostname}
                  </a>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
    </>
  );
}
