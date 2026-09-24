import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { gateAiRequest } from '../_shared/ai-gate.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { AIServiceV2 } from '../_shared/ai-service-v2.ts';
import { publicMessage } from '../_shared/errors.ts';
import { resolveSimilarityScope, type HouseholdScopedRow } from '../_shared/foodSimilarityScope.ts';

// Rows come back wider than this; the scope check reads id and household_id.
type FoodRow = HouseholdScopedRow & Record<string, unknown>;
interface KidRow extends HouseholdScopedRow {
  name?: string | null;
  age?: number | null;
  allergens?: string[] | null;
  texture_preferences?: string[] | null;
  flavor_preferences?: string[] | null;
  pickiness_level?: string | null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // US-618 put auth here; US-773 added the method check and the per-user
  // budget that had only ever existed in the tree that does not deploy.
  const gate = await gateAiRequest(req, 'calculate-food-similarity', corsHeaders);
  if (gate.response) return gate.response;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!supabaseUrl || !anonKey) {
      throw new Error('calculate-food-similarity: SUPABASE_URL/SUPABASE_ANON_KEY missing');
    }

    // Bound to the caller's JWT, not the service role: the foods and kids
    // RLS policies (household_id = get_user_household_id(auth.uid())) apply
    // to every read below, on top of the explicit household filters.
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    // The household comes from the verified user id. Nothing in the body
    // names it; see _shared/foodSimilarityScope.ts.
    const scope = await resolveSimilarityScope<FoodRow, KidRow>({
      userId: gate.userId,
      body,
      lookupHousehold: async (userId) => {
        const { data, error } = await supabase.rpc('get_user_household_id', { _user_id: userId });
        if (error) throw error;
        return typeof data === 'string' ? data : null;
      },
      loadSourceFood: async (foodId, householdId) => {
        const { data, error } = await supabase
          .from('foods')
          .select('*, food_properties(*)')
          .eq('id', foodId)
          .eq('household_id', householdId)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      loadKid: async (kidId, householdId) => {
        const { data, error } = await supabase
          .from('kids')
          .select('*')
          .eq('id', kidId)
          .eq('household_id', householdId)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      loadHouseholdFoods: async (householdId) => {
        const { data, error } = await supabase
          .from('foods')
          .select('*, food_properties(*)')
          .eq('household_id', householdId);
        if (error) throw error;
        return data ?? [];
      },
    });

    if (scope.kind === 'refused') {
      console.warn('calculate-food-similarity refused:', scope.refusal.reason, 'user:', gate.userId ?? 'none');
      return new Response(JSON.stringify({ error: scope.refusal.error }), {
        status: scope.refusal.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { sourceFood, kid: kidProfile, candidates: allFoods } = scope;
    const sourceFoodId = sourceFood.id;

    // Initialize AI service
    const aiService = new AIServiceV2();

    console.log('Calculating food similarity for:', sourceFoodId);

    // Calculate similarity scores
    const similarities = allFoods
      .filter(f => f.id !== sourceFoodId)
      .map(targetFood => {
        const score = calculateSimilarityScore(sourceFood, targetFood);
        const reasons = generateSimilarityReasons(sourceFood, targetFood);
        
        return {
          food_id: targetFood.id,
          food_name: targetFood.name,
          category: targetFood.category,
          similarity_score: score,
          reasons: reasons,
          is_try_bite: targetFood.is_try_bite,
          allergens: targetFood.allergens || []
        };
      })
      .filter(s => s.similarity_score > 30) // Only keep foods with >30% similarity
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, 10); // Top 10 similar foods

    // Use AI to enhance recommendations if available
    let aiEnhancedChains = [];
    if (kidProfile) {
      try {
        const kidContext = `Child Profile:
- Age: ${kidProfile.age || 'unknown'}
- Allergens: ${kidProfile.allergens?.join(', ') || 'none'}
- Texture preferences: ${kidProfile.texture_preferences?.join(', ') || 'none specified'}
- Flavor preferences: ${kidProfile.flavor_preferences?.join(', ') || 'none specified'}
- Pickiness level: ${kidProfile.pickiness_level || 'moderate'}`;

        const systemPrompt = `You are a pediatric feeding therapist specializing in food chaining - the gradual introduction of new foods based on similarity to accepted foods.

Your goal is to create progressive food chains that help picky eaters expand their diet safely and comfortably.

Consider:
- Taste similarity (sweet → similar sweet)
- Texture progression (smooth → slightly chunky → chunky)
- Visual familiarity (color, shape, appearance)
- Temperature and preparation methods
- Sensory sensitivities and preferences`;

        const userPrompt = `${kidContext}

Source food: ${sourceFood.name} (${sourceFood.category})

Create 3-5 progressive food chains starting from "${sourceFood.name}" that would help this child gradually try new foods. Each chain should have 3-4 steps, getting progressively different but still connected.

Format as JSON with this structure:
{
  "chains": [
    {
      "chain_name": "Sweet Fruit Progression",
      "steps": ["apple slices", "pear slices", "peach slices", "mango slices"],
      "rationale": "Similar sweetness and crunch, gradually introducing new flavors"
    }
  ]
}`;

        const aiContent = await aiService.generateContent(userPrompt, {
          systemPrompt,
          taskType: 'standard', // Food chain analysis is complex
        });

        // Parse JSON response
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          aiEnhancedChains = result.chains || [];
        }
      } catch (aiError) {
        console.error('AI chain generation failed:', aiError);
      }
    }

    return new Response(JSON.stringify({ 
      source_food: {
        id: sourceFood.id,
        name: sourceFood.name,
        category: sourceFood.category
      },
      similar_foods: similarities,
      food_chains: aiEnhancedChains,
      kid_profile: kidProfile ? {
        name: kidProfile.name,
        age: kidProfile.age,
        allergens: kidProfile.allergens
      } : null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error calculating food similarity:', error);
    return new Response(
      JSON.stringify({ error: publicMessage(error) }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

function calculateSimilarityScore(food1: Record<string, unknown>, food2: Record<string, unknown>): number {
  let score = 0;
  const props1 = food1.food_properties?.[0];
  const props2 = food2.food_properties?.[0];

  // Category similarity (30% weight)
  if (food1.category === food2.category) {
    score += 30;
  }

  if (props1 && props2) {
    // Texture similarity (25% weight)
    if (props1.texture_primary === props2.texture_primary) {
      score += 25;
    } else if (props1.texture_secondary === props2.texture_primary || 
               props1.texture_primary === props2.texture_secondary) {
      score += 12;
    }

    // Flavor profile overlap (20% weight)
    if (props1.flavor_profile && props2.flavor_profile) {
      const overlap = props1.flavor_profile.filter((f: string) => 
        props2.flavor_profile.includes(f)
      ).length;
      score += Math.min(overlap * 7, 20);
    }

    // Color similarity (15% weight)
    if (props1.color_primary === props2.color_primary) {
      score += 15;
    } else if (props1.color_secondary === props2.color_primary ||
               props1.color_primary === props2.color_secondary) {
      score += 7;
    }

    // Temperature similarity (10% weight)
    if (props1.typical_temperature === props2.typical_temperature) {
      score += 10;
    }
  }

  return Math.min(score, 100);
}

function generateSimilarityReasons(food1: Record<string, unknown>, food2: Record<string, unknown>): string[] {
  const reasons = [];
  const props1 = food1.food_properties?.[0];
  const props2 = food2.food_properties?.[0];

  if (food1.category === food2.category) {
    reasons.push(`Both are ${food1.category}s`);
  }

  if (props1 && props2) {
    if (props1.texture_primary === props2.texture_primary) {
      reasons.push(`Similar ${props1.texture_primary} texture`);
    }

    if (props1.flavor_profile && props2.flavor_profile) {
      const overlap = props1.flavor_profile.filter((f: string) => 
        props2.flavor_profile.includes(f)
      );
      if (overlap.length > 0) {
        reasons.push(`Shared ${overlap.join(' and ')} taste`);
      }
    }

    if (props1.color_primary === props2.color_primary) {
      reasons.push(`Similar ${props1.color_primary} color`);
    }

    if (props1.typical_temperature === props2.typical_temperature) {
      reasons.push(`Both served ${props1.typical_temperature}`);
    }
  }

  return reasons.length > 0 ? reasons : ['General similarity'];
}
