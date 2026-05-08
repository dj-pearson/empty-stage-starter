/**
 * Tonight Mode client helpers (US-293).
 *
 * Calls the `tonight-mode` Supabase edge function with the user's JWT.
 * Falls back to a pure-client computation when the edge function is slow
 * or fails so the UI never strands the user staring at a spinner at 6pm.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Food, Kid, PlanEntry, Recipe } from '@/types';
import {
  topSuggestions,
  type RecipeContext,
  type RecipeFood,
  type KidContext,
  type PantryFood,
  type RecentPlanEntry,
} from '@/lib/tonightModeRanking';

export interface TonightSuggestion {
  recipeId: string;
  name: string;
  imageUrl: string | null;
  prepMinutes: number;
  pantryCoveragePct: number;
  missingFoodIds: string[];
  missingIngredients: { id: string; name: string }[];
  kidFit: {
    kidId: string;
    kidName: string;
    score: number;
    blockingAversions: string[];
    allergenHits: string[];
  }[];
  varietyScore: number;
  rankScore: number;
  source: 'edge' | 'client-fallback';
}

export interface FetchOptions {
  householdId: string | null;
  kidIds: string[];
  maxMinutes?: number;
  pantryOnly?: boolean;
  lookbackDays?: number;
  limit?: number;
  signal?: AbortSignal;
}

const FUNCTIONS_URL = (import.meta.env.VITE_FUNCTIONS_URL ?? '').replace(/\/$/, '');

function isWithinPanicWindow(now: Date = new Date()): boolean {
  const hour = now.getHours();
  return hour >= 16 && hour < 20;
}

export function shouldShowPanicCta(args: {
  now?: Date;
  todayDinnerPlanned: boolean;
}): boolean {
  return isWithinPanicWindow(args.now) && !args.todayDinnerPlanned;
}

export function todayDinnerPlanned(planEntries: PlanEntry[], today: string): boolean {
  return planEntries.some(
    (p) =>
      p.date === today &&
      String(p.meal_slot ?? '').toLowerCase() === 'dinner',
  );
}

export function todayIso(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function fetchTonightSuggestions(
  opts: FetchOptions,
): Promise<TonightSuggestion[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    logger.warn('tonight-mode: no session token, falling back to client');
    return [];
  }
  if (!FUNCTIONS_URL) {
    logger.warn('tonight-mode: VITE_FUNCTIONS_URL not configured');
    return [];
  }

  const body = {
    householdId: opts.householdId,
    kidIds: opts.kidIds,
    maxMinutes: opts.maxMinutes ?? 30,
    pantryOnly: opts.pantryOnly ?? true,
    lookbackDays: opts.lookbackDays ?? 21,
    limit: opts.limit ?? 3,
  };

  const res = await fetch(`${FUNCTIONS_URL}/tonight-mode`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`tonight-mode ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { suggestions?: TonightSuggestion[] };
  return (json.suggestions ?? []).map((s) => ({ ...s, source: 'edge' as const }));
}

function parsePrepMinutes(recipe: Recipe): number {
  if (typeof recipe.total_time_minutes === 'number' && recipe.total_time_minutes > 0) {
    return recipe.total_time_minutes;
  }
  const text = recipe.prepTime ?? recipe.cookTime ?? '';
  const match = text.match(/(\d+)/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 30;
}

export function clientFallbackSuggestions(args: {
  recipes: Recipe[];
  foods: Food[];
  kids: Kid[];
  planEntries: PlanEntry[];
  selectedKidIds: string[];
  maxMinutes?: number;
  limit?: number;
}): TonightSuggestion[] {
  const foodById = new Map<string, Food>(args.foods.map((f) => [f.id, f]));
  const pantry: PantryFood[] = args.foods.map((f) => ({
    id: f.id,
    name: f.name,
    allergens: (f as Food & { allergens?: string[] }).allergens ?? [],
  }));

  const selectedKids = args.selectedKidIds.length
    ? args.kids.filter((k) => args.selectedKidIds.includes(k.id))
    : args.kids;
  const kidsCtx: KidContext[] = selectedKids.map((k) => ({
    id: k.id,
    name: k.name,
    allergens: (k as Kid & { allergens?: string[] }).allergens ?? [],
    dislikedFoods: (k as Kid & { disliked_foods?: string[] }).disliked_foods ?? [],
  }));

  const recipesCtx: RecipeContext[] = args.recipes.map((r) => {
    const ingredients = r.recipe_ingredients ?? [];
    const idsFromIngredients = ingredients
      .map((i) => i.food_id)
      .filter((x): x is string => typeof x === 'string');
    const foodIds =
      idsFromIngredients.length > 0 ? idsFromIngredients : r.food_ids ?? [];
    const foods: RecipeFood[] = foodIds.map((id) => {
      const f = foodById.get(id);
      return {
        id,
        name: f?.name ?? 'Unknown',
        allergens:
          ((f as Food & { allergens?: string[] } | undefined)?.allergens) ?? [],
      };
    });
    return {
      id: r.id,
      name: r.name,
      imageUrl: r.image_url ?? null,
      prepMinutes: parsePrepMinutes(r),
      foodIds,
      foods,
    };
  });

  const today = new Date();
  const recentEntries: RecentPlanEntry[] = args.planEntries
    .filter((p) => p.recipe_id)
    .map((p) => {
      const d = new Date(p.date + 'T00:00:00Z');
      const ms = today.getTime() - d.getTime();
      const daysAgo = Math.floor(ms / (1000 * 60 * 60 * 24));
      return { recipeId: p.recipe_id ?? null, daysAgo };
    })
    .filter((p) => p.daysAgo >= 0 && p.daysAgo <= 21);

  const ranked = topSuggestions(
    {
      recipes: recipesCtx,
      pantry,
      kids: kidsCtx,
      recentEntries,
    },
    { maxMinutes: args.maxMinutes ?? 30, lookbackDays: 21 },
    args.limit ?? 3,
  );

  return ranked.map((r) => {
    const recipe = recipesCtx.find((c) => c.id === r.recipeId)!;
    return {
      recipeId: r.recipeId,
      name: recipe.name,
      imageUrl: recipe.imageUrl ?? null,
      prepMinutes: r.prepMinutes,
      pantryCoveragePct: r.pantryCoveragePct,
      missingFoodIds: r.missingFoodIds,
      missingIngredients: r.missingFoodIds.map((id) => ({
        id,
        name: foodById.get(id)?.name ?? 'Missing item',
      })),
      kidFit: r.kidFit,
      varietyScore: r.varietyScore,
      rankScore: r.rankScore,
      source: 'client-fallback' as const,
    };
  });
}

export function recipeStepsFromInstructions(instructions: string | undefined): string[] {
  if (!instructions) return [];
  const text = instructions.trim();
  if (!text) return [];
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\d+\.|[-*•])\s*/, '').trim())
    .filter((line) => line.length > 0);
  if (lines.length > 1) return lines;
  return text
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
