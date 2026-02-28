/**
 * Suggest Foods Edge Function
 *
 * Returns food suggestions for a child based on preferences, allergens,
 * and food history.
 *
 * POST /suggest-foods
 * Body: { "kid_id": "uuid", "preferences"?: string[], "allergens"?: string[], "limit"?: number }
 * Auth: JWT required
 *
 * Response (200):
 * {
 *   "kid_id": "uuid",
 *   "suggestions": [
 *     { "id": "uuid", "name": "...", "category": "...", "reason": "..." }
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
    const { kid_id, preferences = [], allergens: requestAllergens, limit = 20 } = body;

    if (!kid_id || typeof kid_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'kid_id is required and must be a string' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch kid profile
    const { data: kid, error: kidError } = await supabaseClient
      .from('kids')
      .select('id, name, allergens, favorite_foods, disliked_foods, texture_preferences, flavor_preferences, user_id')
      .eq('id', kid_id)
      .single();

    if (kidError || !kid) {
      return new Response(
        JSON.stringify({ error: 'Kid not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Merge allergens from kid profile and request
    const kidAllergens = kid.allergens ?? [];
    const allAllergens = [
      ...new Set([...kidAllergens, ...(requestAllergens ?? [])]),
    ];

    // Fetch the kid's food history (foods already planned)
    const { data: planEntries } = await supabaseClient
      .from('plan_entries')
      .select('food_id')
      .eq('kid_id', kid_id)
      .limit(500);

    const usedFoodIds = new Set((planEntries ?? []).map((e) => e.food_id));

    // Fetch all safe foods for the user
    const { data: allFoods, error: foodsError } = await supabaseClient
      .from('foods')
      .select('id, name, category, allergens, is_safe')
      .eq('user_id', kid.user_id)
      .eq('is_safe', true)
      .limit(500);

    if (foodsError) {
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Filter and score foods
    const suggestions = (allFoods ?? [])
      .filter((food) => {
        // Remove foods with allergens
        const foodAllergens = food.allergens ?? [];
        const hasAllergen = foodAllergens.some((a: string) =>
          allAllergens.map((al) => al.toLowerCase()).includes(a.toLowerCase()),
        );
        return !hasAllergen;
      })
      .map((food) => {
        let reason = 'Safe food in your database';

        // Prioritize foods not yet used
        const isNew = !usedFoodIds.has(food.id);
        if (isNew) {
          reason = 'Not yet included in meal plans — try something new!';
        }

        // Check if it matches preferences
        const matchesPreferences = preferences.length > 0 &&
          preferences.some((pref: string) =>
            food.name.toLowerCase().includes(pref.toLowerCase()) ||
            food.category.toLowerCase().includes(pref.toLowerCase()),
          );
        if (matchesPreferences) {
          reason = 'Matches your stated preferences';
        }

        // Check if it's a favorite
        const isFavorite = (kid.favorite_foods ?? []).includes(food.id);
        if (isFavorite) {
          reason = 'One of the favorite foods';
        }

        return {
          id: food.id,
          name: food.name,
          category: food.category,
          reason,
          _sortScore: (isNew ? 2 : 0) + (matchesPreferences ? 3 : 0) + (isFavorite ? 1 : 0),
        };
      })
      .sort((a, b) => b._sortScore - a._sortScore)
      .slice(0, limit)
      .map(({ _sortScore, ...rest }) => rest);

    if (suggestions.length === 0) {
      return new Response(
        JSON.stringify({
          kid_id,
          suggestions: [],
          message: 'No matching suggestions found. Try adding more safe foods to your database.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({ kid_id, suggestions }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('suggest-foods error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
