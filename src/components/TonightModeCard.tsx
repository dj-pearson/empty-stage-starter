import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChefHat, Clock, Loader2, Plus, ShieldCheck, UtensilsCrossed } from "lucide-react";
import { useFoods, useKids, useRecipes, usePlan } from "@/contexts/AppContext";
import { analytics } from "@/lib/analytics";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { getKidFoodFit } from "@/lib/kidFit";
import {
  fetchTonightSuggestions,
  clientFallbackSuggestions,
  shouldShowPanicCta,
  todayDinnerPlanned,
  type TonightSuggestion,
} from "@/lib/tonightMode";
import { selectTargetKids, useTodayKey } from "@/hooks/useTonightPlan";
import { TonightSuggestionsDialog } from "@/components/TonightSuggestionsDialog";
import "@/i18n/appLocale";

const STORAGE_KEY = "tonightMode.selectedKidIds";
const EDGE_TIMEOUT_MS = 1500;
const SAFE_PLATE_LIMIT = 6;

interface TonightModeCardProps {
  className?: string;
  /**
   * When true the giant panic CTA is forced on regardless of time-of-day.
   * Used by the test harness; production callers omit this prop.
   */
  forceShow?: boolean;
  /**
   * "inline" drops the card's own border and padding, for a parent that is
   * already a card (the home hero), so it is not a card nested in a card.
   */
  variant?: "card" | "inline";
}

export function TonightModeCard({ className, forceShow, variant = "card" }: TonightModeCardProps) {
  const { t } = useTranslation();
  const { foods } = useFoods();
  const { kids, activeKidId } = useKids();
  const { recipes } = useRecipes();
  const { planEntries } = usePlan();
  const [selectedKidIds, setSelectedKidIds] = useLocalStorage<string[]>(
    STORAGE_KEY,
    [],
  );
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<TonightSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const cardShownRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // Rolls over when a tab left open overnight becomes visible again.
  const today = useTodayKey();
  const targetKids = useMemo(() => selectTargetKids(kids, activeKidId), [kids, activeKidId]);
  const targetKidIds = useMemo(() => targetKids.map((k) => k.id), [targetKids]);
  const dinnerPlanned = useMemo(
    () => todayDinnerPlanned(planEntries, today, targetKidIds),
    [planEntries, today, targetKidIds],
  );
  const showPanic = forceShow || shouldShowPanicCta({ todayDinnerPlanned: dinnerPlanned });

  useEffect(() => {
    if (!showPanic || cardShownRef.current || kids.length === 0) return;
    cardShownRef.current = true;
    analytics.trackEvent("tonight_mode_card_shown", {
      time_of_day: new Date().getHours(),
      plan_empty: !dinnerPlanned,
      pantry_size: foods.length,
      kid_count: kids.length,
    });
  }, [showPanic, dinnerPlanned, foods.length, kids.length]);

  // Abort whatever is in flight when the card goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Edge function falls back to scoping by user when no household is provided,
  // so we don't need to surface household_id on the client.
  const householdId: string | null = null;

  const effectiveKidIds = useMemo(() => {
    const knownIds = new Set(kids.map((k) => k.id));
    const filtered = selectedKidIds.filter((id) => knownIds.has(id));
    return filtered.length ? filtered : kids.map((k) => k.id);
  }, [selectedKidIds, kids]);

  // Safe foods every target kid can have, for the no-recipes fallback.
  const safePlate = useMemo(() => {
    if (recipes.length > 0) return [];
    return foods
      .filter((f) => f.is_safe)
      .filter((f) =>
        targetKids.every((k) => {
          const fit = getKidFoodFit(k, f, []);
          return !fit.allergen && !fit.disliked;
        }),
      )
      .slice(0, SAFE_PLATE_LIMIT);
  }, [recipes.length, foods, targetKids]);

  const loadSuggestions = useCallback(async () => {
    // A re-run supersedes the last one: abort it, and ignore it if it answers anyway.
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setSuggestions(null);
    const start = performance.now();
    let resolved: TonightSuggestion[] | null = null;
    const timeoutId = window.setTimeout(() => ac.abort(), EDGE_TIMEOUT_MS);
    try {
      const edgeResults = await fetchTonightSuggestions({
        householdId,
        kidIds: effectiveKidIds,
        signal: ac.signal,
      });
      if (edgeResults.length > 0) {
        resolved = edgeResults;
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        logger.warn("tonight-mode edge call failed; falling back", err);
      }
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (requestId !== requestIdRef.current) return;

    if (!resolved) {
      resolved = clientFallbackSuggestions({
        recipes,
        foods,
        kids,
        planEntries,
        selectedKidIds: effectiveKidIds,
      });
    }

    const durationMs = Math.round(performance.now() - start);
    setSuggestions(resolved);
    setLoading(false);
    analytics.trackEvent("tonight_mode_loaded", {
      result_count: resolved.length,
      duration_ms: durationMs,
      source: resolved[0]?.source ?? "empty",
      kid_count: effectiveKidIds.length,
    });
  }, [effectiveKidIds, foods, householdId, kids, planEntries, recipes]);

  const onOpen = useCallback(() => {
    analytics.trackEvent("tonight_mode_opened", {
      via: showPanic ? "panic_cta" : "always_button",
      pantry_size: foods.length,
      kid_count: effectiveKidIds.length,
    });
    setOpen(true);
    void loadSuggestions();
  }, [showPanic, foods.length, effectiveKidIds.length, loadSuggestions]);

  const onClose = useCallback(() => {
    abortRef.current?.abort();
    requestIdRef.current += 1;
    setLoading(false);
    setOpen(false);
  }, []);

  // No kids: the setup checklist owns that state.
  if (kids.length === 0) {
    return null;
  }

  const frame = variant === "card" ? "rounded-xl border bg-card p-4" : "";
  // Meal Builder opens on the active kid; name them when there is exactly one.
  const plateKid = targetKids.length === 1 ? targetKids[0] : null;

  if (recipes.length === 0) {
    return (
      <div className={cn(frame, "space-y-2", className)}>
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4 text-safe-food" aria-hidden="true" />
          {t("tonightMode.safePlate.title", { defaultValue: "Build a safe plate" })}
        </p>
        {safePlate.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              {t("tonightMode.safePlate.body", {
                defaultValue: "No recipes yet. Pick two or three foods everyone eats:",
              })}
            </p>
            <ul className="flex flex-wrap gap-1.5" aria-label={t("tonightMode.safePlate.listLabel", { defaultValue: "Safe foods" })}>
              {safePlate.map((f) => (
                <li
                  key={f.id}
                  className="rounded-full border border-safe-food/30 bg-safe-food/10 px-2.5 py-0.5 text-xs text-foreground"
                >
                  {f.name}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("tonightMode.safePlate.empty", {
              defaultValue: "Add a recipe and we'll suggest dinners that fit each kid.",
            })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link to="/dashboard/recipes" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("tonightMode.safePlate.addRecipe", { defaultValue: "Add a recipe" })}
          </Link>
          <Link to="/dashboard/meal-builder" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <UtensilsCrossed className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {plateKid
              ? t("tonightMode.safePlate.buildPlateFor", {
                  defaultValue: "Build a plate with {{name}}",
                  name: plateKid.name,
                })
              : t("tonightMode.safePlate.buildPlate", { defaultValue: "Build a plate in Meal Builder" })}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {variant === "inline" ? (
        // Inside the home hero, which already says dinner is not planned: just
        // the button, outlined so "Plan dinner" stays the primary action.
        <Button
          variant="outline"
          onClick={onOpen}
          className={cn("min-h-11 gap-2", className)}
          aria-label={t("tonightMode.openLabel", { defaultValue: "Open Tonight Mode dinner suggestions" })}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <ChefHat className="h-4 w-4" aria-hidden="true" />
          )}
          {showPanic
            ? t("tonightMode.panic.cta", { defaultValue: "Help me with dinner" })
            : t("tonightMode.ideas", { defaultValue: "Need ideas for tonight?" })}
        </Button>
      ) : showPanic ? (
        <div className={cn(frame, className)}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <p className="font-semibold">
                {t("tonightMode.panic.title", { defaultValue: "Dinner in 20 minutes" })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("tonightMode.panic.body", {
                  defaultValue: "No plan? We'll pick 3 things you can cook with what you have.",
                })}
              </p>
            </div>
            <Button
              onClick={onOpen}
              className="min-h-11 w-full md:w-auto"
              aria-label={t("tonightMode.openLabel", { defaultValue: "Open Tonight Mode dinner suggestions" })}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <ChefHat className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {t("tonightMode.panic.cta", { defaultValue: "Help me with dinner" })}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpen}
          className={cn("gap-2", className)}
          aria-label={t("tonightMode.openLabel", { defaultValue: "Open Tonight Mode dinner suggestions" })}
        >
          <Clock className="h-4 w-4" aria-hidden="true" />
          {t("tonightMode.ideas", { defaultValue: "Need ideas for tonight?" })}
        </Button>
      )}

      <TonightSuggestionsDialog
        open={open}
        loading={loading}
        suggestions={suggestions}
        kids={kids}
        selectedKidIds={effectiveKidIds}
        onSelectedKidIdsChange={setSelectedKidIds}
        onClose={onClose}
        onRefresh={loadSuggestions}
      />
    </>
  );
}
