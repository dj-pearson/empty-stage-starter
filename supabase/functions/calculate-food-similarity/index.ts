import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sourceFoodId, kidId } = await req.json();
    
    if (!sourceFoodId) {
      throw new Error('Source food ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Calculating food similarity for:', sourceFoodId);

    // Fetch source food with properties
    const { data: sourceFood, error: sourceFoodError } = await supabase
      .from('foods')
      .select('*, food_properties(*)')
      .eq('id', sourceFoodId)
      .single();

    if (sourceFoodError) throw sourceFoodError;

    // Fetch kid profile if provided
    let kidProfile = null;
    if (kidId) {
      const { data: kid } = await supabase
        .from('kids')
        .select('*')
        .eq('id', kidId)
        .single();
      kidProfile = kid;
    }

    // Fetch all foods with properties
    const { data: allFoods, error: foodsError } = await supabase
      .from('foods')
      .select('*, food_properties(*)');

    if (foodsError) throw foodsError;

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
    if (lovableApiKey && kidProfile) {
      try {
        const kidContext = `Child Profile:
- Age: ${kidProfile.age || 'unknown'}
- Allergens: ${kidProfile.allergens?.join(', ') || 'none'}
- Texture preferences: ${kidProfile.texture_preferences?.join(', ') || 'none specified'}
- Flavor preferences: ${kidProfile.flavor_preferences?.join(', ') || 'none specified'}
- Pickiness level: ${kidProfile.pickiness_level || 'moderate'}`;

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { 
                role: 'system', 
                content: `You are a pediatric feeding therapist specializing in food chaining - the gradual introduction of new foods based on similarity to accepted foods.

Your goal is to create progressive food chains that help picky eaters expand their diet safely and comfortably.

Consider:
- Taste similarity (sweet → similar sweet)
- Texture progression (smooth → slightly chunky → chunky)
- Visual familiarity (color, shape, appearance)
- Temperature and preparation methods
- Sensory sensitivities and preferences`
              },
              { 
                role: 'user', 
                content: `${kidContext}

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
}`
              }
            ],
            tools: [{
              type: 'function',
              function: {
                name: 'create_food_chains',
                description: 'Create progressive food introduction chains',
                parameters: {
                  type: 'object',
                  properties: {
                    chains: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          chain_name: { type: 'string' },
                          steps: { type: 'array', items: { type: 'string' } },
                          rationale: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }],
            tool_choice: { type: 'function', function: { name: 'create_food_chains' } }
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall) {
            const result = JSON.parse(toolCall.function.arguments);
            aiEnhancedChains = result.chains || [];
          }
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function calculateSimilarityScore(food1: any, food2: any): number {
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

function generateSimilarityReasons(food1: any, food2: any): string[] {
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
