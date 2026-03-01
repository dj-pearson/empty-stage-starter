/**
 * Suggest Recipe Edge Function
 *
 * Returns recipe suggestions based on available foods, kid preferences,
 * and dietary restrictions.
 *
 * POST /suggest-recipe
 * Body: {
 *   "available_foods": ["uuid", ...],
 *   "kid_ids": ["uuid", ...],
 *   "dietary_restrictions"?: string[]
 * }
 * Auth: JWT required
 *
 * Response (200):
 * {
 *   "suggestions": [
 *     { "id": "uuid", "name": "...", "match_percentage": 85, "missing_foods": [...] }
 *   ]
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = await req.json();
    const { available_foods = [], kid_ids = [], dietary_restrictions = [] } = body;

    if (!Array.isArray(available_foods)) {
      return new Response(
        JSON.stringify({ error: 'available_foods must be an array of food IDs' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch allergens for all specified kids
    const kidAllergens: string[] = [];
    if (kid_ids.length > 0) {
      const { data: kids, error: kidsError } = await supabaseClient
        .from('kids')
        .select('id, allergens')
        .in('id', kid_ids);

      if (kidsError) {
        return new Response(
          JSON.stringify({ error: 'Internal server error' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }

      for (const kid of kids ?? []) {
        if (kid.allergens) {
          kidAllergens.push(...kid.allergens);
        }
      }
    }

    const allRestrictions = [...new Set([...kidAllergens, ...dietary_restrictions])].map((r) =>
      r.toLowerCase(),
    );

    // Fetch all user recipes
    const { data: recipes, error: recipesError } = await supabaseClient
      .from('recipes')
      .select('id, name, food_ids, category, tags, nutrition_info')
      .limit(200);

    if (recipesError) {
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // If we have allergen restrictions, fetch food details to check allergens
    let foodAllergenMap: Record<string, string[]> = {};
    if (allRestrictions.length > 0 && recipes && recipes.length > 0) {
      const allFoodIds = [...new Set(recipes.flatMap((r) => r.food_ids))];
      if (allFoodIds.length > 0) {
        const { data: foods } = await supabaseClient
          .from('foods')
          .select('id, allergens')
          .in('id', allFoodIds);

        if (foods) {
          foodAllergenMap = Object.fromEntries(
            foods.map((f) => [f.id, (f.allergens ?? []).map((a: string) => a.toLowerCase())]),
          );
        }
      }
    }

    const availableSet = new Set(available_foods);

    // Score and rank recipes
    const suggestions = (recipes ?? [])
      .map((recipe) => {
        const recipeFoodIds = recipe.food_ids ?? [];

        // Check for allergens in recipe foods
        if (allRestrictions.length > 0) {
          const hasAllergen = recipeFoodIds.some((fid: string) => {
            const allergens = foodAllergenMap[fid] ?? [];
            return allergens.some((a) => allRestrictions.includes(a));
          });
          if (hasAllergen) return null;
        }

        // Calculate match percentage
        const totalFoods = recipeFoodIds.length;
        if (totalFoods === 0) return null;

        const matchedFoods = recipeFoodIds.filter((fid: string) => availableSet.has(fid));
        const missingFoods = recipeFoodIds.filter((fid: string) => !availableSet.has(fid));
        const matchPercentage = Math.round((matchedFoods.length / totalFoods) * 100);

        return {
          id: recipe.id,
          name: recipe.name,
          category: recipe.category,
          match_percentage: matchPercentage,
          matched_food_count: matchedFoods.length,
          total_food_count: totalFoods,
          missing_food_ids: missingFoods,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => b.match_percentage - a.match_percentage)
      .slice(0, 20);

    return new Response(
      JSON.stringify({ suggestions }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('suggest-recipe error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
