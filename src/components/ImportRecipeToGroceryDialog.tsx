import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Link2, Camera, Upload, Loader2, ShoppingCart, ChefHat, Search, AlertTriangle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { Html5Qrcode } from "html5-qrcode";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { logger } from "@/lib/logger";
import { PHOTO_AI_NOTICE } from "@/lib/aiSafety";
import type { Recipe } from "@/types";
import type { GroceryAddInput } from "@/lib/groceryMerge";
import { useFoods, useGrocery, useKids, usePlan, useRecipes } from "@/contexts/AppContext";
import { buildRecipeFits } from "@/lib/kidFit";
import { countMissingForRecipe } from "@/lib/recipeShortfall";
import { toISODate } from "@/lib/date-utils";
import { KidFitBadges } from "@/components/recipes/KidFitBadges";
import { describeConflicts, parseRecipePayload } from "@/components/grocery/groceryInputSchemas";
import {
  defaultSelection,
  rowsFromParsedIngredients,
  rowsFromSavedRecipe,
  rowsToGroceryAdds,
  type RecipeImportRow,
} from "@/components/grocery/recipeImportRows";

/** Recipes shown at once in the picker; search narrows the rest. */
const RECIPE_LIST_LIMIT = 40;

interface ReviewState {
  title: string;
  servings?: number;
  /** Set when the recipe is one of the household's, so rows carry source_recipe_id. */
  recipeId?: string;
  rows: RecipeImportRow[];
  /** Ingredients the parser returned that could not be read. */
  dropped: number;
}

interface ImportRecipeToGroceryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rows arrive tagged added_via 'recipe_import', with source_recipe_id when known. */
  onImport: (items: GroceryAddInput[]) => void;
}

type TabValue = "recipes" | "url" | "photo";

export function ImportRecipeToGroceryDialog({ open, onOpenChange, onImport }: ImportRecipeToGroceryDialogProps) {
  const { t } = useTranslation();
  const { foods } = useFoods();
  const { recipes } = useRecipes();
  const { kids } = useKids();
  const { planEntries } = usePlan();
  const { groceryItems } = useGrocery();

  const [activeTab, setActiveTab] = useState<TabValue>("recipes");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [recipeUrl, setRecipeUrl] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

  // Only computed while the picker can be seen: fits walk the plan history.
  const fitByRecipeId = useMemo(
    () => (open && activeTab === "recipes" ? buildRecipeFits(recipes, kids, foodById, planEntries, toISODate(new Date())) : new Map()),
    [open, activeTab, recipes, kids, foodById, planEntries],
  );

  const visibleRecipes = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const matches = q ? recipes.filter((r) => r.name.toLowerCase().includes(q)) : recipes;
    return matches.slice(0, RECIPE_LIST_LIMIT);
  }, [recipes, deferredSearch]);

  const missingByRecipeId = useMemo(() => {
    const out = new Map<string, number>();
    if (!open || activeTab !== "recipes") return out;
    for (const recipe of visibleRecipes) out.set(recipe.id, countMissingForRecipe(recipe, foods, groceryItems));
    return out;
  }, [open, activeTab, visibleRecipes, foods, groceryItems]);

  const showReview = (next: ReviewState) => {
    setReview(next);
    setSelected(defaultSelection(next.rows));
  };

  const pickRecipe = (recipe: Recipe) => {
    const rows = rowsFromSavedRecipe(recipe, foods, groceryItems, kids);
    showReview({ title: recipe.name, servings: undefined, recipeId: recipe.id, rows, dropped: 0 });
  };

  /** Validate an edge response and turn it into a review, or explain why not. */
  const acceptParse = (data: unknown, fallbackError: string): boolean => {
    const { recipe, error } = parseRecipePayload(data);
    if (error) throw new Error(error);
    if (!recipe || recipe.ingredients.length === 0) {
      toast.error(fallbackError);
      return false;
    }
    showReview({
      title: recipe.title || t("grocery.input.recipe.untitled", "Recipe"),
      servings: recipe.servings,
      rows: rowsFromParsedIngredients(recipe.ingredients, foods, kids),
      dropped: recipe.dropped,
    });
    toast.success(
      t("grocery.input.recipe.found", { defaultValue: "Found {{count}} ingredients", count: recipe.ingredients.length }),
      recipe.dropped > 0
        ? {
            description: t("grocery.input.import.dropped", {
              defaultValue: "{{count}} lines could not be read",
              count: recipe.dropped,
            }),
          }
        : undefined,
    );
    return true;
  };

  const handleParseUrl = async () => {
    if (!recipeUrl.trim()) {
      toast.error(t("grocery.input.recipe.urlRequired", "Enter a recipe URL"));
      return;
    }

    setIsParsing(true);
    try {
      const { data, error } = await invokeEdgeFunction<unknown>("parse-recipe-grocery", {
        body: { url: recipeUrl },
      });
      if (error) throw error;
      acceptParse(data, t("grocery.input.recipe.noIngredients", "No ingredients found in that recipe"));
    } catch (error) {
      logger.error("Error parsing recipe:", error);
      toast.error(error instanceof Error ? error.message : t("grocery.input.recipe.parseFailed", "Couldn't read that recipe"));
    } finally {
      setIsParsing(false);
    }
  };

  const handleParseImage = async (imageBase64: string) => {
    setIsParsing(true);
    try {
      const { data, error } = await invokeEdgeFunction<unknown>("parse-recipe-grocery", {
        body: { imageBase64 },
      });
      if (error) throw error;
      acceptParse(data, t("grocery.input.recipe.noIngredientsPhoto", "No ingredients found in the photo"));
    } catch (error) {
      logger.error("Error parsing recipe image:", error);
      toast.error(
        error instanceof Error ? error.message : t("grocery.input.recipe.photoFailed", "Couldn't read the recipe photo"),
      );
    } finally {
      setIsParsing(false);
    }
  };

  const startCamera = async () => {
    try {
      setCapturedImage(null);
      setReview(null);
      setShowCamera(true);

      await new Promise((r) => setTimeout(r, 50));

      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
          await scannerRef.current.clear();
        } catch (error) {
          // Ignore cleanup errors - scanner may already be stopped
          logger.debug("Scanner cleanup error (expected):", error);
        }
        scannerRef.current = null;
      }

      // Loaded on demand: the camera library is only needed by the few who
      // photograph a cookbook, and it was in the page bundle for everyone.
      const { Html5Qrcode: Scanner } = await import("html5-qrcode");
      const scanner = new Scanner("recipe-camera");
      scannerRef.current = scanner;

      const cameras = await Scanner.getCameras();
      if (!cameras || cameras.length === 0) throw new Error("No cameras found");

      const back = cameras.find((c) => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];

      await scanner.start(
        back.id,
        {
          fps: 10,
          aspectRatio: 1.333,
          qrbox: undefined,
        },
        () => {},
        () => {},
      );
    } catch (error) {
      logger.error("Camera error:", error);
      toast.error(t("grocery.input.recipe.cameraFailed", "Couldn't start the camera"));
      setShowCamera(false);
    }
  };

  const stopCamera = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch {
      // Already stopped.
    }
    setShowCamera(false);
  };

  const capturePhoto = async () => {
    const videoEl = document.querySelector("#recipe-camera video") as HTMLVideoElement | null;
    if (!videoEl || videoEl.videoWidth === 0) {
      toast.error(t("grocery.input.recipe.cameraNotReady", "Camera not ready yet"));
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoEl, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg", 0.85);
      setCapturedImage(imageData);
      await stopCamera();
      void handleParseImage(imageData);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result;
      if (typeof imageData !== "string") return;
      setCapturedImage(imageData);
      void handleParseImage(imageData);
    };
    reader.readAsDataURL(file);
  };

  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleImport = () => {
    if (!review) return;
    const items = rowsToGroceryAdds(review.rows, selected, review.recipeId);
    if (items.length === 0) {
      toast.error(t("grocery.input.recipe.selectOne", "Select at least one ingredient"));
      return;
    }
    onImport(items);
    handleClose();
    toast.success(t("grocery.input.recipe.added", { defaultValue: "Added {{count}} items to the list", count: items.length }));
  };

  const handleClose = () => {
    void stopCamera();
    setRecipeUrl("");
    setSearch("");
    setCapturedImage(null);
    setReview(null);
    setSelected(new Set());
    setActiveTab("recipes");
    onOpenChange(false);
  };

  const allSelected = review ? review.rows.length > 0 && review.rows.every((r) => selected.has(r.key)) : false;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            {t("grocery.input.recipe.title", "Add a recipe to the list")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "grocery.input.recipe.description",
              "Pick one of your recipes, or read one from a link or photo. Only what you're missing is selected.",
            )}
          </DialogDescription>
        </DialogHeader>

        {review ? (
          <div className="flex-1 overflow-y-auto py-2 space-y-4">
            <div className="flex items-start gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={() => setReview(null)}
                aria-label={t("grocery.input.recipe.back", "Back to recipes")}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <div className="min-w-0">
                <h3 className="font-semibold text-lg">{review.title}</h3>
                {review.servings !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    {t("grocery.input.recipe.servings", { defaultValue: "Serves {{count}}", count: review.servings })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t("grocery.input.recipe.pickIngredients", "Ingredients to add")}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 sm:h-9"
                onClick={() => setSelected(allSelected ? new Set() : new Set(review.rows.map((r) => r.key)))}
              >
                {allSelected
                  ? t("grocery.input.preview.deselectAll", "Deselect all")
                  : t("grocery.input.preview.selectAll", "Select all")}
              </Button>
            </div>

            <ul className="space-y-2">
              {review.rows.map((row) => {
                const id = `recipe-ingredient-${row.key}`;
                return (
                  <li key={row.key} className="flex items-start gap-3 rounded-lg border p-3">
                    <Checkbox
                      id={id}
                      checked={selected.has(row.key)}
                      onCheckedChange={() => toggleRow(row.key)}
                      className="mt-0.5 h-5 w-5"
                    />
                    <div className="min-w-0 flex-1 text-sm">
                      <Label htmlFor={id} className="block cursor-pointer font-medium">
                        {row.name}
                      </Label>
                      <p className="text-muted-foreground">
                        {row.unit ? `${row.quantity} ${row.unit}` : row.quantity}
                        {!row.missing && ` - ${t("grocery.input.recipe.covered", "you have this")}`}
                      </p>
                      {row.notes && <p className="mt-1 text-xs text-muted-foreground">{row.notes}</p>}
                      {row.conflicts.length > 0 && (
                        <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {t("grocery.input.allergen.notFor", {
                              defaultValue: "Allergen: {{list}}",
                              list: describeConflicts(row.conflicts),
                            })}
                          </span>
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {review.rows.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("grocery.input.recipe.noRows", "This recipe has no ingredients to add.")}
              </p>
            )}

            <div className="flex gap-2 border-t pt-4">
              <Button variant="outline" onClick={handleClose} className="h-11 flex-1">
                {t("grocery.input.cancel", "Cancel")}
              </Button>
              <Button onClick={handleImport} disabled={selected.size === 0} className="h-11 flex-1">
                <ShoppingCart className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("grocery.input.recipe.addN", { defaultValue: "Add {{count}} items", count: selected.size })}
              </Button>
            </div>
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabValue)}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="recipes" className="gap-2">
                <ChefHat className="h-4 w-4" aria-hidden="true" />
                {t("grocery.input.recipe.myRecipes", "My recipes")}
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-2">
                <Link2 className="h-4 w-4" aria-hidden="true" />
                {t("grocery.input.recipe.urlTab", "Link")}
              </TabsTrigger>
              <TabsTrigger value="photo" className="gap-2">
                <Camera className="h-4 w-4" aria-hidden="true" />
                {t("grocery.input.recipe.photoTab", "Photo")}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              <TabsContent value="recipes" className="space-y-3 mt-0">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("grocery.input.recipe.searchPlaceholder", "Search your recipes")}
                    aria-label={t("grocery.input.recipe.search", "Search your recipes")}
                    className="h-11 pl-9"
                  />
                </div>
                {recipes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("grocery.input.recipe.noneSaved", "No saved recipes yet. Add one from a link or a photo.")}
                  </p>
                ) : visibleRecipes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("grocery.input.recipe.noMatch", "No recipes match that search.")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {visibleRecipes.map((recipe) => {
                      const missing = missingByRecipeId.get(recipe.id) ?? 0;
                      return (
                        <li key={recipe.id}>
                          <button
                            type="button"
                            onClick={() => pickRecipe(recipe)}
                            className="flex w-full min-h-11 flex-col gap-1 rounded-lg border p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="flex w-full items-center gap-2">
                              <span className="min-w-0 flex-1 truncate font-medium">{recipe.name}</span>
                              {missing > 0 ? (
                                <Badge variant="secondary" className="shrink-0">
                                  {t("grocery.input.recipe.needs", { defaultValue: "Needs {{count}}", count: missing })}
                                </Badge>
                              ) : (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {t("grocery.input.recipe.haveAll", "Have everything")}
                                </span>
                              )}
                            </span>
                            <KidFitBadges fit={fitByRecipeId.get(recipe.id)} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="url" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="recipe-url">{t("grocery.input.recipe.urlLabel", "Recipe URL")}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="recipe-url"
                      type="url"
                      inputMode="url"
                      className="h-11"
                      value={recipeUrl}
                      onChange={(e) => setRecipeUrl(e.target.value)}
                      placeholder="https://example.com/recipe"
                      disabled={isParsing}
                    />
                    <Button onClick={handleParseUrl} disabled={isParsing || !recipeUrl.trim()} className="h-11">
                      {isParsing ? (
                        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                      ) : (
                        t("grocery.input.recipe.read", "Read")
                      )}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="photo" className="space-y-4 mt-0">
                {/* US-632: the photo goes to an AI provider; say so before it is taken. */}
                <p className="text-xs text-muted-foreground">{PHOTO_AI_NOTICE}</p>
                {!showCamera && !capturedImage && (
                  <div className="flex flex-col gap-3">
                    <Button onClick={startCamera} size="lg" className="w-full">
                      <Camera className="h-5 w-5 mr-2" aria-hidden="true" />
                      {t("grocery.input.recipe.takePhoto", "Take photo")}
                    </Button>
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="lg" className="w-full">
                      <Upload className="h-5 w-5 mr-2" aria-hidden="true" />
                      {t("grocery.input.recipe.uploadImage", "Upload image")}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      aria-label={t("grocery.input.recipe.uploadImage", "Upload image")}
                    />
                  </div>
                )}

                {showCamera && (
                  <div className="space-y-4">
                    <div className="relative overflow-hidden rounded-lg bg-muted">
                      <div id="recipe-camera" className="aspect-video w-full" />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={capturePhoto} className="h-11 flex-1">
                        <Camera className="h-5 w-5 mr-2" aria-hidden="true" />
                        {t("grocery.input.recipe.capture", "Capture")}
                      </Button>
                      <Button onClick={() => void stopCamera()} variant="outline" className="h-11">
                        {t("grocery.input.cancel", "Cancel")}
                      </Button>
                    </div>
                  </div>
                )}

                {capturedImage && !isParsing && (
                  <img
                    src={capturedImage}
                    alt={t("grocery.input.recipe.photoAlt", "Recipe photo")}
                    className="w-full rounded-lg border"
                  />
                )}
              </TabsContent>

              {isParsing && (
                <Card className="p-8" aria-live="polite" aria-busy="true">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 text-primary motion-safe:animate-spin" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      {t("grocery.input.recipe.parsing", "Reading the recipe...")}
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
