import { useCallback, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Users2, RefreshCw, Sparkles, ChefHat, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSiblingResolutions } from '@/hooks/useSiblingResolutions';
import { findSiblingMeals } from '@/lib/siblingMealFinder';
import type { SolverResult } from '@/lib/siblingConstraintSolver';
import { analytics } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { todayIso } from '@/lib/tonightMode';
import { SiblingPickerChips } from '@/components/sibling-meal-finder/SiblingPickerChips';
import { SiblingMealResultCard } from '@/components/sibling-meal-finder/SiblingMealResultCard';
import { FairnessIndicator } from '@/components/sibling-meal-finder/FairnessIndicator';
import { TonightCookDialog } from '@/components/TonightCookDialog';
import type { MealSlot } from '@/types';

const STORAGE_KEY = 'siblingMealFinder.selectedKidIds';

const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack1', label: 'Snack' },
];

export default function SiblingMealFinder() {
  const { kids, foods, recipes, addPlanEntry } = useApp();
  const { history, recordResolution } = useSiblingResolutions();

  const [selectedKidIds, setSelectedKidIds] = useLocalStorage<string[]>(STORAGE_KEY, []);
  const [maxMinutes, setMaxMinutes] = useState<number>(30);
  const [mealDate, setMealDate] = useState<string>(todayIso());
  const [mealSlot, setMealSlot] = useState<MealSlot>('dinner');

  const [results, setResults] = useState<SolverResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [acceptedRecipeId, setAcceptedRecipeId] = useState<string | null>(null);
  const [cookingRecipeId, setCookingRecipeId] = useState<string | null>(null);

  const effectiveKidIds = useMemo(() => {
    const known = new Set(kids.map((k) => k.id));
    const filtered = selectedKidIds.filter((id) => known.has(id));
    return filtered.length ? filtered : kids.map((k) => k.id);
  }, [selectedKidIds, kids]);

  const cookingRecipe = useMemo(
    () => (cookingRecipeId ? (recipes.find((r) => r.id === cookingRecipeId) ?? null) : null),
    [recipes, cookingRecipeId]
  );

  const selectedKidsObj = useMemo(
    () => kids.filter((k) => effectiveKidIds.includes(k.id)),
    [kids, effectiveKidIds]
  );

  const runSolver = useCallback(() => {
    if (kids.length === 0) {
      toast.error('Add a kid profile first.');
      return;
    }
    if (recipes.length === 0) {
      toast.error('Add some recipes first - the solver needs a library to choose from.');
      return;
    }
    setRunning(true);
    setAcceptedRecipeId(null);
    try {
      const r = findSiblingMeals({
        recipes,
        foods,
        kids,
        selectedKidIds: effectiveKidIds,
        history,
        options: { maxMinutes, limit: 8 },
      });
      setResults(r);
      analytics.trackEvent('sibling_solver_run', {
        kid_count: effectiveKidIds.length,
        recipe_count: recipes.length,
        result_count: r.filter((x) => !x.excluded).length,
        full_match_count: r.filter((x) => !x.excluded && x.resolutionType === 'full_match').length,
        with_swaps_count: r.filter((x) => !x.excluded && x.resolutionType === 'with_swaps').length,
        split_plate_count: r.filter((x) => !x.excluded && x.resolutionType === 'split_plate')
          .length,
        max_minutes: maxMinutes,
      });
    } catch (err) {
      logger.error('siblingSolver error', err);
      toast.error("Couldn't run the solver. Try again?");
    } finally {
      setRunning(false);
    }
  }, [kids, recipes, foods, effectiveKidIds, history, maxMinutes]);

  const handleUse = useCallback(
    async (result: SolverResult) => {
      try {
        addPlanEntry({
          kid_id: effectiveKidIds[0] ?? '',
          date: mealDate,
          meal_slot: mealSlot,
          food_id: '',
          result: null,
          recipe_id: result.recipeId,
          is_primary_dish: true,
        });
        // Add a plan entry per additional kid so each sibling has the meal logged.
        for (const kidId of effectiveKidIds.slice(1)) {
          addPlanEntry({
            kid_id: kidId,
            date: mealDate,
            meal_slot: mealSlot,
            food_id: '',
            result: null,
            recipe_id: result.recipeId,
            is_primary_dish: true,
          });
        }

        const ok = await recordResolution({
          result,
          selectedKidIds: effectiveKidIds,
          planEntryId: null,
        });

        analytics.trackEvent('sibling_solution_chosen', {
          recipe_id: result.recipeId,
          resolution_type: result.resolutionType,
          satisfaction_score: result.satisfactionScore,
          kid_count: effectiveKidIds.length,
          swap_count: result.swaps.length,
          split_plate_count: result.splitPlates.length,
          recorded: ok,
          meal_slot: mealSlot,
        });

        setAcceptedRecipeId(result.recipeId);
        toast.success(
          `${result.recipeName} added to ${MEAL_SLOTS.find((m) => m.value === mealSlot)?.label.toLowerCase() ?? mealSlot} for ${effectiveKidIds.length} ${effectiveKidIds.length === 1 ? 'kid' : 'kids'}.`
        );
      } catch (err) {
        logger.error('siblingSolver use error', err);
        toast.error("Couldn't add the meal to the planner.");
      }
    },
    [addPlanEntry, effectiveKidIds, mealDate, mealSlot, recordResolution]
  );

  const handleCook = useCallback((result: SolverResult) => {
    setCookingRecipeId(result.recipeId);
    analytics.trackEvent('sibling_cook_now', {
      recipe_id: result.recipeId,
      resolution_type: result.resolutionType,
    });
  }, []);

  const visibleResults = useMemo(() => (results ?? []).filter((r) => !r.excluded), [results]);
  const excludedCount = useMemo(() => (results ?? []).filter((r) => r.excluded).length, [results]);

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-5xl space-y-6">
      <Helmet>
        <title>Sibling Meal Finder | EatPal</title>
        <meta
          name="description"
          content="Find dinners that work for every kid in the house - allergens, dietary restrictions, dislikes and favorites all balanced."
        />
      </Helmet>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Users2 className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Sibling Meal Finder</h1>
        </div>
        <p className="text-muted-foreground">
          Find one dinner that satisfies every selected kid. We balance hard constraints (allergens,
          dietary restrictions) against soft ones (dislikes, favorites) and surface swaps or
          split-plate ideas when no single recipe fits all.
        </p>
      </header>

      <FairnessIndicator kids={selectedKidsObj} history={history} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who's eating?</CardTitle>
          <CardDescription>
            Pick the siblings to plan for. Skip the picker to include everyone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {kids.length === 0 ? (
            <Alert>
              <AlertTitle>No kid profiles yet</AlertTitle>
              <AlertDescription>
                Add at least one kid in your dashboard so the solver knows who to plan for.
              </AlertDescription>
            </Alert>
          ) : (
            <SiblingPickerChips
              kids={kids}
              selectedKidIds={effectiveKidIds}
              onChange={(ids) => setSelectedKidIds(ids)}
              disabled={running}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="meal-date" className="text-xs">
                Meal date
              </Label>
              <Input
                id="meal-date"
                type="date"
                value={mealDate}
                onChange={(e) => setMealDate(e.target.value)}
                min={todayIso(new Date(2024, 0, 1))}
              />
            </div>
            <div>
              <Label htmlFor="meal-slot" className="text-xs">
                Meal slot
              </Label>
              <Select value={mealSlot} onValueChange={(v) => setMealSlot(v as MealSlot)}>
                <SelectTrigger id="meal-slot">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_SLOTS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="max-minutes" className="text-xs">
                Max prep (minutes)
              </Label>
              <Input
                id="max-minutes"
                type="number"
                min={5}
                max={240}
                value={maxMinutes}
                onChange={(e) => setMaxMinutes(Math.max(5, Number(e.target.value) || 30))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={runSolver}
              disabled={running || kids.length === 0 || recipes.length === 0}
              className="gap-2"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              Find a meal
            </Button>
            {results !== null && (
              <Button variant="outline" onClick={runSolver} disabled={running} className="gap-2">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Run again
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {results !== null && visibleResults.length === 0 && (
        <Alert>
          <ChefHat className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>No recipe satisfies everyone</AlertTitle>
          <AlertDescription>
            {excludedCount > 0
              ? `${excludedCount} recipes were ruled out by hard constraints (allergens or dietary restrictions). Try widening your recipe library or adjusting kid profiles.`
              : 'Add more recipes or relax the prep time.'}
          </AlertDescription>
        </Alert>
      )}

      {visibleResults.length > 0 && (
        <section className="space-y-3" aria-label="Sibling meal solver results">
          <h2 className="text-lg font-semibold">
            {visibleResults.length} {visibleResults.length === 1 ? 'match' : 'matches'}
          </h2>
          {visibleResults.map((r) => (
            <SiblingMealResultCard
              key={r.recipeId}
              result={r}
              onUse={handleUse}
              onCook={handleCook}
              isAccepted={acceptedRecipeId === r.recipeId}
            />
          ))}
        </section>
      )}

      <TonightCookDialog
        recipe={cookingRecipe}
        open={cookingRecipeId !== null}
        onClose={() => setCookingRecipeId(null)}
      />
    </div>
  );
}
