import { getCorsHeaders, securityHeaders, noCacheHeaders } from "../common/headers.ts";
import { AIServiceV2 } from "../_shared/ai-service-v2.ts";

export default async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { kid, foods, recipes, days = 7 } = await req.json();

    if (!kid) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const kidAllergens = kid.allergens || [];

    const safeFoods = foods
      .filter((f: any) => f.is_safe && (f.quantity || 0) > 0)
      .filter((f: any) => !(f.allergens || []).some((a: string) => kidAllergens.includes(a)))
      .map((f: any) => ({ id: f.id, name: f.name, category: f.category, quantity: f.quantity, unit: f.unit }));

    const tryBiteFoods = foods
      .filter((f: any) => f.is_try_bite && (f.quantity || 0) > 0)
      .filter((f: any) => !(f.allergens || []).some((a: string) => kidAllergens.includes(a)))
      .map((f: any) => ({ id: f.id, name: f.name, category: f.category }));

    const availableRecipes = (recipes || [])
      .slice(0, 20)
      .map((r: any) => ({
        name: r.name,
        ingredients: (r.food_ids || [])
          .slice(0, 10)
          .map((id: string) => foods.find((f: any) => f.id === id)?.name)
          .filter(Boolean),
      }));

    const systemPrompt = `You are a pediatric nutrition assistant helping plan meals for picky eaters.
Create a ${days}-day meal plan considering:
- Child's name: ${kid.name}
- Age: ${kid.age || 'Not specified'}
- Allergens to AVOID: ${kidAllergens.join(', ') || 'None'}
- Favorite foods: ${kid.favorite_foods?.join(', ') || 'Not specified'}

Available safe foods (with quantities):
${safeFoods.map((f: any) => `- ${f.name} (${f.quantity} ${f.unit || 'servings'}) - ${f.category}`).join('\n')}

Available try-bite foods:
${tryBiteFoods.map((f: any) => `- ${f.name} - ${f.category}`).join('\n')}

Available recipes:
${availableRecipes.map((r: any) => `- ${r.name}: ${r.ingredients.join(', ')}`).join('\n')}

Guidelines:
1. Include breakfast, lunch, dinner, snack1, snack2, and try_bite for each day
2. Rotate foods to prevent repetition
3. Each day should include ONE try-bite food
4. Use recipes when possible
5. Consider quantities available
6. Avoid allergens completely
7. Include variety across food categories

Return ONLY valid JSON (no markdown, no explanation) in this format:
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
    const userPrompt = `Create a ${days}-day meal plan starting from ${startDate.toISOString().split('T')[0]}.`;

    console.log('[ai-meal-plan] Generating plan with AIServiceV2...');

    const aiService = new AIServiceV2();
    const response = await aiService.generateContent(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: 4000,
        temperature: 0.7,
      },
      'standard'
    );

    console.log('[ai-meal-plan] Response received, model:', response.model);

    // Parse JSON response
    let mealPlanText = response.content;
    const jsonMatch = mealPlanText.match(/```json\s*([\s\S]*?)\s*```/) ||
                     mealPlanText.match(/```\s*([\s\S]*?)\s*```/) ||
                     mealPlanText.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const mealPlan = JSON.parse(jsonMatch[1] || jsonMatch[0]);

    // Map meal names back to food IDs
    const planWithIds = mealPlan.plan.map((day: any) => {
      const mappedMeals: any = {};
      for (const [slot, foodName] of Object.entries(day.meals)) {
        const name = (foodName as string).toLowerCase();
        let food = foods.find((f: any) => f.name.toLowerCase() === name);

        if (!food) {
          const recipe = (recipes || []).find((r: any) => r.name.toLowerCase() === name);
          if (recipe?.food_ids?.length > 0) {
            food = foods.find((f: any) => f.id === recipe.food_ids[0]);
          }
        }

        if (food) mappedMeals[slot] = food.id;
      }
      return { ...day, meals: mappedMeals };
    });

    return new Response(
      JSON.stringify({ plan: planWithIds }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          ...securityHeaders,
          ...noCacheHeaders(),
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('[ai-meal-plan] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          ...securityHeaders,
          ...noCacheHeaders(),
          'Content-Type': 'application/json',
        },
      }
    );
  }
};
