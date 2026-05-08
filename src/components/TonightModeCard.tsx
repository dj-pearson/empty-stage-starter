import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, ChefHat, Clock, Loader2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { analytics } from "@/lib/analytics";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { logger } from "@/lib/logger";
import {
  fetchTonightSuggestions,
  clientFallbackSuggestions,
  shouldShowPanicCta,
  todayDinnerPlanned,
  todayIso,
  type TonightSuggestion,
} from "@/lib/tonightMode";
import { TonightSuggestionsDialog } from "@/components/TonightSuggestionsDialog";

const STORAGE_KEY = "tonightMode.selectedKidIds";
const EDGE_TIMEOUT_MS = 1500;

interface TonightModeCardProps {
  className?: string;
  /**
   * When true the giant panic CTA is forced on regardless of time-of-day.
   * Used by the test harness; production callers omit this prop.
   */
  forceShow?: boolean;
}

export function TonightModeCard({ className, forceShow }: TonightModeCardProps) {
  const { foods, kids, recipes, planEntries } = useApp();
  const [selectedKidIds, setSelectedKidIds] = useLocalStorage<string[]>(
    STORAGE_KEY,
    [],
  );
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<TonightSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const cardShownRef = useRef(false);

  const today = useMemo(() => todayIso(), []);
  const dinnerPlanned = useMemo(
    () => todayDinnerPlanned(planEntries, today),
    [planEntries, today],
  );
  const showPanic = forceShow || shouldShowPanicCta({ todayDinnerPlanned: dinnerPlanned });

  useEffect(() => {
    if (!showPanic || cardShownRef.current) return;
    cardShownRef.current = true;
    analytics.trackEvent("tonight_mode_card_shown", {
      time_of_day: new Date().getHours(),
      plan_empty: !dinnerPlanned,
      pantry_size: foods.length,
      kid_count: kids.length,
    });
  }, [showPanic, dinnerPlanned, foods.length, kids.length]);

  // Edge function falls back to scoping by user when no household is provided,
  // so we don't need to surface household_id on the client.
  const householdId: string | null = null;

  const effectiveKidIds = useMemo(() => {
    const knownIds = new Set(kids.map((k) => k.id));
    const filtered = selectedKidIds.filter((id) => knownIds.has(id));
    return filtered.length ? filtered : kids.map((k) => k.id);
  }, [selectedKidIds, kids]);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    setSuggestions(null);
    const start = performance.now();
    let resolved: TonightSuggestion[] | null = null;
    try {
      const ac = new AbortController();
      const timeoutId = window.setTimeout(() => ac.abort(), EDGE_TIMEOUT_MS);
      const edgeResults = await fetchTonightSuggestions({
        householdId,
        kidIds: effectiveKidIds,
        signal: ac.signal,
      });
      window.clearTimeout(timeoutId);
      if (edgeResults.length > 0) {
        resolved = edgeResults;
      }
    } catch (err) {
      logger.warn("tonight-mode edge call failed; falling back", err);
    }

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

  if (kids.length === 0 || recipes.length === 0) {
    return null;
  }

  return (
    <>
      {showPanic ? (
        <Card
          className={`mb-6 border-2 border-orange-500/40 bg-gradient-to-br from-orange-500/10 via-amber-500/10 to-rose-500/5 shadow-lg ${className ?? ""}`}
        >
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="h-6 w-6 text-orange-500" aria-hidden="true" />
                  <Badge variant="secondary" className="bg-orange-500/15 text-orange-700 dark:text-orange-300 border-0">
                    Tonight Mode
                  </Badge>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                  Dinner in 20 minutes.
                </h2>
                <p className="text-muted-foreground mt-1">
                  No plan? We'll pick 3 things you can cook with what you have right now.
                </p>
              </div>
              <Button
                onClick={onOpen}
                size="lg"
                className="bg-orange-500 hover:bg-orange-600 text-white shadow-md w-full md:w-auto"
                aria-label="Open Tonight Mode dinner suggestions"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <ChefHat className="h-5 w-5 mr-2" aria-hidden="true" />
                )}
                Help me with dinner
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpen}
          className={`gap-2 ${className ?? ""}`}
          aria-label="Open Tonight Mode dinner suggestions"
        >
          <Clock className="h-4 w-4" aria-hidden="true" />
          Need ideas for tonight?
        </Button>
      )}

      <TonightSuggestionsDialog
        open={open}
        loading={loading}
        suggestions={suggestions}
        kids={kids}
        selectedKidIds={effectiveKidIds}
        onSelectedKidIdsChange={setSelectedKidIds}
        onClose={() => setOpen(false)}
        onRefresh={loadSuggestions}
      />
    </>
  );
}
