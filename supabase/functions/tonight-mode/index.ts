import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, noCacheHeaders } from '../common/headers.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';
import { publicMessage } from '../_shared/errors.ts';
import {
  kidFitFor,
  parseLeadingNumber,
  isOnHand,
  tonightScope,
  tonightScopeFilter,
  varietyScore,
  type FoodRow,
  type KidFit,
  type KidRow,
  type PlanEntryRow,
} from '../_shared/tonight-mode.ts';

/**
 * US-312: tonight-mode
 *
 * Server-quality "what's for dinner tonight" picks for the iOS Tonight Mode
 * panic flow. The native `TonightModeService` (TonightModeService.swift)
 * calls this with a ~1.5s soft timeout; on any failure it falls back to a
 * pure-Swift ranker against in-memory `AppState`. This endpoint mirrors that
 * fallback's scoring so the server result and the client fallback agree,
 * but runs against the canonical DB rows.
 *
 * Contract (must match TonightModeService.swift exactly):
 *   Request:  {
 *     householdId: string | null,
 *     kidIds: string[],
 *     maxMinutes: number,
 *     pantryOnly: boolean,
 *     lookbackDays: number,
 *     limit: number
 *   }
 *   Response: { suggestions: Suggestion[] }
 *   Suggestion = {
 *     recipeId, name, imageUrl|null, prepMinutes, pantryCoveragePct,
 *     missingFoodIds[], missingIngredients[{id,name}],
 *     kidFit[{kidId,kidName,score,blockingAversions,allergenHits}],
 *     varietyScore, rankScore
 *   }
 *
 * Authorization: requires a user JWT. We resolve the caller, then scope every
 * read to the caller's household, resolved server-side with
 * get_user_household_id (the function every RLS policy uses). The body's
 * householdId is accepted for contract compatibility and ignored: a co-parent
 * sees the kids, foods and recipes the partner added, and nobody can name a
 * household that is not theirs. See ../_shared/tonight-mode.ts.
 */

interface RequestBody {
  householdId: string | null;
  kidIds: string[];
  maxMinutes: number;
  pantryOnly: boolean;
  lookbackDays: number;
  limit: number;
}

interface MissingIngredient {
  id: string;
  name: string;
}

interface Suggestion {
  recipeId: string;
  name: string;
  imageUrl: string | null;
  prepMinutes: number;
  pantryCoveragePct: number;
  missingFoodIds: string[];
  missingIngredients: MissingIngredient[];
  kidFit: KidFit[];
  varietyScore: number;
  rankScore: number;
}

interface RecipeRow {
  id: string;
  name: string;
  image_url: string | null;
  food_ids: string[] | null;
  total_time_minutes: number | null;
  prep_time: string | null;
}

export default async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: noCacheHeaders(),
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    // Resolve the caller from their JWT.
    const authClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: noCacheHeaders(),
      });
    }
    const userId = userData.user.id;

    const body = (await req.json()) as Partial<RequestBody>;
    // body.householdId is part of the iOS contract but is deliberately not
    // read: the household comes from the JWT user below.
    const kidIds = Array.isArray(body.kidIds) ? body.kidIds.filter((k) => typeof k === 'string') : [];
    const maxMinutes = Number.isFinite(body.maxMinutes) ? Number(body.maxMinutes) : 30;
    const lookbackDays = Number.isFinite(body.lookbackDays) ? Number(body.lookbackDays) : 21;
    const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(10, Number(body.limit))) : 3;

    // Service-role client for the reads. Every query below is scoped to the
    // caller's household so the service role can't be used to read another.
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // US-325: per-user rate limit before any DB work. `tonight-mode` is seeded
    // in rate_limit_config (20/min, 200/hr, 2000/day) but nothing enforced it:
    // the enforcement was written into the serve() tree, which never deploys.
    // Uses the service-role client because check_rate_limit_with_tier is
    // SECURITY DEFINER and takes the user id explicitly.
    const limited = await enforceRateLimit(supabase, userId, 'tonight-mode', noCacheHeaders());
    if (limited) return limited;

    // The caller's household, from the JWT user and never from the body.
    const { data: householdData, error: householdError } = await supabase.rpc(
      'get_user_household_id',
      { _user_id: userId },
    );
    if (householdError) throw householdError;
    const householdId = typeof householdData === 'string' ? householdData : null;
    const scopeFilter = tonightScopeFilter(tonightScope(userId, householdId));

    const lookbackCutoff = new Date(Date.now() - lookbackDays * 86400000)
      .toISOString()
      .split('T')[0];

    const [foodsRes, recipesRes, kidsRes, planRes] = await Promise.all([
      supabase.from('foods').select('id,name,allergens,quantity,expiry_date').or(scopeFilter),
      supabase
        .from('recipes')
        .select('id,name,image_url,food_ids,total_time_minutes,prep_time')
        .or(scopeFilter),
      // Kids: only the ones the caller asked for, and only in their household.
      kidIds.length > 0
        ? supabase
          .from('kids')
          .select('id,name,allergens,disliked_foods')
          .or(scopeFilter)
          .in('id', kidIds)
        : Promise.resolve({ data: [] as KidRow[], error: null }),
      // Plan entries within the lookback window for variety scoring.
      supabase
        .from('plan_entries')
        .select('recipe_id,date')
        .or(scopeFilter)
        .gte('date', lookbackCutoff),
    ]);

    // A failed read is an error, not an empty list: with foods or kids missing
    // no allergen can hit, and the top pick could be one a child reacts to.
    // iOS falls back to its on-device ranker on any non-2xx.
    for (const res of [foodsRes, recipesRes, kidsRes, planRes]) {
      if (res.error) throw res.error;
    }

    const foods = (foodsRes.data ?? []) as FoodRow[];
    const recipes = (recipesRes.data ?? []) as RecipeRow[];
    const kids = (kidsRes.data ?? []) as KidRow[];
    const planEntries = (planRes.data ?? []) as PlanEntryRow[];

    const foodById = new Map(foods.map((f) => [f.id, f]));
    const today = new Date().toISOString().split('T')[0];
    const pantryIds = new Set(foods.filter((f) => isOnHand(f, today)).map((f) => f.id));

    // Variety: recency-weighted count of how often a recipe was planned.
    const now = Date.now();

    interface Scored {
      suggestion: Suggestion;
      rank: number;
      excluded: boolean;
      kidScoreSum: number;
    }

    const scoredRecipes: Scored[] = recipes.map((recipe) => {
      const foodIds = recipe.food_ids ?? [];
      const total = Math.max(1, foodIds.length);
      const missing = foodIds.filter((id) => !pantryIds.has(id));
      const coverage = (foodIds.length - missing.length) / total;

      const kidFits: KidFit[] = kids.map((kid) => kidFitFor(kid, foodIds, foodById));

      const anyAllergen = kidFits.some((k) => k.allergenHits.length > 0);
      const totalAversions = kidFits.reduce((s, k) => s + k.blockingAversions.length, 0);
      const variety = varietyScore(recipe.id, planEntries, lookbackDays, now);
      const prep = recipe.total_time_minutes ?? parseLeadingNumber(recipe.prep_time) ?? 30;
      const prepOver = Math.max(0, prep - maxMinutes);

      let rank = coverage * 40 - totalAversions * 15 - variety * 25 - prepOver * 0.5;
      if (anyAllergen) rank = -Infinity;

      const suggestion: Suggestion = {
        recipeId: recipe.id,
        name: recipe.name,
        imageUrl: recipe.image_url,
        prepMinutes: Math.round(prep),
        pantryCoveragePct: coverage,
        missingFoodIds: missing,
        missingIngredients: missing.map((id) => ({
          id,
          name: foodById.get(id)?.name ?? 'Missing item',
        })),
        kidFit: kidFits,
        varietyScore: variety,
        rankScore: rank,
      };

      return {
        suggestion,
        rank,
        excluded: anyAllergen,
        kidScoreSum: kidFits.reduce((s, k) => s + k.score, 0),
      };
    });

    const suggestions = scoredRecipes
      .filter((s) => !s.excluded)
      .sort((a, b) => {
        if (a.rank !== b.rank) return b.rank - a.rank;
        return b.kidScoreSum - a.kidScoreSum;
      })
      .slice(0, limit)
      .map((s) => s.suggestion);

    return new Response(JSON.stringify({ suggestions }), { headers: noCacheHeaders() });
  } catch (err) {
    console.error('tonight-mode error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: publicMessage(err) }),
      { status: 500, headers: noCacheHeaders() },
    );
  }
};
