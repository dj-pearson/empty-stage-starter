/**
 * Calculate Food Similarity Edge Function
 *
 * Accepts a food_id and returns similar foods based on category, texture,
 * and flavor profile attributes.
 *
 * POST /calculate-food-similarity
 * Body: { "food_id": "uuid" }
 * Auth: JWT required
 *
 * Response (200):
 * {
 *   "food_id": "uuid",
 *   "similar_foods": [
 *     { "id": "uuid", "name": "...", "category": "...", "similarity_score": 0.85 }
 *   ]
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Weights for similarity dimensions */
const WEIGHTS = {
  category: 0.4,
  allergens: 0.2,
  isSafe: 0.2,
  name: 0.2,
};

/** Calculate similarity between two foods (0-1) */
function calculateSimilarity(
  source: Record<string, unknown>,
  candidate: Record<string, unknown>,
): number {
  let score = 0;

  // Category match
  if (source.category && candidate.category) {
    score += source.category === candidate.category ? WEIGHTS.category : 0;
  }

  // Allergen overlap (Jaccard similarity)
  const sourceAllergens = (source.allergens as string[] | null) ?? [];
  const candidateAllergens = (candidate.allergens as string[] | null) ?? [];
  if (sourceAllergens.length > 0 || candidateAllergens.length > 0) {
    const union = new Set([...sourceAllergens, ...candidateAllergens]);
    const intersection = sourceAllergens.filter((a) => candidateAllergens.includes(a));
    score += (intersection.length / union.size) * WEIGHTS.allergens;
  } else {
    // Both have no allergens — treat as similar
    score += WEIGHTS.allergens;
  }

  // Safety status match
  if (source.is_safe === candidate.is_safe) {
    score += WEIGHTS.isSafe;
  }

  // Name similarity (simple word overlap)
  const sourceWords = String(source.name ?? '')
    .toLowerCase()
    .split(/\s+/);
  const candidateWords = String(candidate.name ?? '')
    .toLowerCase()
    .split(/\s+/);
  const wordUnion = new Set([...sourceWords, ...candidateWords]);
  const wordIntersection = sourceWords.filter((w) => candidateWords.includes(w));
  if (wordUnion.size > 0) {
    score += (wordIntersection.length / wordUnion.size) * WEIGHTS.name;
  }

  return Math.round(score * 100) / 100;
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
    const { food_id } = body;

    if (!food_id || typeof food_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'food_id is required and must be a string' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch the source food
    const { data: sourceFood, error: sourceFoodError } = await supabaseClient
      .from('foods')
      .select('id, name, category, allergens, is_safe, user_id')
      .eq('id', food_id)
      .single();

    if (sourceFoodError || !sourceFood) {
      return new Response(
        JSON.stringify({ error: 'Food not found', details: sourceFoodError?.message }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch all other foods for the same user
    const { data: candidateFoods, error: candidateError } = await supabaseClient
      .from('foods')
      .select('id, name, category, allergens, is_safe')
      .eq('user_id', sourceFood.user_id)
      .neq('id', food_id)
      .limit(200);

    if (candidateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch foods', details: candidateError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Calculate similarity scores and sort
    const similarFoods = (candidateFoods ?? [])
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        category: candidate.category,
        similarity_score: calculateSimilarity(sourceFood, candidate),
      }))
      .filter((f) => f.similarity_score > 0.2)
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, 20);

    return new Response(
      JSON.stringify({
        food_id,
        similar_foods: similarFoods,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error) {
    console.error('calculate-food-similarity error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
