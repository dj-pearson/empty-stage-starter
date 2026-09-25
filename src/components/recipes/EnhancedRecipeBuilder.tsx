import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sparkles, ChevronDown, Loader2, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { parseDurationMinutes } from "@/lib/recipeFilters";
import { toSafeHttpUrl } from "@/lib/recipeUrl";
import { coerceDifficulty } from "@/lib/recipeImport";
import {
  buildAdditionalIngredientsDisplay,
  draftsFromRecipe,
  toIngredientPayloads,
  type IngredientDraft,
} from "@/lib/recipeIngredients";
import { draftsFromImportRows } from "@/lib/recipeImportReview";
import { Recipe, Food, Kid } from "@/types";
import { cn } from "@/lib/utils";
import { IngredientSelector } from "./IngredientSelector";
import { IngredientRow, type IngredientRowData } from "./IngredientRow";
import { InstructionStepBuilder } from "./InstructionStepBuilder";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import "@/i18n/appLocale";

interface EnhancedRecipeBuilderProps {
  foods: Food[];
  kids: Kid[];
  activeKidId: string | null;
  editRecipe?: Recipe | null;
  /**
   * A parsed import to review before it is saved (item 12). Prefills every
   * field; ignored when editRecipe is set. Nothing is saved until Save.
   */
  initialDraft?: Omit<Recipe, "id"> | null;
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

/** "1 hr 10 min" -> "70"; anything unreadable -> "". The inputs hold minutes. */
function minutesText(value: string | null | undefined): string {
  const m = parseDurationMinutes(value);
  return m != null && m > 0 ? String(Math.round(m)) : "";
}

const digitsOnly = (value: string) => value.replace(/[^\d]/g, "").slice(0, 4);

const DIFFICULTY_SELECTED: Record<"easy" | "medium" | "hard", string> = {
  easy: "bg-safe-food text-primary-foreground hover:bg-safe-food/90",
  medium: "bg-warning text-foreground hover:bg-warning/90",
  hard: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

/** What suggest-recipe may send back. Every field is checked before use. */
interface SuggestedRecipe {
  description?: unknown;
  instructions?: unknown;
  food_ids?: unknown;
  prepTime?: unknown;
  cookTime?: unknown;
  tips?: unknown;
  difficulty?: unknown;
}

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function toStepList(value: unknown): string[] {
  const lines = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];
  return lines.map((l) => l.replace(/^\d+[.)]\s*/, "").trim()).filter((l) => l.length > 0);
}

export function EnhancedRecipeBuilder({
  foods,
  kids,
  activeKidId,
  editRecipe,
  initialDraft,
  onSave,
  onCancel,
}: EnhancedRecipeBuilderProps) {
  const { t } = useTranslation();
  // What the form starts from: the recipe being edited, else an import under
  // review, else nothing.
  const seed: Omit<Recipe, "id"> | null = editRecipe ?? initialDraft ?? null;
  // Basic info
  const [name, setName] = useState(seed?.name ?? "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [imageUrl, setImageUrl] = useState(seed?.image_url ?? "");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    seed?.difficulty_level ?? "easy"
  );
  const [tags, setTags] = useState<string[]>(seed?.tags ?? []);
  const [tagInput, setTagInput] = useState("");

  // Ingredients
  // US-721: seed from the real recipe_ingredients rows when they exist, so an
  // edit does not wipe every quantity and unit. food_ids is the legacy fallback
  // and additional_ingredients is parsed as a last resort, which is how a
  // recipe that only ever had the free-text blob becomes structured.
  const [ingredients, setIngredients] = useState<IngredientRowData[]>(() =>
    (!editRecipe && initialDraft?.recipe_ingredient_rows?.length
      ? draftsFromImportRows(initialDraft.recipe_ingredient_rows)
      : draftsFromRecipe(seed, foods)
    ).map((draft) => ({
      id: draft.id,
      rowId: draft.rowId ?? undefined,
      food_id: draft.food_id ?? undefined,
      name: draft.name,
      quantity: draft.quantity,
      unit: draft.unit,
      prepNotes: draft.prepNotes,
      isOptional: draft.isOptional,
      section: draft.section,
    })),
  );

  // Instructions
  const [steps, setSteps] = useState<string[]>(() => {
    if (!seed?.instructions) return [""];
    try {
      const parsed = JSON.parse(seed.instructions);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Split text into steps
      const lines = seed.instructions
        .split(/\r?\n/)
        .map((l) => l.replace(/^\d+[.)]\s*/, "").trim())
        .filter((l) => l.length > 0);
      if (lines.length > 0) return lines;
    }
    return [seed.instructions];
  });

  // Additional info
  // Minutes as digits. "1 hr 10 min" from an import is seeded as "70" rather
  // than shown as a blank number input.
  const [prepTime, setPrepTime] = useState(() => minutesText(seed?.prepTime));
  const [cookTime, setCookTime] = useState(() => minutesText(seed?.cookTime));
  const [servings, setServings] = useState(seed?.servings || "4");
  const [tips, setTips] = useState(seed?.tips ?? "");
  const [sourceUrl, setSourceUrl] = useState(seed?.source_url ?? "");
  const [urlErrors, setUrlErrors] = useState<{ image?: string; source?: string }>({});

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

  // Stable across renders so IngredientRow's memo skips unchanged rows.
  const updateIngredient = useCallback((id: string, updates: Partial<IngredientRowData>) => {
    setIngredients((prev) =>
      prev.map((ing) => (ing.id === id ? { ...ing, ...updates } : ing))
    );
  }, []);

  const removeIngredient = useCallback((id: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  }, []);

  // AI generation
  const handleAIGenerate = async () => {
    if (!name.trim()) {
      toast.error("Enter a recipe name first");
      return;
    }

    setIsGenerating(true);
    try {
      const activeKid = kids.find((k) => k.id === activeKidId);
      const { data, error } = await invokeEdgeFunction<{ recipe?: SuggestedRecipe }>("suggest-recipe", {
        body: {
          recipeName: name,
          availableFoods: foods.map((f) => ({ id: f.id, name: f.name, category: f.category })),
          childProfile: activeKid,
        },
      });

      if (error) throw error;

      const r: SuggestedRecipe | undefined = data?.recipe;
      if (r) {
        // Fill what is empty and append to what is not: a cook who typed
        // half a recipe and asked for help keeps every word they wrote.
        const desc = asText(r.description);
        if (desc) setDescription((prev) => (prev.trim() ? prev : desc));

        const newSteps = toStepList(r.instructions);
        if (newSteps.length > 0) {
          setSteps((prev) => [...prev.filter((st) => st.trim()), ...newSteps]);
        }

        if (Array.isArray(r.food_ids)) {
          const foodById = new Map(foods.map((f) => [f.id, f] as const));
          setIngredients((prev) => {
            const have = new Set(prev.map((ing) => ing.food_id).filter(Boolean));
            const added: IngredientRowData[] = [];
            for (const raw of r.food_ids as unknown[]) {
              if (typeof raw !== "string" || have.has(raw)) continue;
              // An id the pantry does not have is dropped, not shown as "Unknown".
              const food = foodById.get(raw);
              if (!food) continue;
              have.add(raw);
              added.push({
                id: generateIngredientId(),
                food_id: food.id,
                name: food.name,
                quantity: "",
                unit: "",
                prepNotes: "",
                isOptional: false,
              });
            }
            return added.length > 0 ? [...prev, ...added] : prev;
          });
        }

        const prep = minutesText(asText(r.prepTime));
        if (prep) setPrepTime((prev) => prev || prep);
        const cook = minutesText(asText(r.cookTime));
        if (cook) setCookTime((prev) => prev || cook);

        const tip = asText(r.tips);
        if (tip) setTips((prev) => (prev.trim() ? `${prev.trim()}\n${tip}` : tip));

        const level = coerceDifficulty(r.difficulty);
        if (level) setDifficulty(level);

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

    // Only http(s) links are stored, and "example.com/pie" means https://.
    const safeImage = toSafeHttpUrl(imageUrl, { addScheme: true });
    const safeSource = toSafeHttpUrl(sourceUrl, { addScheme: true });
    const invalid = t("recipes.builder.invalidUrl", { defaultValue: "Enter a web address starting with http:// or https://" });
    const errors = {
      image: safeImage === null ? invalid : undefined,
      source: safeSource === null ? invalid : undefined,
    };
    setUrlErrors(errors);
    if (errors.image || errors.source) {
      setSectionsOpen((prev) => ({
        ...prev,
        basic: prev.basic || Boolean(errors.image),
        additional: prev.additional || Boolean(errors.source),
      }));
      return;
    }

    setIsSaving(true);
    try {
      const foodIds = ingredients
        .filter((ing) => ing.food_id)
        .map((ing) => ing.food_id!);

      // US-721: the rows are the source of truth now. additional_ingredients is
      // rebuilt from them on every save as a DISPLAY string, because shipped
      // iOS builds still read it -- deriving it is what stops the two drifting.
      const drafts: IngredientDraft[] = ingredients.map((ing) => ({
        id: ing.id,
        rowId: ing.rowId ?? null,
        food_id: ing.food_id ?? null,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        prepNotes: ing.prepNotes,
        isOptional: ing.isOptional,
        section: ing.section,
      }));
      const ingredientRows = toIngredientPayloads(drafts);
      const additionalIngredients = buildAdditionalIngredientsDisplay(drafts);

      // Store steps as JSON array for structured display
      const instructionsStr =
        steps.filter((s) => s.trim()).length > 0
          ? JSON.stringify(steps.filter((s) => s.trim()))
          : undefined;

      const prepMinutes = parseDurationMinutes(prepTime);
      const cookMinutes = parseDurationMinutes(cookTime);

      const recipeData: Partial<Recipe> & { additionalIngredients?: string } = {
        name: name.trim(),
        description: description.trim() || undefined,
        food_ids: foodIds,
        instructions: instructionsStr,
        prepTime: prepMinutes != null ? String(prepMinutes) : undefined,
        cookTime: cookMinutes != null ? String(cookMinutes) : undefined,
        servings: servings || undefined,
        tips: tips.trim() || undefined,
        image_url: safeImage || undefined,
        source_url: safeSource || undefined,
        difficulty_level: difficulty,
        tags: tags.length > 0 ? tags : undefined,
        additionalIngredients: additionalIngredients || undefined,
        recipe_ingredient_rows: ingredientRows,
      };

      // Calculate total time
      // US-721: parseInt("1 hr 30 min") is 1. parseDurationMinutes reads the
      // units, so an hour is 60 minutes rather than one.
      const prep = prepMinutes ?? 0;
      const cook = cookMinutes ?? 0;
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
              type="url"
              inputMode="url"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                if (urlErrors.image) setUrlErrors((prev) => ({ ...prev, image: undefined }));
              }}
              placeholder="https://..."
              aria-invalid={Boolean(urlErrors.image)}
              aria-describedby={urlErrors.image ? "recipe-img-error" : undefined}
            />
            {urlErrors.image && (
              <p id="recipe-img-error" className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {urlErrors.image}
              </p>
            )}
          </div>

          {/* Difficulty */}
          <div>
            <Label id="recipe-difficulty-label">Difficulty</Label>
            <div className="flex gap-2 mt-1" role="group" aria-labelledby="recipe-difficulty-label">
              {(["easy", "medium", "hard"] as const).map((level) => (
                <Button
                  key={level}
                  type="button"
                  variant={difficulty === level ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDifficulty(level)}
                  aria-pressed={difficulty === level}
                  className={cn("capitalize flex-1 h-10 sm:h-9", difficulty === level && DIFFICULTY_SELECTED[level])}
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
                    aria-label="Remove this tag"
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
                  onUpdate={updateIngredient}
                  onRemove={removeIngredient}
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
                onChange={(e) => setPrepTime(digitsOnly(e.target.value))}
                placeholder="15"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>
            <div>
              <Label htmlFor="cook-time">Cook (min)</Label>
              <Input
                id="cook-time"
                value={cookTime}
                onChange={(e) => setCookTime(digitsOnly(e.target.value))}
                placeholder="30"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
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
              type="url"
              inputMode="url"
              value={sourceUrl}
              onChange={(e) => {
                setSourceUrl(e.target.value);
                if (urlErrors.source) setUrlErrors((prev) => ({ ...prev, source: undefined }));
              }}
              placeholder="https://recipe-site.com/..."
              aria-invalid={Boolean(urlErrors.source)}
              aria-describedby={urlErrors.source ? "source-url-error" : undefined}
            />
            {urlErrors.source && (
              <p id="source-url-error" className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {urlErrors.source}
              </p>
            )}
          </div>

        </CollapsibleContent>
      </Collapsible>

      {/* Section 5: AI Generation */}
      <Collapsible open={sectionsOpen.ai} onOpenChange={() => toggleSection("ai")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 font-medium text-sm">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
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
