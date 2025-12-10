import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, securityHeaders, privateCacheHeaders, noCacheHeaders, CACHE_DURATIONS } from "../common/headers.ts";

serve(async (req) => {
  // Get secure CORS headers based on request origin
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { kid, foods, recipes, planHistory, aiModel, days = 7 } = await req.json();

    if (!kid || !aiModel) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get AI settings
    const apiKey = Deno.env.get(aiModel.api_key_env_var);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `API key ${aiModel.api_key_env_var} not configured` }),
        { status: 500, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Performance: Analyze available foods (only essential fields)
    const safeFoods = foods
      .filter((f: any) => f.is_safe && (f.quantity || 0) > 0)
      .map((f: any) => ({
        id: f.id,
        name: f.name,
        category: f.category,
        quantity: f.quantity,
        unit: f.unit,
        allergens: f.allergens || [],
      }));

    const tryBiteFoods = foods
      .filter((f: any) => f.is_try_bite && (f.quantity || 0) > 0)
      .map((f: any) => ({
        id: f.id,
        name: f.name,
        category: f.category,
        allergens: f.allergens || [],
      }));

    // Filter out foods with kid's allergens
    const kidAllergens = kid.allergens || [];
    const safeForKid = safeFoods.filter((f: any) => {
      if (!f.allergens || f.allergens.length === 0) return true;
      return !f.allergens.some((a: string) => kidAllergens.includes(a));
    });

    const tryBitesForKid = tryBiteFoods.filter((f: any) => {
      if (!f.allergens || f.allergens.length === 0) return true;
      return !f.allergens.some((a: string) => kidAllergens.includes(a));
    });

    // Performance: Limit recipes to top 20 most recent (reduces payload size)
    const availableRecipes = recipes
      .slice(0, 20)
      .map((r: any) => ({
        name: r.name,
        // Only include first 10 ingredients to keep payload small
        ingredients: r.food_ids
          .slice(0, 10)
          .map((id: string) => foods.find((f: any) => f.id === id)?.name)
          .filter(Boolean),
      }));

    // Build context for AI
    const systemPrompt = `You are a pediatric nutrition assistant helping plan meals for picky eaters.
Create a ${days}-day meal plan considering:
- Child's name: ${kid.name}
- Age: ${kid.age || 'Not specified'}
- Allergens to AVOID: ${kidAllergens.join(', ') || 'None'}
- Favorite foods: ${kid.favorite_foods?.join(', ') || 'Not specified'}

Available safe foods (with quantities):
${safeForKid.map((f: any) => `- ${f.name} (${f.quantity} ${f.unit || 'servings'}) - ${f.category}`).join('\n')}

Available try-bite foods:
${tryBitesForKid.map((f: any) => `- ${f.name} - ${f.category}`).join('\n')}

Available recipes:
${availableRecipes.map((r: any) => `- ${r.name}: ${r.ingredients.join(', ')}`).join('\n')}

Guidelines:
1. Include breakfast, lunch, dinner, snack1, snack2, and try_bite for each day
2. Rotate foods to prevent repetition (don't use same food within 3 days for same meal slot)
3. Each day should include ONE try-bite food (something new to try)
4. Use recipes when possible (specify the recipe name)
5. Consider quantities available and don't over-allocate
6. Avoid allergens completely
7. Include variety across food categories
8. Be mindful of picky eater preferences

Return a JSON array of meal entries in this exact format:
{
  "plan": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "meals": {
        "breakfast": "food_name_or_recipe_name",
        "lunch": "food_name_or_recipe_name",
        "dinner": "food_name_or_recipe_name",
        "snack1": "food_name",
        "snack2": "food_name",
        "try_bite": "food_name"
      }
    }
  ]
}`;

    const startDate = new Date();
    const dateRange = `Starting from ${startDate.toISOString().split('T')[0]}`;
    
    const userPrompt = `Create a ${days}-day meal plan ${dateRange}. Include variety and consider the child's preferences and available ingredients.`;

    // Prepare request
    const requestBody: any = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };

    if (aiModel.model_name) requestBody.model = aiModel.model_name;
    if (aiModel.temperature !== null && aiModel.temperature !== undefined) {
      requestBody.temperature = aiModel.temperature;
    }
    if (aiModel.max_tokens) requestBody.max_tokens = aiModel.max_tokens;
    if (aiModel.additional_params) Object.assign(requestBody, aiModel.additional_params);

    const authHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (aiModel.auth_type === 'bearer') {
      authHeaders['Authorization'] = `Bearer ${apiKey}`;
    } else if (aiModel.auth_type === 'api_key') {
      authHeaders['x-api-key'] = apiKey;
    }

    console.log('Calling AI for meal planning...');
    
    const response = await fetch(aiModel.endpoint_url, {
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
          { status: 429, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please check your AI service credits.' }),
          { status: 402, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'AI service error', details: errorText }),
        { status: 500, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AI response received');

    // Extract meal plan
    let mealPlanText = '';
    if (data.choices && data.choices[0]?.message?.content) {
      mealPlanText = data.choices[0].message.content;
    } else if (data.content) {
      mealPlanText = data.content;
    } else {
      throw new Error('Unexpected AI response format');
    }

    // Parse JSON response
    let mealPlan;
    try {
      const jsonMatch = mealPlanText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       mealPlanText.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : mealPlanText;
      mealPlan = JSON.parse(jsonStr);
    } catch (e) {
      console.log('Failed to parse AI response as JSON:', e);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI meal plan', details: mealPlanText }),
        { status: 500, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map meal plan to food IDs
    const planWithIds = mealPlan.plan.map((day: any) => {
      const mappedMeals: any = {};
      
      for (const [slot, foodName] of Object.entries(day.meals)) {
        // Try to find food by name
        let food = foods.find((f: any) => 
          f.name.toLowerCase() === (foodName as string).toLowerCase()
        );
        
        // If not found, try to find recipe
        if (!food) {
          const recipe = recipes.find((r: any) => 
            r.name.toLowerCase() === (foodName as string).toLowerCase()
          );
          
          if (recipe && recipe.food_ids.length > 0) {
            // Use first food from recipe
            food = foods.find((f: any) => f.id === recipe.food_ids[0]);
          }
        }
        
        if (food) {
          mappedMeals[slot] = food.id;
        }
      }
      
      return {
        ...day,
        meals: mappedMeals
      };
    });

    // Performance: Cache meal plans for 1 minute (private, user-specific)
    return new Response(
      JSON.stringify({ plan: planWithIds }),
      {
        status: 200,
        headers: privateCacheHeaders(CACHE_DURATIONS.DYNAMIC)
      }
    );

  } catch (error) {
    console.error('Error in ai-meal-plan function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: noCacheHeaders() }
    );
  }
});
