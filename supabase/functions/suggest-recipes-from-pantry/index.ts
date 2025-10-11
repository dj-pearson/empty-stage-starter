import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecipeSuggestion {
  name: string;
  description: string;
  food_ids: string[];
  food_names: string[];
  reason: string;
  difficulty: string;
  prepTime: string;
  cookTime: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pantryFoods, childProfile, count = 5 } = await req.json();

    if (!pantryFoods || pantryFoods.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No pantry foods provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get AI settings from database
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get active AI model
    const { data: aiSettings, error: aiError } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('is_active', true)
      .single();

    if (aiError || !aiSettings) {
      return new Response(
        JSON.stringify({ error: 'No active AI model configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get(aiSettings.api_key_env_var);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `API key ${aiSettings.api_key_env_var} not configured` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build profile context
    const profileContext = childProfile ? `
Child Profile:
- Age: ${childProfile.age || 'not specified'}
- Allergens (NEVER use): ${childProfile.allergens?.join(', ') || 'none'}
- Pickiness Level: ${childProfile.pickiness_level || 'moderate'}
- Texture Preferences: ${childProfile.texture_preferences?.join(', ') || 'not specified'}
- Flavor Preferences: ${childProfile.flavor_preferences?.join(', ') || 'not specified'}
- Always Eats: ${childProfile.always_eats_foods?.join(', ') || 'not specified'}
- Dislikes: ${childProfile.disliked_foods?.join(', ') || 'not specified'}
` : '';

    // Group foods by category for better suggestions
    const foodsByCategory = pantryFoods.reduce((acc: any, food: any) => {
      if (!acc[food.category]) acc[food.category] = [];
      acc[food.category].push(food.name);
      return acc;
    }, {});

    const availableFoodsList = Object.entries(foodsByCategory)
      .map(([category, foods]) => `${category}: ${(foods as string[]).join(', ')}`)
      .join('\n');

    const systemPrompt = `You are a creative chef and nutrition expert helping parents create meals from available ingredients for picky eaters.

${profileContext}

AVAILABLE INGREDIENTS BY CATEGORY:
${availableFoodsList}

Your task: Suggest ${count} complete recipe ideas using ONLY the available ingredients above.

CRITICAL RULES:
1. ONLY use ingredients from the available list above
2. NEVER suggest ingredients not in the pantry (except basic seasonings like salt, pepper, oil)
3. AVOID all allergens listed in the child profile
4. Prioritize foods the child "Always Eats"
5. Avoid foods they dislike
6. Consider texture and flavor preferences
7. Make recipes appealing to their pickiness level
8. Keep recipes simple and quick for busy parents

For each recipe suggestion, provide:
- A fun, kid-friendly recipe name
- Brief description (1-2 sentences)
- List of food_names used (from available ingredients only)
- Reason why this recipe works for this child
- Difficulty (easy/medium)
- Estimated prep and cook time

Return your response as a JSON array with this structure:
[
  {
    "name": "Recipe Name",
    "description": "Brief description",
    "food_names": ["ingredient1", "ingredient2"],
    "reason": "Why this works for the child",
    "difficulty": "easy",
    "prepTime": "10 minutes",
    "cookTime": "15 minutes"
  }
]`;

    const userPrompt = `Suggest ${count} recipe ideas using available pantry items.`;

    // Prepare AI request
    const requestBody: any = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };

    if (aiSettings.model_name) requestBody.model = aiSettings.model_name;
    if (aiSettings.temperature != null) requestBody.temperature = aiSettings.temperature;
    if (aiSettings.max_tokens) requestBody.max_tokens = aiSettings.max_tokens;
    if (aiSettings.additional_params) Object.assign(requestBody, aiSettings.additional_params);

    const authHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (aiSettings.auth_type === 'bearer') {
      authHeaders['Authorization'] = `Bearer ${apiKey}`;
    } else if (aiSettings.auth_type === 'api_key' || aiSettings.auth_type === 'x-api-key') {
      authHeaders['x-api-key'] = apiKey;
    }

    console.log('Calling AI for recipe suggestions...');

    const response = await fetch(aiSettings.endpoint_url, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'AI service error', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let responseText = '';

    if (data.choices && data.choices[0]?.message?.content) {
      responseText = data.choices[0].message.content;
    } else if (data.content) {
      responseText = data.content;
    } else {
      throw new Error('Unexpected AI response format');
    }

    // Parse AI response
    let suggestions: RecipeSuggestion[];
    try {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                       responseText.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText;
      suggestions = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', e);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map food names to IDs
    const enrichedSuggestions = suggestions.map(suggestion => {
      const food_ids = suggestion.food_names
        .map(name => {
          const food = pantryFoods.find((f: any) =>
            f.name.toLowerCase() === name.toLowerCase()
          );
          return food?.id;
        })
        .filter(Boolean);

      return {
        ...suggestion,
        food_ids
      };
    });

    return new Response(
      JSON.stringify({ suggestions: enrichedSuggestions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in suggest-recipes-from-pantry:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
