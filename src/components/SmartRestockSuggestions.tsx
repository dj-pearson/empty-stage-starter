import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Plus, Zap, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { FoodCategory } from "@/types";
import type { GroceryAddInput } from "@/lib/groceryMerge";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useFoods, useGrocery } from "@/contexts/AppContext";
import { useAutoRestockPref } from "@/hooks/useAutoRestockPref";
import {
  chipLabel,
  urgencyBucket,
  type DepletionForecast,
} from "@/lib/depletionForecast";
import { forecastForFood } from "@/lib/depletionForecastWiring";
import { analytics } from "@/lib/analytics";
import { toISODate } from "@/lib/date-utils";
import "@/i18n/appLocale";

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

/**
 * A restock add. restock_reason is a grocery_items column (and a GroceryRowDraft
 * key) that GroceryAddInput does not declare yet, so it rides along here.
 */
export type RestockAddInput = GroceryAddInput & { restock_reason?: string };

/** Who asked for the add: a tap here, or the auto-restock pass. */
export type RestockAddSource = 'manual' | 'auto';

interface SmartRestockSuggestionsProps {
  userId: string;
  kidId?: string;
  /**
   * Rows arrive tagged added_via 'restock' (a tap) or 'auto_restock'. This
   * component shows no success toast of its own: the page does, with Undo,
   * and `source` tells it which copy to use.
   */
  onAddItems: (items: GroceryAddInput[], source: RestockAddSource) => void;
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

/**
 * The stored log if it belongs to `today`, otherwise a fresh one (US-818).
 *
 * Pure so the rollover is testable without a clock or a localStorage stub.
 * A malformed or absent entry is the same answer as an expired one: start
 * today at zero.
 */
export function autoAddLogForToday(raw: string | null, today: string): AutoAddLog {
  if (!raw) return { date: today, count: 0 };
  try {
    const parsed = JSON.parse(raw) as AutoAddLog;
    if (parsed?.date !== today || typeof parsed.count !== 'number') {
      return { date: today, count: 0 };
    }
    return parsed;
  } catch {
    return { date: today, count: 0 };
  }
}

function readAutoAddLog(): AutoAddLog {
  // toISODate, not toISOString().slice(0, 10). The cap is "per day" as the
  // parent experiences a day, and toISOString converts to UTC first -- so on
  // the US west coast the twenty-a-day budget reset at 5pm and a household
  // could take another twenty before bedtime.
  const today = toISODate(new Date());
  try {
    return autoAddLogForToday(localStorage.getItem(AUTO_ADDED_TODAY_KEY), today);
  } catch {
    // localStorage disabled or throwing: no memory, so today starts at zero.
    return { date: today, count: 0 };
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

/** Urgency on semantic tokens, so both themes and high contrast follow. */
const URGENCY_CHIP_STYLES: Record<ReturnType<typeof urgencyBucket>, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  soon: "bg-warning/15 text-foreground border-warning/50",
  later: "bg-muted text-muted-foreground border-border",
};

const CONFIDENCE_OPACITY: Record<DepletionForecast["confidence"], string> = {
  high: "opacity-100",
  medium: "opacity-90",
  low: "opacity-70",
  "cold-start": "opacity-50",
};

const nameKey = (name: string) => name.trim().toLowerCase();

export function SmartRestockSuggestions({
  userId,
  kidId,
  onAddItems
}: SmartRestockSuggestionsProps) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { foods } = useFoods();
  const { groceryItems } = useGrocery();
  const { enabled: autoRestockEnabled, leadDays: autoRestockLeadDays } = useAutoRestockPref();
  const autoAddedRef = useRef(false);
  const listId = useId();

  // One request per (user, kid). A slow answer for the kid the parent just
  // switched away from used to land after the new kid's and overwrite it; the
  // ignore flag drops every answer but the latest.
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc('detect_restock_needs', {
          p_user_id: userId,
          // Omitted rather than null: the function defaults it to NULL, and
          // the generated RPC type does not accept an explicit null.
          p_kid_id: kidId || undefined
        });
        if (ignore) return;
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
        if (!ignore) logger.error('Failed to load suggestions:', err);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [userId, kidId]);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

  // Names already waiting on the list (unchecked). A suggestion for one of
  // them is shown as "on list", never offered again.
  const onListNames = useMemo(
    () => new Set(groceryItems.filter((g) => !g.checked).map((g) => nameKey(g.name))),
    [groceryItems],
  );
  const isOnList = useCallback((s: RestockSuggestion) => onListNames.has(nameKey(s.food_name)), [onListNames]);

  /** The pantry's own unit for the food, not a blanket "servings". */
  const unitFor = useCallback((s: RestockSuggestion) => foodById.get(s.food_id)?.unit ?? "", [foodById]);

  const toAddInput = useCallback(
    (s: RestockSuggestion, source: RestockAddSource, reason: string): RestockAddInput => ({
      name: s.food_name,
      quantity: s.recommended_quantity,
      unit: unitFor(s),
      category: s.category,
      aisle: s.aisle,
      auto_generated: true,
      restock_reason: reason,
      priority: s.priority,
      added_via: source === 'auto' ? 'auto_restock' : 'restock',
    }),
    [unitFor],
  );

  const addable = useMemo(() => suggestions.filter((s) => !isOnList(s)), [suggestions, isOnList]);

  const addAllToList = () => {
    if (loading || addable.length === 0) return;
    onAddItems(addable.map((s) => toAddInput(s, 'manual', s.reason)), 'manual');
    setDismissed(true);
  };

  const addSingleItem = (suggestion: RestockSuggestion) => {
    onAddItems([toAddInput(suggestion, 'manual', suggestion.reason)], 'manual');
    setSuggestions(prev => prev.filter(s => s.food_id !== suggestion.food_id));
  };

  // US-299 — Per-suggestion forecast. Foods + groceryItems come from the
  // existing AppContext load (no extra DB round trips). When the food
  // can't be matched or has no quantity, we just skip the chip rather
  // than fail loudly.
  const forecastsByFoodId = useMemo(() => {
    const out = new Map<string, DepletionForecast>();
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
  // 7-day blocklist for items the user removed recently. The page shows the
  // toast (with Undo); this only reports the add with source 'auto'.
  useEffect(() => {
    if (!autoRestockEnabled) return;
    if (autoAddedRef.current) return;
    if (loading) return;
    if (forecastsByFoodId.size === 0) return;
    autoAddedRef.current = true;

    const log = readAutoAddLog();
    const remainingBudget = MAX_AUTO_ADDS_PER_DAY - log.count;
    if (remainingBudget <= 0) return;

    const candidates = suggestions.filter((s) => {
      const forecast = forecastsByFoodId.get(s.food_id);
      if (!forecast) return false;
      if (forecast.daysToDepletion > autoRestockLeadDays) return false;
      const nameLower = nameKey(s.food_name);
      // Dedupe against current grocery list contents (unchecked rows only).
      if (onListNames.has(nameLower)) return false;
      if (isBlocklisted(nameLower)) return false;
      return true;
    });

    if (candidates.length === 0) return;
    const toAdd = candidates.slice(0, remainingBudget);

    onAddItems(
      toAdd.map((s) =>
        toAddInput(
          s,
          'auto',
          `forecast: runs out in ${forecastsByFoodId.get(s.food_id)?.daysToDepletion ?? "?"} days`,
        ),
      ),
      'auto',
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

    setSuggestions((prev) =>
      prev.filter((s) => !toAdd.some((added) => added.food_id === s.food_id))
    );
  }, [
    autoRestockEnabled,
    autoRestockLeadDays,
    forecastsByFoodId,
    loading,
    onListNames,
    onAddItems,
    suggestions,
    toAddInput,
  ]);

  const handleNotQuite = (suggestion: RestockSuggestion) => {
    const blocklist = readBlocklist();
    const nameLower = nameKey(suggestion.food_name);
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
    toast(t("grocery.restock.skipped", "Got it. We'll skip this for a week."));
  };

  // Early returns must come AFTER all hooks above. Previously the `loading`
  // skeleton returned before useMemo/useEffect ran, so the hook count changed
  // when loading flipped and React threw "rendered fewer hooks than expected"
  // (#310), crashing the whole grocery route via the error boundary.
  //
  // Nothing while the first answer is out: a skeleton card pushed the list
  // down and then vanished for the many households with nothing running low.
  if (loading && suggestions.length === 0) return null;
  // Everything suggested is already waiting on the list: nothing to offer.
  if (addable.length === 0 || dismissed) return null;

  const highPriority = addable.filter(s => s.priority === 'high').length;

  return (
    <section
      className="rounded-lg border bg-card text-card-foreground motion-safe:animate-in motion-safe:fade-in"
      aria-label={t("grocery.restock.label", "Running low")}
    >
      <div className="flex min-h-12 items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((v) => !v)}
        >
          <Zap className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate font-medium">
            {t("grocery.restock.summary", {
              defaultValue: "{{count}} running low",
              count: addable.length,
            })}
          </span>
          {highPriority > 0 && (
            <Badge variant="destructive" className="shrink-0 text-xs">
              {t("grocery.restock.urgentCount", { defaultValue: "{{count}} urgent", count: highPriority })}
            </Badge>
          )}
          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
        <Button
          onClick={addAllToList}
          size="sm"
          className="h-11 shrink-0 whitespace-nowrap sm:h-9"
          disabled={loading || addable.length === 0}
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          {t("grocery.restock.addAll", "Add all")}
        </Button>
        <Button
          onClick={() => setDismissed(true)}
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          aria-label={t("grocery.restock.dismiss", "Dismiss restock suggestions")}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {expanded && (
        <ul id={listId} className="max-h-64 space-y-1 overflow-y-auto border-t px-2 py-2">
          {suggestions.map((suggestion) => {
            const forecast = forecastsByFoodId.get(suggestion.food_id);
            const urgency = forecast ? urgencyBucket(forecast.daysToDepletion) : null;
            const onList = isOnList(suggestion);
            const unit = unitFor(suggestion);
            return (
              <li
                key={suggestion.food_id}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{suggestion.food_name}</p>
                    {suggestion.priority === 'high' && (
                      <Badge variant="destructive" className="shrink-0 text-xs">
                        {t("grocery.restock.urgent", "Urgent")}
                      </Badge>
                    )}
                    {suggestion.priority === 'medium' && (
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {t("grocery.restock.soon", "Soon")}
                      </Badge>
                    )}
                    {forecast && urgency && (
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 text-xs", URGENCY_CHIP_STYLES[urgency], CONFIDENCE_OPACITY[forecast.confidence])}
                        title={t("grocery.restock.confidence", {
                          defaultValue: "Confidence: {{level}} ({{cycles}} cycles)",
                          level: forecast.confidence,
                          cycles: forecast.cycleCount,
                        })}
                      >
                        {chipLabel(forecast.daysToDepletion)}
                      </Badge>
                    )}
                  </div>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {t("grocery.restock.needHave", {
                      defaultValue: "Need {{need}} {{unit}} - have {{have}}",
                      need: suggestion.recommended_quantity,
                      have: suggestion.current_quantity,
                      unit,
                    })}
                    {suggestion.reason ? ` - ${suggestion.reason}` : ""}
                  </p>
                  {forecast && !onList && (
                    <button
                      type="button"
                      onClick={() => handleNotQuite(suggestion)}
                      className="mt-0.5 min-h-8 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      aria-label={t("grocery.restock.notQuiteLabel", {
                        defaultValue: "Skip {{name}} for a week",
                        name: suggestion.food_name,
                      })}
                    >
                      {t("grocery.restock.notQuite", "Not quite")}
                    </button>
                  )}
                </div>
                {onList ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t("grocery.restock.onList", "On list")}
                  </span>
                ) : (
                  /*
                    US-778: this had no accessible name at all -- its only child is
                    an icon, and axe rates a nameless control critical.
                  */
                  <Button
                    onClick={() => addSingleItem(suggestion)}
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    aria-label={t("grocery.restock.addOne", {
                      defaultValue: "Add {{name}} to the grocery list",
                      name: suggestion.food_name,
                    })}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
