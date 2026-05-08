/**
 * Tonight Mode Edge Function (US-293).
 *
 * Returns the top 3 cookable dinner suggestions for a household given the
 * current pantry, the kids' aversions/allergens, recent plan history (for
 * variety scoring), and a max prep-time budget.
 *
 * POST /tonight-mode
 * Body: {
 *   "householdId": string | null,   // optional; if omitted we scope by user
 *   "kidIds": string[] | null,       // optional; default = all household kids
 *   "maxMinutes": number,            // default 30
 *   "pantryOnly": boolean,           // default true (only score recipes whose ingredients are mostly in pantry)
 *   "lookbackDays": number           // default 21
 * }
 *
 * Response (200):
 * {
 *   "suggestions": [
 *     {
 *       "recipeId": "...",
 *       "name": "...",
 *       "imageUrl": "...",
 *       "prepMinutes": 22,
 *       "pantryCoveragePct": 0.86,
 *       "missingFoodIds": [...],
 *       "missingIngredients": [{ "id": "...", "name": "..." }],
 *       "kidFit": [{ "kidId":"...", "kidName":"...", "score":0.75, "blockingAversions":["onion"], "allergenHits":[] }],
 *       "varietyScore": 0.12,
 *       "rankScore": 31.4
 *     }
 *   ],
 *   "diagnostics": {
 *     "scannedRecipes": 47,
 *     "pantryItems": 23,
 *     "kidsConsidered": 3,
 *     "recentPlanEntries": 14
 *   }
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import {
  topSuggestions,
  type RecipeContext,
  type RecipeFood,
  type KidContext,
  type PantryFood,
  type RecentPlanEntry,
} from '../../src/lib/tonightModeRanking.ts';

interface RequestBody {
  householdId?: string | null;
  kidIds?: string[] | null;
  maxMinutes?: number;
  pantryOnly?: boolean;
  lookbackDays?: number;
  limit?: number;
}

const DEFAULT_MAX_MINUTES = 30;
const DEFAULT_LOOKBACK_DAYS = 21;
const DEFAULT_LIMIT = 3;
const HARD_RECIPE_CAP = 200;

function parsePrepMinutes(
  totalMinutes: number | null | undefined,
  prepText: string | null | undefined,
): number {
  if (typeof totalMinutes === 'number' && totalMinutes > 0) return totalMinutes;
  if (typeof prepText === 'string') {
    const match = prepText.match(/(\d+)/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > 0) return n;
    }
  }
  return 30;
}

function daysBetween(isoDate: string, today: Date): number {
  const d = new Date(isoDate + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  const ms = today.getTime() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;
  const user = auth.user;

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const body: RequestBody = await req.json().catch(() => ({}));
    const maxMinutes =
      typeof body.maxMinutes === 'number' && body.maxMinutes > 0
        ? body.maxMinutes
        : DEFAULT_MAX_MINUTES;
    const pantryOnly = body.pantryOnly ?? true;
    const lookbackDays =
      typeof body.lookbackDays === 'number' && body.lookbackDays > 0
        ? body.lookbackDays
        : DEFAULT_LOOKBACK_DAYS;
    const limit =
      typeof body.limit === 'number' && body.limit > 0 && body.limit <= 10
        ? body.limit
        : DEFAULT_LIMIT;

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    // Kids — filter by household and optional kidIds
    let kidsQuery = supabase
      .from('kids')
      .select('id, name, allergens, disliked_foods, household_id, user_id');
    if (body.householdId) {
      kidsQuery = kidsQuery.eq('household_id', body.householdId);
    } else {
      kidsQuery = kidsQuery.eq('user_id', user.id);
    }
    if (body.kidIds && body.kidIds.length > 0) {
      kidsQuery = kidsQuery.in('id', body.kidIds);
    }
    const { data: kidsRows, error: kidsErr } = await kidsQuery;
    if (kidsErr) throw kidsErr;
    const kids: KidContext[] = (kidsRows ?? []).map((k: any) => ({
      id: k.id,
      name: k.name,
      allergens: k.allergens ?? [],
      dislikedFoods: k.disliked_foods ?? [],
    }));

    // Foods — pantry
    const { data: foodsRows, error: foodsErr } = await supabase
      .from('foods')
      .select('id, name, allergens, category, household_id, user_id');
    if (foodsErr) throw foodsErr;
    const allFoods: { id: string; name: string; allergens?: string[] | null }[] =
      (foodsRows ?? []).map((f: any) => ({
        id: f.id,
        name: f.name,
        allergens: f.allergens ?? [],
      }));
    const pantry: PantryFood[] = allFoods;
    const foodById = new Map(allFoods.map((f) => [f.id, f]));

    // Recipes — capped to keep p95 under 800ms
    const { data: recipesRows, error: recipesErr } = await supabase
      .from('recipes')
      .select(
        'id, name, image_url, total_time_minutes, prep_time, food_ids, default_servings, household_id, user_id',
      )
      .limit(HARD_RECIPE_CAP);
    if (recipesErr) throw recipesErr;

    const recipeIds = (recipesRows ?? []).map((r: any) => r.id);

    // Recipe ingredients (newer schema; legacy recipes may have only food_ids)
    let ingredientsRows: any[] = [];
    if (recipeIds.length > 0) {
      const { data, error } = await supabase
        .from('recipe_ingredients')
        .select('recipe_id, food_id, name')
        .in('recipe_id', recipeIds);
      if (error) throw error;
      ingredientsRows = data ?? [];
    }
    const ingredientsByRecipe = new Map<string, { foodId: string | null; name: string }[]>();
    for (const row of ingredientsRows) {
      const list = ingredientsByRecipe.get(row.recipe_id) ?? [];
      list.push({ foodId: row.food_id, name: row.name });
      ingredientsByRecipe.set(row.recipe_id, list);
    }

    // Plan entries — last lookbackDays
    const today = new Date();
    const lookbackStart = new Date(today);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - lookbackDays);
    const isoStart = lookbackStart.toISOString().slice(0, 10);
    const { data: planRows, error: planErr } = await supabase
      .from('plan_entries')
      .select('recipe_id, date')
      .gte('date', isoStart);
    if (planErr) throw planErr;
    const recentEntries: RecentPlanEntry[] = (planRows ?? [])
      .filter((p: any) => p.recipe_id)
      .map((p: any) => ({
        recipeId: p.recipe_id,
        daysAgo: daysBetween(p.date, today),
      }));

    // Build recipe contexts
    const recipes: RecipeContext[] = (recipesRows ?? []).map((r: any) => {
      const ingredients = ingredientsByRecipe.get(r.id) ?? [];
      const idsFromIngredients = ingredients
        .map((i) => i.foodId)
        .filter((x): x is string => typeof x === 'string');
      const foodIds: string[] =
        idsFromIngredients.length > 0
          ? idsFromIngredients
          : Array.isArray(r.food_ids)
            ? r.food_ids
            : [];
      const foods: RecipeFood[] = foodIds.map((id) => {
        const f = foodById.get(id);
        return {
          id,
          name: f?.name ?? 'Unknown',
          allergens: f?.allergens ?? [],
        };
      });
      return {
        id: r.id,
        name: r.name,
        imageUrl: r.image_url ?? null,
        prepMinutes: parsePrepMinutes(r.total_time_minutes, r.prep_time),
        foodIds,
        foods,
      };
    });

    const candidates = pantryOnly
      ? recipes.filter((r) => r.foodIds.length > 0)
      : recipes;

    const ranked = topSuggestions(
      {
        recipes: candidates,
        pantry,
        kids,
        recentEntries,
      },
      { maxMinutes, lookbackDays },
      limit,
    );

    const suggestions = ranked.map((s) => {
      const recipe = candidates.find((r) => r.id === s.recipeId)!;
      return {
        recipeId: s.recipeId,
        name: recipe.name,
        imageUrl: recipe.imageUrl,
        prepMinutes: s.prepMinutes,
        pantryCoveragePct: s.pantryCoveragePct,
        missingFoodIds: s.missingFoodIds,
        missingIngredients: s.missingFoodIds.map((id) => ({
          id,
          name: foodById.get(id)?.name ?? 'Missing item',
        })),
        kidFit: s.kidFit,
        varietyScore: s.varietyScore,
        rankScore: s.rankScore,
      };
    });

    return new Response(
      JSON.stringify({
        suggestions,
        diagnostics: {
          scannedRecipes: candidates.length,
          pantryItems: pantry.length,
          kidsConsidered: kids.length,
          recentPlanEntries: recentEntries.length,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error) {
    console.error('tonight-mode error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
