import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Zap, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { FoodCategory } from "@/types";
import { logger } from "@/lib/logger";
import { useApp } from "@/contexts/AppContext";
import { useAutoRestockPref } from "@/hooks/useAutoRestockPref";
import {
  chipLabel,
  urgencyBucket,
  type DepletionForecast,
} from "@/lib/depletionForecast";
import { forecastForFood } from "@/lib/depletionForecastWiring";
import { analytics } from "@/lib/analytics";

interface RestockSuggestion {
  food_id: string;
  food_name: string;
  current_quantity: number;
  recommended_quantity: number;
  reason: string;
  priority: 'low' | 'medium' | 'high';
  category: FoodCategory;
  aisle?: string;
}

interface SmartRestockSuggestionsProps {
  userId: string;
  kidId?: string;
  onAddItems: (items: Array<{
    name: string;
    quantity: number;
    unit: string;
    category: FoodCategory;
    aisle?: string;
    auto_generated?: boolean;
    restock_reason?: string;
    priority?: string;
  }>) => void;
}

// US-299 auto-restock safety rails. Tracked in localStorage so they
// survive reload but never block typed schema rollout.
const AUTO_ADDED_TODAY_KEY = "eatpal.auto_restock_added_today";
const BLOCKLIST_KEY = "eatpal.auto_restock_blocklist";
const MAX_AUTO_ADDS_PER_DAY = 20;
const BLOCKLIST_TTL_DAYS = 7;

interface AutoAddLog {
  date: string; // YYYY-MM-DD
  count: number;
}

function readAutoAddLog(): AutoAddLog {
  try {
    const raw = localStorage.getItem(AUTO_ADDED_TODAY_KEY);
    if (!raw) return { date: new Date().toISOString().slice(0, 10), count: 0 };
    const parsed = JSON.parse(raw) as AutoAddLog;
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date !== today) return { date: today, count: 0 };
    return parsed;
  } catch {
    return { date: new Date().toISOString().slice(0, 10), count: 0 };
  }
}

function writeAutoAddLog(log: AutoAddLog) {
  try {
    localStorage.setItem(AUTO_ADDED_TODAY_KEY, JSON.stringify(log));
  } catch {
    // localStorage quota / disabled — ignore. The rate-limit just resets.
  }
}

function readBlocklist(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BLOCKLIST_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function isBlocklisted(nameLower: string): boolean {
  const blocklist = readBlocklist();
  const blockedAt = blocklist[nameLower];
  if (!blockedAt) return false;
  const ageMs = Date.now() - new Date(blockedAt).getTime();
  return ageMs < BLOCKLIST_TTL_DAYS * 86_400_000;
}

const URGENCY_CHIP_STYLES: Record<ReturnType<typeof urgencyBucket>, string> = {
  critical: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  soon: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  later: "bg-muted text-muted-foreground border-muted-foreground/20",
};

const CONFIDENCE_OPACITY: Record<DepletionForecast["confidence"], string> = {
  high: "opacity-100",
  medium: "opacity-90",
  low: "opacity-70",
  "cold-start": "opacity-50",
};

export function SmartRestockSuggestions({
  userId,
  kidId,
  onAddItems
}: SmartRestockSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const { foods, groceryItems } = useApp();
  const { enabled: autoRestockEnabled, leadDays: autoRestockLeadDays } = useAutoRestockPref();
  const autoAddedRef = useRef(false);

  useEffect(() => {
    loadSuggestions();
  }, [userId, kidId]);

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('detect_restock_needs', {
        p_user_id: userId,
        p_kid_id: kidId || null
      });

      if (error) {
        logger.error('Error loading restock suggestions:', error);
      } else if (data) {
        setSuggestions(data.map((item) => ({
          ...item,
          priority: item.priority as 'low' | 'medium' | 'high',
          category: item.category as FoodCategory,
        })));
      }
    } catch (err) {
      logger.error('Failed to load suggestions:', err);
    } finally {
      setLoading(false);
    }
  };

  const addAllToList = () => {
    const items = suggestions.map(s => ({
      name: s.food_name,
      quantity: s.recommended_quantity,
      unit: 'servings',
      category: s.category,
      aisle: s.aisle,
      auto_generated: true,
      restock_reason: s.reason,
      priority: s.priority
    }));

    onAddItems(items);
    toast.success(`Added ${items.length} items to your grocery list!`, {
      description: 'Smart restock suggestions applied'
    });
    setDismissed(true);
  };

  const addSingleItem = (suggestion: RestockSuggestion) => {
    onAddItems([{
      name: suggestion.food_name,
      quantity: suggestion.recommended_quantity,
      unit: 'servings',
      category: suggestion.category,
      aisle: suggestion.aisle,
      auto_generated: true,
      restock_reason: suggestion.reason,
      priority: suggestion.priority
    }]);
    
    toast.success(`Added ${suggestion.food_name} to list`);
    setSuggestions(prev => prev.filter(s => s.food_id !== suggestion.food_id));
  };

  if (loading) {
    return (
      <Card className="p-6 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }

  // US-299 — Per-suggestion forecast. Foods + groceryItems come from the
  // existing AppContext load (no extra DB round trips). When the food
  // can't be matched or has no quantity, we just skip the chip rather
  // than fail loudly.
  const forecastsByFoodId = useMemo(() => {
    const out = new Map<string, DepletionForecast>();
    const foodById = new Map(foods.map((f) => [f.id, f]));
    for (const s of suggestions) {
      const food = foodById.get(s.food_id);
      if (!food) continue;
      const overrideQty = typeof s.current_quantity === "number"
        ? s.current_quantity
        : food.quantity;
      const forecast = forecastForFood(
        { id: food.id, name: food.name, quantity: overrideQty },
        groceryItems
      );
      if (forecast) out.set(s.food_id, forecast);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, foods.length, groceryItems.length]);

  // Telemetry: fire once per (suggestion list, confidence-bucket mix)
  const telemetryFiredRef = useRef<string>("");
  useEffect(() => {
    if (forecastsByFoodId.size === 0) return;
    const fingerprint = Array.from(forecastsByFoodId.values())
      .map((f) => `${f.confidence}-${urgencyBucket(f.daysToDepletion)}`)
      .sort()
      .join(",");
    if (telemetryFiredRef.current === fingerprint) return;
    telemetryFiredRef.current = fingerprint;
    for (const forecast of forecastsByFoodId.values()) {
      analytics.trackEvent("depletion_forecast_shown", {
        confidence: forecast.confidence,
        days_to_depletion: forecast.daysToDepletion,
        urgency: urgencyBucket(forecast.daysToDepletion),
      });
    }
  }, [forecastsByFoodId]);

  // US-299 auto-add effect. Gated by the user preference + per-day cap +
  // 7-day blocklist for items the user removed recently.
  useEffect(() => {
    if (!autoRestockEnabled) return;
    if (autoAddedRef.current) return;
    if (forecastsByFoodId.size === 0) return;
    autoAddedRef.current = true;

    const log = readAutoAddLog();
    const remainingBudget = MAX_AUTO_ADDS_PER_DAY - log.count;
    if (remainingBudget <= 0) return;

    // Dedupe against current grocery list contents (unchecked rows only).
    const existingNames = new Set(
      groceryItems
        .filter((g) => !g.checked)
        .map((g) => g.name.trim().toLowerCase())
    );

    const candidates = suggestions.filter((s) => {
      const forecast = forecastsByFoodId.get(s.food_id);
      if (!forecast) return false;
      if (forecast.daysToDepletion > autoRestockLeadDays) return false;
      const nameLower = s.food_name.trim().toLowerCase();
      if (existingNames.has(nameLower)) return false;
      if (isBlocklisted(nameLower)) return false;
      return true;
    });

    if (candidates.length === 0) return;
    const toAdd = candidates.slice(0, remainingBudget);

    onAddItems(
      toAdd.map((s) => ({
        name: s.food_name,
        quantity: s.recommended_quantity,
        unit: "servings",
        category: s.category,
        aisle: s.aisle,
        auto_generated: true,
        restock_reason: `forecast: runs out in ${forecastsByFoodId.get(s.food_id)?.daysToDepletion ?? "?"} days`,
        priority: s.priority,
      }))
    );

    writeAutoAddLog({ date: log.date, count: log.count + toAdd.length });

    for (const s of toAdd) {
      const forecast = forecastsByFoodId.get(s.food_id);
      analytics.trackEvent("depletion_auto_added", {
        food_id: s.food_id,
        confidence: forecast?.confidence,
        lead_days: autoRestockLeadDays,
      });
    }

    toast.success(
      `Auto-restocked ${toAdd.length} item${toAdd.length !== 1 ? "s" : ""}`,
      { description: "Predicted to run out soon — tap 'Not quite' to opt out for a week." }
    );
    setSuggestions((prev) =>
      prev.filter((s) => !toAdd.some((added) => added.food_id === s.food_id))
    );
  }, [
    autoRestockEnabled,
    autoRestockLeadDays,
    forecastsByFoodId,
    groceryItems,
    onAddItems,
    suggestions,
  ]);

  const handleNotQuite = (suggestion: RestockSuggestion) => {
    const blocklist = readBlocklist();
    const nameLower = suggestion.food_name.trim().toLowerCase();
    blocklist[nameLower] = new Date().toISOString();
    try {
      localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(blocklist));
    } catch {
      // ignore
    }
    analytics.trackEvent("depletion_correction_logged", {
      food_id: suggestion.food_id,
    });
    setSuggestions((prev) => prev.filter((s) => s.food_id !== suggestion.food_id));
    toast("Got it — we'll skip this for a week.");
  };

  if (suggestions.length === 0 || dismissed) return null;

  const highPriority = suggestions.filter(s => s.priority === 'high').length;

  return (
    <Card className="p-6 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20 animate-in slide-in-from-top">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-semibold">Smart Restock Suggestions</h3>
            {highPriority > 0 && (
              <Badge variant="destructive" className="ml-2">
                {highPriority} Urgent
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {suggestions.length} item{suggestions.length !== 1 ? 's' : ''} need restocking based on your meal plan and shopping patterns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={addAllToList} size="sm" className="whitespace-nowrap">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Add All
          </Button>
          <Button 
            onClick={() => setDismissed(true)} 
            variant="ghost" 
            size="icon"
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {suggestions.map((suggestion) => {
          const forecast = forecastsByFoodId.get(suggestion.food_id);
          const urgency = forecast ? urgencyBucket(forecast.daysToDepletion) : null;
          return (
          <div
            key={suggestion.food_id}
            className="flex items-center justify-between p-3 bg-background rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="font-medium truncate">{suggestion.food_name}</p>
                {suggestion.priority === 'high' && (
                  <Badge variant="destructive" className="text-xs shrink-0">
                    Urgent
                  </Badge>
                )}
                {suggestion.priority === 'medium' && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    Soon
                  </Badge>
                )}
                {forecast && urgency && (
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ${URGENCY_CHIP_STYLES[urgency]} ${CONFIDENCE_OPACITY[forecast.confidence]}`}
                    title={`Confidence: ${forecast.confidence} (${forecast.cycleCount} cycles)`}
                  >
                    {chipLabel(forecast.daysToDepletion)}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {suggestion.reason}
              </p>
              {forecast && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNotQuite(suggestion);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline mt-0.5"
                  aria-label={`Skip ${suggestion.food_name} for a week`}
                >
                  Not quite
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 ml-4">
              <div className="text-right">
                <p className="text-sm font-medium">
                  Need: {suggestion.recommended_quantity}
                </p>
                <p className="text-xs text-muted-foreground">
                  Have: {suggestion.current_quantity}
                </p>
              </div>
              <Button
                onClick={() => addSingleItem(suggestion)}
                variant="outline"
                size="sm"
                className="shrink-0"
              >
                <ShoppingCart className="h-3 w-3" />
              </Button>
            </div>
          </div>
          );
        })}
      </div>
    </Card>
  );
}

