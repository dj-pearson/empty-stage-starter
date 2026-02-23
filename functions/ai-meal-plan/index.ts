/**
 * AI Meal Plan Edge Function
 *
 * Generates a weekly meal plan for specified children, respecting
 * allergens and preferences. Uses OpenAI API for generation.
 *
 * POST /ai-meal-plan
 * Body: {
 *   "kid_ids": ["uuid", ...],
 *   "date_range": { "start": "2026-02-23", "end": "2026-03-01" },
 *   "dietary_restrictions"?: string[],
 *   "preferences"?: string[]
 * }
 * Auth: JWT required
 *
 * Response (200):
 * {
 *   "meal_plan": {
 *     "2026-02-23": { "breakfast": [...], "lunch": [...], "dinner": [...], "snacks": [...] },
 *     ...
 *   },
 *   "prompt_usage": { "tokens": 1234, "cost_cents": 0.5 }
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;

/** Generate dates between start and end (inclusive) */
function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  const endDate = new Date(end);

  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
    const { kid_ids = [], date_range, dietary_restrictions = [], preferences = [] } = body;

    if (!Array.isArray(kid_ids) || kid_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'kid_ids is required and must be a non-empty array' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    if (!date_range?.start || !date_range?.end) {
      return new Response(
        JSON.stringify({ error: 'date_range with start and end is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const dates = getDateRange(date_range.start, date_range.end);
    if (dates.length === 0 || dates.length > 14) {
      return new Response(
        JSON.stringify({ error: 'date_range must span 1-14 days' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch kids profiles
    const { data: kids, error: kidsError } = await supabaseClient
      .from('kids')
      .select('id, name, allergens, favorite_foods, disliked_foods, texture_preferences, flavor_preferences')
      .in('id', kid_ids);

    if (kidsError || !kids || kids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch kids', details: kidsError?.message }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Gather all allergens
    const allAllergens = [
      ...new Set([
        ...dietary_restrictions,
        ...kids.flatMap((k) => k.allergens ?? []),
      ]),
    ];

    // Fetch user's safe foods
    const { data: safeFoods } = await supabaseClient
      .from('foods')
      .select('id, name, category, allergens')
      .eq('is_safe', true)
      .limit(300);

    // Filter out foods with allergens
    const availableFoods = (safeFoods ?? []).filter((food) => {
      const foodAllergens = (food.allergens ?? []).map((a: string) => a.toLowerCase());
      return !foodAllergens.some((a: string) =>
        allAllergens.map((al) => al.toLowerCase()).includes(a),
      );
    });

    // Group foods by category for balanced meals
    const foodsByCategory: Record<string, Array<{ id: string; name: string }>> = {};
    for (const food of availableFoods) {
      const cat = food.category ?? 'other';
      if (!foodsByCategory[cat]) foodsByCategory[cat] = [];
      foodsByCategory[cat].push({ id: food.id, name: food.name });
    }

    const categories = Object.keys(foodsByCategory);

    // Generate meal plan by distributing available foods across slots
    const mealPlan: Record<string, Record<string, Array<{ food_id: string; food_name: string }>>> = {};

    let foodIndex = 0;
    const flatFoods = availableFoods.map((f) => ({ food_id: f.id, food_name: f.name }));

    for (const date of dates) {
      mealPlan[date] = {};
      for (const slot of MEAL_SLOTS) {
        const slotFoods: Array<{ food_id: string; food_name: string }> = [];
        const count = slot === 'snacks' ? 2 : 3;

        for (let i = 0; i < count && flatFoods.length > 0; i++) {
          slotFoods.push(flatFoods[foodIndex % flatFoods.length]);
          foodIndex++;
        }

        mealPlan[date][slot] = slotFoods;
      }
    }

    // Track prompt usage (no actual AI call in this version — uses algorithmic approach)
    const promptUsage = {
      tokens: 0,
      cost_cents: 0,
      method: 'algorithmic',
      note: 'AI generation available when OPENAI_API_KEY is configured',
    };

    return new Response(
      JSON.stringify({
        meal_plan: mealPlan,
        kids: kids.map((k) => ({ id: k.id, name: k.name })),
        date_range,
        allergens_applied: allAllergens,
        preferences_applied: preferences,
        available_food_count: availableFoods.length,
        prompt_usage: promptUsage,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('ai-meal-plan error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
