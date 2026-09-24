import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
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
  DropdownMenuSeparator,
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
  Salad,
  Share2,
  Check,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import type { Recipe, Food, Kid, RecipeIngredient } from "@/types";
import { cn } from "@/lib/utils";
import { CookMode } from "./CookMode";
import { AddToPlannerPopover } from "./AddToPlannerPopover";
import { CookedLogSheet } from "./CookedLogSheet";
import { ShareLinkDialog } from "./ShareLinkDialog";
import { useShareRecipe } from "@/hooks/useShareRecipe";
import { calculateRecipeNutrition, perServingNutrition } from "@/lib/nutritionCalculator";
import { HideVeggiesDialog } from "@/components/HideVeggiesDialog";
import { toISODate } from "@/lib/date-utils";
import { safeSourceHref } from "@/lib/recipeShareText";
import { formatQuantity } from "@/lib/groceryMerge";
import { parseDurationMinutes } from "@/lib/recipeFilters";
import {
  MAX_TARGET_SERVINGS,
  MIN_TARGET_SERVINGS,
  clampTargetServings,
  parseBaseServings,
  servingScale,
} from "@/lib/recipeServings";
import { computeRecipeShortfall } from "@/lib/recipeShortfall";
import {
  countUncheckedIngredients,
  getKidRecipeFit,
  summarizeKidFits,
  type KidHit,
} from "@/lib/kidFit";
import { isKidAllergyUnknown } from "@/hooks/useRecipeQuickPlan";
import { useGrocery, usePlan } from "@/contexts/AppContext";
import type { GroceryAddInput } from "@/lib/groceryMerge";
import "@/i18n/appLocale";

interface RecipeDetailViewProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: Food[];
  kids: Kid[];
  activeKidId?: string | null;
  onUpdateRecipe: (id: string, updates: Partial<Recipe>) => void;
  /** Called synchronously; the sheet closes itself first. */
  onEdit: (recipe: Recipe) => void;
  /**
   * Delete goes through the page's single delete path (a deferred commit
   * behind an Undo toast). The sheet never deletes on its own.
   */
  onRequestDelete: (recipe: Recipe) => void;
  onAddToCollections?: (recipe: Recipe) => void;
  /** Omitted: favorite toggles through onUpdateRecipe. */
  onToggleFavorite?: (recipe: Recipe) => void;
}

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

function StarRating({
  rating,
  onRate,
  label,
  starLabel,
}: {
  rating: number;
  onRate: (rating: number) => void;
  label: string;
  starLabel: (n: number) => string;
}) {
  const [hover, setHover] = useState(0);
  const current = Math.round(rating);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, star: number) => {
    let next = star;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(5, star + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(1, star - 1);
    else return;
    e.preventDefault();
    buttons.current[next - 1]?.focus();
    onRate(next);
  };

  return (
    <div role="radiogroup" aria-label={label} tabIndex={-1} className="flex" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const checked = star === current;
        const lit = star <= (hover || current);
        return (
          <button
            key={star}
            ref={(el) => {
              buttons.current[star - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={starLabel(star)}
            tabIndex={checked || (current === 0 && star === 1) ? 0 : -1}
            className="flex h-11 w-11 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onMouseEnter={() => setHover(star)}
            onClick={() => onRate(checked ? 0 : star)}
            onKeyDown={(e) => onKeyDown(e, star)}
          >
            <Star
              aria-hidden="true"
              className={cn(
                "h-5 w-5 transition-colors",
                lit ? "fill-warning text-warning" : "text-muted-foreground/40",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-kid fit
// ---------------------------------------------------------------------------

type ChipKind = "allergen" | "unknown" | "dislike" | "eats" | "trying" | "new";

interface KidChip {
  kid: Kid;
  kind: ChipKind;
  text: string;
  history: string | null;
}

const CHIP_CLASS: Record<ChipKind, string> = {
  allergen: "border-destructive/40 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
  dislike: "border-border bg-muted text-foreground",
  eats: "border-safe-food/40 bg-safe-food/15 text-foreground",
  trying: "border-try-bite/40 bg-try-bite/15 text-foreground",
  new: "border-border bg-background text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

export function RecipeDetailView(props: RecipeDetailViewProps) {
  if (!props.recipe) return null;
  // Keyed by recipe so every piece of per-recipe state (servings, checked
  // ingredients, cook mode, dialogs) starts fresh when another recipe opens.
  return <RecipeDetailBody key={props.recipe.id} {...props} recipe={props.recipe} />;
}

interface IngredientRowView {
  key: string;
  text: string;
  notes: string | null;
  status: "have" | "need" | "listed" | null;
}

function RecipeDetailBody({
  recipe,
  open,
  onOpenChange,
  foods,
  kids,
  activeKidId = null,
  onUpdateRecipe,
  onEdit,
  onRequestDelete,
  onAddToCollections,
  onToggleFavorite,
}: RecipeDetailViewProps & { recipe: Recipe }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { planEntries } = usePlan();
  const { groceryItems, addGroceryItemsMerged, deleteGroceryItems } = useGrocery();
  const share = useShareRecipe();

  const [showCookMode, setShowCookMode] = useState(false);
  const [showHideVeggies, setShowHideVeggies] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [cookedLogOpen, setCookedLogOpen] = useState(false);
  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  // Cook Mode's Done: the detail sheet mounts again in the same commit, and a
  // sheet that opens in that commit ends up underneath it. Open the log sheet
  // from an effect, after the detail sheet is back.
  const [logAfterCook, setLogAfterCook] = useState(false);
  useEffect(() => {
    if (!logAfterCook || showCookMode) return;
    setLogAfterCook(false);
    setCookedLogOpen(true);
  }, [logAfterCook, showCookMode]);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(() => new Set());
  const baseServings = parseBaseServings(recipe.servings);
  const [targetServings, setTargetServings] = useState(baseServings);
  const [scaleAnnouncement, setScaleAnnouncement] = useState("");
  const editingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setShowCookMode(false);
      setShowHideVeggies(false);
    }
  }, [open]);

  const scale = servingScale(targetServings, baseServings);
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

  // --- source link --------------------------------------------------------
  const safeSource = useMemo(() => {
    const href = safeSourceHref(recipe.source_url);
    if (!href) return null;
    try {
      return { href, host: new URL(href).hostname.replace(/^www\./, "") };
    } catch {
      return null;
    }
  }, [recipe.source_url]);

  // --- per-kid fit ----------------------------------------------------------
  const unchecked = useMemo(() => countUncheckedIngredients(recipe, foodById), [recipe, foodById]);
  const perKid = useMemo<KidHit[]>(
    () => kids.map((kid) => ({ kid, fit: getKidRecipeFit(kid, recipe, foodById, planEntries) })),
    [kids, recipe, foodById, planEntries],
  );
  const fitSummary = useMemo(() => summarizeKidFits(perKid, { unchecked }), [perKid, unchecked]);

  const kidChips = useMemo<KidChip[]>(() => {
    return perKid.map(({ kid, fit }) => {
      const history =
        fit.tries > 0
          ? t("recipes.fit.ateOf", { defaultValue: "ate {{ate}} of {{tries}}", ate: fit.ate, tries: fit.tries })
          : null;
      if (fit.allergen) {
        return {
          kid,
          kind: "allergen",
          text: t("recipes.fit.allergy", { defaultValue: "Allergy: {{allergen}}", allergen: fit.allergen }),
          history,
        };
      }
      if (isKidAllergyUnknown(kid, unchecked)) {
        return {
          kid,
          kind: "unknown",
          text: t("recipes.fit.unknown", { defaultValue: "Allergy info not checked" }),
          history,
        };
      }
      if (fit.disliked) {
        return { kid, kind: "dislike", text: t("recipes.fit.dislikes", { defaultValue: "Dislikes" }), history };
      }
      if (fit.alwaysEats || fit.safe) {
        return { kid, kind: "eats", text: t("recipes.fit.eats", { defaultValue: "Eats this" }), history };
      }
      if (fit.tryBite) {
        return { kid, kind: "trying", text: t("recipes.fit.trying", { defaultValue: "Trying" }), history };
      }
      return { kid, kind: "new", text: t("recipes.fit.new", { defaultValue: "Not tried yet" }), history };
    });
  }, [perKid, unchecked, t]);

  // --- ingredients ----------------------------------------------------------
  const structured = useMemo<RecipeIngredient[]>(
    () =>
      (recipe.recipe_ingredients ?? [])
        .filter((r) => (r.name ?? "").trim().length > 0)
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [recipe.recipe_ingredients],
  );
  const hasStructured = structured.length > 0;

  const recipeFoods = useMemo(
    () => (recipe.food_ids ?? []).map((id) => foodById.get(id)).filter((f): f is Food => Boolean(f)),
    [recipe.food_ids, foodById],
  );

  const shortfalls = useMemo(
    () => (hasStructured ? computeRecipeShortfall(recipe, foods, groceryItems, scale) : []),
    [hasStructured, recipe, foods, groceryItems, scale],
  );
  const shortIds = useMemo(() => new Set(shortfalls.map((s) => s.ingredient.id)), [shortfalls]);

  // Legacy recipes (food_ids only): out of stock and not already on the list.
  const legacyMissing = useMemo(() => {
    if (hasStructured) return [];
    const onList = new Set(
      groceryItems.filter((g) => !g.checked).map((g) => g.name.trim().toLowerCase()),
    );
    return recipeFoods.filter((f) => (f.quantity ?? 0) <= 0 && !onList.has(f.name.trim().toLowerCase()));
  }, [hasStructured, groceryItems, recipeFoods]);

  const groups = useMemo(() => {
    if (!hasStructured) return [];
    const order: string[] = [];
    const byLabel = new Map<string, IngredientRowView[]>();
    for (const ing of structured) {
      const label = (ing.group_label ?? "").trim();
      if (!byLabel.has(label)) {
        byLabel.set(label, []);
        order.push(label);
      }
      const qty = typeof ing.quantity === "number" && ing.quantity > 0 ? formatQuantity(ing.quantity * scale) : "";
      byLabel.get(label)!.push({
        key: ing.id || `${ing.sort_order}-${ing.name}`,
        text: [qty, (ing.unit ?? "").trim(), ing.name.trim()].filter(Boolean).join(" "),
        notes: ing.optional_notes?.trim() || null,
        status: shortIds.has(ing.id) ? "need" : null,
      });
    }
    return order.map((label) => ({ label, rows: byLabel.get(label) ?? [] }));
  }, [hasStructured, structured, scale, shortIds]);

  const legacyRows = useMemo<IngredientRowView[]>(() => {
    if (hasStructured) return [];
    const missing = new Set(legacyMissing.map((f) => f.id));
    return recipeFoods.map((f): IngredientRowView => ({
      key: f.id,
      text: f.name,
      notes: null,
      status: (f.quantity ?? 0) > 0 ? "have" : missing.has(f.id) ? "need" : "listed",
    }));
  }, [hasStructured, recipeFoods, legacyMissing]);

  const missingCount = hasStructured ? shortfalls.length : legacyMissing.length;
  const hasAnyIngredients = hasStructured || recipeFoods.length > 0;

  // --- grocery add with Undo -----------------------------------------------
  const pendingInsert = useRef<{ before: Set<string>; names: Set<string>; target: string[] } | null>(null);
  useEffect(() => {
    const p = pendingInsert.current;
    if (!p) return;
    pendingInsert.current = null;
    for (const item of groceryItems) {
      if (p.before.has(item.id)) continue;
      if (!p.names.has(item.name.trim().toLowerCase())) continue;
      p.target.push(item.id);
    }
  }, [groceryItems]);

  const handleAddMissing = useCallback(() => {
    let items: GroceryAddInput[];
    if (hasStructured) {
      items = shortfalls.map((s) => ({
        name: s.ingredient.name.trim(),
        quantity: s.needed > 0 ? s.needed : 1,
        unit: s.neededUnit ?? "",
        category: s.matchedFood?.category,
        added_via: "recipe",
        source_recipe_id: recipe.id,
      }));
    } else {
      items = legacyMissing.map((f) => ({
        name: f.name,
        quantity: 1,
        unit: f.unit ?? "",
        category: f.category,
        added_via: "recipe",
        source_recipe_id: recipe.id,
      }));
    }
    if (items.length === 0) return;
    const inserted: string[] = [];
    pendingInsert.current = {
      before: new Set(groceryItems.map((g) => g.id)),
      names: new Set(items.map((i) => i.name.trim().toLowerCase())),
      target: inserted,
    };
    const touched = addGroceryItemsMerged(items);
    if (touched === 0) {
      pendingInsert.current = null;
      return;
    }
    toast.success(
      t("recipes.grocery.added", {
        defaultValue: touched === 1 ? "Added {{count}} item to your grocery list" : "Added {{count}} items to your grocery list",
        count: touched,
      }),
      {
        description: recipe.name,
        action: {
          label: t("planner.actions.undo", { defaultValue: "Undo" }),
          onClick: () => {
            if (inserted.length > 0) deleteGroceryItems([...inserted]);
          },
        },
        cancel: {
          label: t("recipes.grocery.viewList", { defaultValue: "View list" }),
          onClick: () => navigate("/dashboard/grocery"),
        },
      },
    );
  }, [
    hasStructured,
    shortfalls,
    legacyMissing,
    recipe.id,
    recipe.name,
    groceryItems,
    addGroceryItemsMerged,
    deleteGroceryItems,
    navigate,
    t,
  ]);

  // --- times / nutrition ----------------------------------------------------
  const totalTime =
    recipe.total_time_minutes ||
    (parseDurationMinutes(recipe.prepTime) ?? 0) + (parseDurationMinutes(recipe.cookTime) ?? 0);

  const autoNutrition = useMemo(() => {
    if (recipe.nutrition_info) return null; // Manual data takes precedence
    const total = calculateRecipeNutrition(recipe, foods);
    if (!total) return null;
    return perServingNutrition(total, baseServings);
  }, [recipe, foods, baseServings]);

  const effectiveNutrition =
    recipe.nutrition_info ||
    (autoNutrition
      ? {
          calories: autoNutrition.calories,
          protein_g: autoNutrition.protein_g,
          carbs_g: autoNutrition.carbs_g,
          fat_g: autoNutrition.fat_g,
          fiber_g: autoNutrition.fiber_g,
        }
      : null);

  const instructionSteps = useMemo(() => {
    if (!recipe.instructions) return [];
    try {
      const parsed: unknown = JSON.parse(recipe.instructions);
      if (Array.isArray(parsed)) {
        return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
      }
    } catch {
      // plain text
    }
    return recipe.instructions
      .split(/\r?\n/)
      .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
      .filter((line) => line.length > 0);
  }, [recipe.instructions]);

  // --- actions --------------------------------------------------------------
  const handleRate = (rating: number) => {
    if (rating === 0) {
      // The column's CHECK allows 1-5 or NULL; clearing writes NULL.
      onUpdateRecipe(recipe.id, { rating: null } as unknown as Partial<Recipe>);
      toast.success(t("recipes.detail.ratingCleared", { defaultValue: "Rating cleared" }));
      return;
    }
    onUpdateRecipe(recipe.id, { rating });
    toast.success(
      t("recipes.detail.rated", {
        defaultValue: rating === 1 ? "Rated {{count}} star" : "Rated {{count}} stars",
        count: rating,
      }),
    );
  };

  // Item 9: a cook is also the moment to log how it went, per kid, through
  // the plan. The sheet only opens when there is a kid to ask about.
  const handleIMadeIt = (fromCookMode = false) => {
    if (kids.length > 0) {
      if (fromCookMode) setLogAfterCook(true);
      else setCookedLogOpen(true);
    }
    const newTimesMade = (recipe.times_made ?? 0) + 1;
    onUpdateRecipe(recipe.id, {
      times_made: newTimesMade,
      // US-818: the day the cook happened where the cook is, not in UTC.
      last_made_date: toISODate(new Date()),
    });
    toast.success(t("recipes.detail.madeIt", { defaultValue: "Nice! Recipe logged as made" }), {
      description: t("recipes.detail.madeCount", {
        defaultValue: newTimesMade === 1 ? "You've made \"{{name}}\" {{count}} time" : "You've made \"{{name}}\" {{count}} times",
        name: recipe.name,
        count: newTimesMade,
      }),
    });
  };

  const handleToggleFavorite = () => {
    if (onToggleFavorite) {
      onToggleFavorite(recipe);
      return;
    }
    onUpdateRecipe(recipe.id, { is_favorite: !recipe.is_favorite });
    toast.success(
      recipe.is_favorite
        ? t("recipes.detail.unfavorited", { defaultValue: "Removed from favorites" })
        : t("recipes.detail.favorited", { defaultValue: "Added to favorites" }),
    );
  };

  const handleEdit = () => {
    editingRef.current = true;
    onOpenChange(false);
    onEdit(recipe);
  };

  const handleDelete = () => {
    onRequestDelete(recipe);
    onOpenChange(false);
  };

  const stepServings = (delta: number) => {
    const next = clampTargetServings(targetServings + delta);
    if (next === targetServings) return;
    setTargetServings(next);
    setScaleAnnouncement(
      t("recipes.detail.scaledTo", {
        defaultValue: next === 1 ? "Scaled to {{count}} serving" : "Scaled to {{count}} servings",
        count: next,
      }),
    );
  };

  const toggleIngredient = (key: string) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (showCookMode && recipe.instructions) {
    return (
      <CookMode
        recipeName={recipe.name}
        instructions={recipe.instructions}
        onClose={() => setShowCookMode(false)}
        onDone={() => {
          setShowCookMode(false);
          handleIMadeIt(true);
        }}
      />
    );
  }

  const favoriteLabel = recipe.is_favorite
    ? t("recipes.detail.removeFavorite", { defaultValue: "Remove from favorites" })
    : t("recipes.detail.addFavorite", { defaultValue: "Add to favorites" });

  const overflowMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full bg-background/85"
          aria-label={t("recipes.detail.options", { defaultValue: "Recipe options" })}
        >
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={handleEdit}>
          <Pencil className="h-4 w-4 mr-2" />
          {t("recipes.detail.edit", { defaultValue: "Edit" })}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void share(recipe, foods)}>
          <Share2 className="h-4 w-4 mr-2" />
          {t("recipes.share.button", { defaultValue: "Share" })}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setShareLinkOpen(true)}>
          <Link2 className="h-4 w-4 mr-2" />
          {t("recipes.shareLink.menu", { defaultValue: "Share link" })}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleToggleFavorite}>
          <Heart className={cn("h-4 w-4 mr-2", recipe.is_favorite && "fill-primary text-primary")} />
          {favoriteLabel}
        </DropdownMenuItem>
        {onAddToCollections && (
          <DropdownMenuItem onSelect={() => onAddToCollections(recipe)}>
            <FolderPlus className="h-4 w-4 mr-2" />
            {t("recipes.detail.addToCollection", { defaultValue: "Add to collection" })}
          </DropdownMenuItem>
        )}
        {/* US-297: only useful when a kid's preferences guide the swap. */}
        {kids.length > 0 && (
          <DropdownMenuItem onSelect={() => setShowHideVeggies(true)}>
            <Salad className="h-4 w-4 mr-2" />
            {t("recipes.detail.sneakVeggies", { defaultValue: "Sneak veggies in" })}
          </DropdownMenuItem>
        )}
        {safeSource && (
          <DropdownMenuItem asChild>
            <a href={safeSource.href} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              {t("recipes.detail.viewSource", { defaultValue: "View source" })}
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={handleDelete}>
          <Trash2 className="h-4 w-4 mr-2" />
          {t("recipes.detail.delete", { defaultValue: "Delete" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const description = recipe.description?.trim();
  const stockLabels = {
    have: t("recipes.detail.have", { defaultValue: "have it" }),
    need: t("recipes.detail.need", { defaultValue: "need" }),
    listed: t("recipes.detail.onList", { defaultValue: "on list" }),
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px] md:max-w-[700px]"
          onCloseAutoFocus={(e) => {
            // Edit hands focus to the builder sheet; returning it to the card
            // underneath would pull it back out.
            if (editingRef.current) {
              e.preventDefault();
              editingRef.current = false;
            }
          }}
        >
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col">
              {recipe.image_url && (
                <div className="relative h-48 w-full md:h-56">
                  <img src={recipe.image_url} alt="" className="h-full w-full object-cover" />
                </div>
              )}

              <SheetHeader className="space-y-2 p-4 pb-2 text-left">
                <div className="flex items-start gap-2 pr-10">
                  <SheetTitle className="flex-1 text-xl leading-tight">{recipe.name}</SheetTitle>
                  {recipe.is_favorite && (
                    <Heart className="mt-1 h-5 w-5 shrink-0 fill-primary text-primary" aria-label={favoriteLabel} />
                  )}
                  {overflowMenu}
                </div>
                <SheetDescription className={cn(!description && "sr-only")}>
                  {description || t("recipes.detail.srDescription", { defaultValue: "Recipe details, ingredients and steps" })}
                </SheetDescription>

                {/* Per-kid fit, the first thing a parent reads. */}
                {kidChips.length > 0 && (
                  <ul
                    className="flex flex-wrap gap-1.5 pt-1"
                    aria-label={
                      fitSummary.allergenStatus === "hit"
                        ? t("recipes.fit.summaryHit", { defaultValue: "Allergy warning for some kids" })
                        : t("recipes.fit.summary", { defaultValue: "How each child does with this" })
                    }
                    data-testid="recipe-kid-fit"
                  >
                    {kidChips.map((chip) => (
                      <li
                        key={chip.kid.id}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                          CHIP_CLASS[chip.kind],
                        )}
                        data-kind={chip.kind}
                      >
                        {chip.kind === "allergen" && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                        {chip.kind === "eats" && <Check className="h-3.5 w-3.5 shrink-0 text-safe-food" aria-hidden="true" />}
                        <span className="font-medium">{chip.kid.name}</span>
                        <span aria-hidden="true">-</span>
                        <span>{chip.text}</span>
                        {chip.history && <span className="text-muted-foreground">({chip.history})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </SheetHeader>

              <div className="space-y-4 p-4 pt-2">
                {/* Rating + made count */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StarRating
                    rating={recipe.rating ?? 0}
                    onRate={handleRate}
                    label={t("recipes.detail.rating", { defaultValue: "Rating" })}
                    starLabel={(n) =>
                      t("recipes.detail.starLabel", {
                        defaultValue: n === 1 ? "{{count}} star" : "{{count}} stars",
                        count: n,
                      })
                    }
                  />
                  <div className="flex items-center gap-2">
                    {(recipe.times_made ?? 0) > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {t("recipes.detail.timesMade", {
                          defaultValue: "Made {{count}}x",
                          count: recipe.times_made ?? 0,
                        })}
                      </span>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleIMadeIt()} className="h-11 gap-1.5">
                      <ChefHat className="h-4 w-4" />
                      {t("recipes.detail.iMadeIt", { defaultValue: "I Made It" })}
                    </Button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex flex-wrap gap-4 text-sm">
                  {recipe.difficulty_level && (
                    <Badge variant="outline" className="capitalize">
                      {t(`recipes.difficulty.${recipe.difficulty_level}`, { defaultValue: recipe.difficulty_level })}
                    </Badge>
                  )}
                  {recipe.prepTime && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <span>{t("recipes.detail.prep", { defaultValue: "Prep: {{time}}", time: recipe.prepTime })}</span>
                    </div>
                  )}
                  {recipe.cookTime && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <span>{t("recipes.detail.cook", { defaultValue: "Cook: {{time}}", time: recipe.cookTime })}</span>
                    </div>
                  )}
                  {totalTime > 0 && (
                    <span className="font-medium text-muted-foreground">
                      {t("recipes.detail.totalTime", { defaultValue: "{{count}} min total", count: Math.round(totalTime) })}
                    </span>
                  )}
                </div>

                {recipe.tags && recipe.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {recipe.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <Tabs defaultValue="ingredients" className="w-full">
                  <TabsList className="w-full">
                    <TabsTrigger value="ingredients" className="flex-1">
                      {t("recipes.detail.ingredients", { defaultValue: "Ingredients" })}
                    </TabsTrigger>
                    <TabsTrigger value="instructions" className="flex-1">
                      {t("recipes.detail.instructions", { defaultValue: "Instructions" })}
                    </TabsTrigger>
                    <TabsTrigger value="nutrition" className="flex-1">
                      {t("recipes.detail.nutrition", { defaultValue: "Nutrition" })}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="ingredients" className="mt-3 space-y-3">
                    {/* Servings stepper */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <Users className="h-4 w-4" aria-hidden="true" />
                          {t("recipes.detail.servings", {
                            defaultValue: targetServings === 1 ? "{{count}} serving" : "{{count}} servings",
                            count: targetServings,
                          })}
                        </span>
                        {targetServings !== baseServings && (
                          <span className="text-xs text-muted-foreground">
                            {t("recipes.detail.recipeMakes", {
                              defaultValue: "Recipe makes {{count}}",
                              count: baseServings,
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-11 w-11"
                          onClick={() => stepServings(-1)}
                          disabled={targetServings <= MIN_TARGET_SERVINGS}
                          aria-label={t("recipes.detail.fewerServings", { defaultValue: "Fewer servings" })}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center text-sm tabular-nums" aria-hidden="true">
                          {targetServings}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-11 w-11"
                          onClick={() => stepServings(1)}
                          disabled={targetServings >= MAX_TARGET_SERVINGS}
                          aria-label={t("recipes.detail.moreServings", { defaultValue: "More servings" })}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <span className="sr-only" aria-live="polite" role="status">
                        {scaleAnnouncement}
                      </span>
                    </div>

                    {hasStructured ? (
                      <div className="space-y-3">
                        {groups.map((group) => (
                          <div key={group.label || "_"} className="space-y-1">
                            {group.label && (
                              <p className="px-2 text-xs font-medium text-muted-foreground">{group.label}</p>
                            )}
                            {group.rows.map((row) => (
                              <IngredientLine
                                key={row.key}
                                row={row}
                                checked={checkedIngredients.has(row.key)}
                                onToggle={() => toggleIngredient(row.key)}
                                labels={stockLabels}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : recipeFoods.length > 0 ? (
                      <div className="space-y-1">
                        {legacyRows.map((row) => (
                          <IngredientLine
                            key={row.key}
                            row={row}
                            checked={checkedIngredients.has(row.key)}
                            onToggle={() => toggleIngredient(row.key)}
                            labels={stockLabels}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm italic text-muted-foreground" data-testid="recipe-no-ingredients">
                        {t("recipes.detail.noIngredients", { defaultValue: "Ingredients not detailed. Edit the recipe to add them." })}
                      </p>
                    )}

                    {recipe.additionalIngredients && (
                      <div className="border-t pt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          {t("recipes.detail.alsoNeeded", { defaultValue: "Also needed:" })}
                        </p>
                        <p className="text-sm">{recipe.additionalIngredients}</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="instructions" className="mt-3 space-y-3">
                    {instructionSteps.length > 0 ? (
                      <ol className="space-y-3">
                        {instructionSteps.map((step, i) => (
                          <li key={i} className="flex gap-3">
                            <span
                              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary"
                              aria-hidden="true"
                            >
                              {i + 1}
                            </span>
                            <p className="pt-0.5 text-sm">{step}</p>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {t("recipes.detail.noSteps", { defaultValue: "No instructions added yet. Edit this recipe to add steps." })}
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="nutrition" className="mt-3">
                    {effectiveNutrition ? (
                      <div className="space-y-3">
                        {autoNutrition?.isPartial && (
                          <div className="flex items-center gap-2 rounded-lg bg-warning/15 p-2 text-foreground">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
                            <p className="text-xs">
                              {t("recipes.detail.partialNutrition", {
                                defaultValue: "Partial data: {{have}} of {{total}} ingredients have nutrition info",
                                have: autoNutrition.foodsWithData,
                                total: autoNutrition.totalFoods,
                              })}
                            </p>
                          </div>
                        )}
                        {autoNutrition && !autoNutrition.isPartial && (
                          <p className="text-xs text-muted-foreground">
                            {t("recipes.detail.autoNutrition", {
                              defaultValue: "Auto-calculated per serving ({{count}} servings)",
                              count: baseServings,
                            })}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          {(
                            [
                              ["calories", t("recipes.detail.calories", { defaultValue: "Calories" }), ""],
                              ["protein_g", t("recipes.detail.protein", { defaultValue: "Protein" }), "g"],
                              ["carbs_g", t("recipes.detail.carbs", { defaultValue: "Carbs" }), "g"],
                              ["fat_g", t("recipes.detail.fat", { defaultValue: "Fat" }), "g"],
                              ["fiber_g", t("recipes.detail.fiber", { defaultValue: "Fiber" }), "g"],
                            ] as const
                          ).map(([key, label, suffix]) => {
                            const value = effectiveNutrition[key];
                            if (value == null) return null;
                            return (
                              <div key={key} className="rounded-lg bg-muted p-3">
                                <p className="text-xs text-muted-foreground">{label}</p>
                                <p className="text-lg font-bold">
                                  {value}
                                  {suffix}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {t("recipes.detail.noNutrition", {
                          defaultValue: "No nutrition data available. Add nutrition info to food items to see auto-calculated totals.",
                        })}
                      </p>
                    )}
                  </TabsContent>
                </Tabs>

                {recipe.tips && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {t("recipes.detail.tips", { defaultValue: "Picky eater tips" })}
                    </p>
                    <p className="text-sm">{recipe.tips}</p>
                  </div>
                )}

                {safeSource && (
                  <div className="text-xs text-muted-foreground">
                    {t("recipes.detail.source", { defaultValue: "Source:" })}{" "}
                    <a
                      href={safeSource.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {safeSource.host}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          {/* Sticky action bar: plan it, shop for it, cook it. */}
          <div className="sticky bottom-0 flex items-center gap-2 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <AddToPlannerPopover
              recipe={recipe}
              kids={kids}
              foods={foods}
              activeKidId={activeKidId}
              open={planOpen}
              onOpenChange={setPlanOpen}
              trigger={
                <Button className="h-11 flex-1 gap-1.5">
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  {t("recipes.detail.plan", { defaultValue: "Plan" })}
                </Button>
              }
            />
            <Button
              variant={missingCount > 0 ? "default" : "outline"}
              className="h-11 flex-1 gap-1.5"
              onClick={handleAddMissing}
              disabled={missingCount === 0}
              data-testid="recipe-add-missing-to-grocery"
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              {!hasAnyIngredients
                ? t("recipes.detail.noIngredientsShort", { defaultValue: "No ingredients" })
                : missingCount > 0
                  ? t("recipes.detail.addToGrocery", { defaultValue: "Add {{count}} to grocery", count: missingCount })
                  : t("recipes.detail.allOnList", { defaultValue: "All on your list" })}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={() => setShowCookMode(true)}
              disabled={instructionSteps.length === 0}
              aria-label={t("recipes.detail.cookMode", { defaultValue: "Start cook mode" })}
            >
              <CookingPot className="h-5 w-5" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <HideVeggiesDialog open={showHideVeggies} onOpenChange={setShowHideVeggies} recipe={recipe} />
      <CookedLogSheet recipe={recipe} open={cookedLogOpen} onOpenChange={setCookedLogOpen} />
      {shareLinkOpen && <ShareLinkDialog recipe={recipe} open={shareLinkOpen} onOpenChange={setShareLinkOpen} />}
    </>
  );
}

function IngredientLine({
  row,
  checked,
  onToggle,
  labels,
}: {
  row: IngredientRowView;
  checked: boolean;
  onToggle: () => void;
  labels: Record<"have" | "need" | "listed", string>;
}) {
  return (
    <label
      className={cn(
        "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/50",
        checked && "opacity-50",
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="flex flex-1 flex-col">
        <span className={cn("text-sm", checked && "line-through")}>{row.text}</span>
        {row.notes && <span className="text-xs text-muted-foreground">{row.notes}</span>}
      </span>
      {row.status === "need" && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{labels.need}</span>
      )}
      {row.status === "listed" && <span className="text-xs text-muted-foreground">{labels.listed}</span>}
      {row.status === "have" && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-safe-food" aria-hidden="true" />
          {labels.have}
        </span>
      )}
    </label>
  );
}
