import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, noCacheHeaders } from '../common/headers.ts';

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
 * Authorization: requires a user JWT. We resolve the caller, then scope all
 * reads to rows the caller owns (user_id) or shares (household_id). We never
 * trust the body's householdId without checking membership first.
 */

interface RequestBody {
  householdId: string | null;
  kidIds: string[];
  maxMinutes: number;
  pantryOnly: boolean;
  lookbackDays: number;
  limit: number;
}

interface KidFit {
  kidId: string;
  kidName: string;
  score: number;
  blockingAversions: string[];
  allergenHits: string[];
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

interface FoodRow {
  id: string;
  name: string;
  allergens: string[] | null;
}

interface RecipeRow {
  id: string;
  name: string;
  image_url: string | null;
  food_ids: string[] | null;
  total_time_minutes: number | null;
  prep_time: string | null;
}

interface KidRow {
  id: string;
  name: string;
  allergens: string[] | null;
  disliked_foods: string[] | null;
}

interface PlanEntryRow {
  recipe_id: string | null;
  date: string;
}

function lower(arr: string[] | null | undefined): Set<string> {
  return new Set((arr ?? []).map((s) => s.toLowerCase()));
}

/** Leading numeric run out of "20 min" / "PT15M" -> 20 / 15. */
function parseLeadingNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * Recency weight for variety scoring: a recipe planned in the last week
 * counts double; 8-14 days ago counts once; 15-21 days ago counts half.
 * Mirrors TonightModeService.clientFallback so server + client agree.
 */
function recencyWeight(daysAgo: number): number {
  if (daysAgo < 0) return 0;
  if (daysAgo <= 7) return 2;
  if (daysAgo <= 14) return 1;
  return 0.5;
}

/** Recency-weighted "how recently/often planned" score, normalized 0-1. */
function varietyScore(
  recipeId: string,
  planEntries: PlanEntryRow[],
  lookbackDays: number,
  now: number,
): number {
  let weighted = 0;
  for (const entry of planEntries) {
    if (entry.recipe_id !== recipeId) continue;
    const t = Date.parse(entry.date);
    if (Number.isNaN(t)) continue;
    const days = Math.floor((now - t) / 86400000);
    if (days < 0 || days > lookbackDays) continue;
    weighted += recencyWeight(days);
  }
  return Math.min(1, Math.max(0, (weighted / Math.max(1, lookbackDays)) * 3));
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
    const requestedHouseholdId = typeof body.householdId === 'string' ? body.householdId : null;
    const kidIds = Array.isArray(body.kidIds) ? body.kidIds.filter((k) => typeof k === 'string') : [];
    const maxMinutes = Number.isFinite(body.maxMinutes) ? Number(body.maxMinutes) : 30;
    const lookbackDays = Number.isFinite(body.lookbackDays) ? Number(body.lookbackDays) : 21;
    const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(10, Number(body.limit))) : 3;

    // Service-role client for the reads. We still scope every query to the
    // caller's own rows (or a household they belong to) so the service role
    // can't be used to read another household.
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Verify household membership before trusting requestedHouseholdId.
    let householdId: string | null = null;
    if (requestedHouseholdId) {
      const { data: membership } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('household_id', requestedHouseholdId)
        .eq('user_id', userId)
        .maybeSingle();
      if (membership) {
        householdId = requestedHouseholdId;
      }
    }

    // Scope helper: restrict a query to rows owned by the user OR shared in
    // their household. `PostgrestFilterBuilder` is generic; we only need the
    // `.or`/`.eq` surface, captured by this structural type so we avoid `any`.
    interface ScopableQuery<Self> {
      or(filters: string): Self;
      eq(column: string, value: string): Self;
    }
    const scoped = <Self extends ScopableQuery<Self>>(q: Self): Self =>
      householdId
        ? q.or(`user_id.eq.${userId},household_id.eq.${householdId}`)
        : q.eq('user_id', userId);

    const lookbackCutoff = new Date(Date.now() - lookbackDays * 86400000)
      .toISOString()
      .split('T')[0];

    const [foodsRes, recipesRes, kidsRes, planRes] = await Promise.all([
      scoped(supabase.from('foods').select('id,name,allergens')),
      scoped(
        supabase
          .from('recipes')
          .select('id,name,image_url,food_ids,total_time_minutes,prep_time'),
      ),
      // Kids: only the ones the caller asked for, and only those they own.
      kidIds.length > 0
        ? scoped(supabase.from('kids').select('id,name,allergens,disliked_foods'))
          .in('id', kidIds)
        : Promise.resolve({ data: [] as KidRow[], error: null }),
      // Plan entries within the lookback window for variety scoring.
      scoped(supabase.from('plan_entries').select('recipe_id,date'))
        .gte('date', lookbackCutoff),
    ]);

    const foods = (foodsRes.data ?? []) as FoodRow[];
    const recipes = (recipesRes.data ?? []) as RecipeRow[];
    const kids = (kidsRes.data ?? []) as KidRow[];
    const planEntries = (planRes.data ?? []) as PlanEntryRow[];

    const foodById = new Map(foods.map((f) => [f.id, f]));
    const pantryIds = new Set(foods.map((f) => f.id));

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

      const kidFits: KidFit[] = kids.map((kid) => {
        const kidAllergens = lower(kid.allergens);
        const dislikedIds = new Set(kid.disliked_foods ?? []);
        const dislikedNames = lower(kid.disliked_foods);

        const allergenHits: string[] = [];
        const blockingAversions: string[] = [];
        for (const fid of foodIds) {
          const food = foodById.get(fid);
          if (!food) continue;
          const foodAllergens = lower(food.allergens);
          const intersects = [...foodAllergens].some((a) => kidAllergens.has(a));
          if (intersects) {
            allergenHits.push(food.name);
            continue;
          }
          if (dislikedIds.has(fid) || dislikedNames.has(food.name.toLowerCase())) {
            blockingAversions.push(food.name);
          }
        }

        let score = 1 - 0.25 * blockingAversions.length;
        if (allergenHits.length > 0) score = 0;
        score = Math.min(1, Math.max(0, score));
        return {
          kidId: kid.id,
          kidName: kid.name,
          score,
          blockingAversions,
          allergenHits,
        };
      });

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
      JSON.stringify({ error: message }),
      { status: 500, headers: noCacheHeaders() },
    );
  }
};
