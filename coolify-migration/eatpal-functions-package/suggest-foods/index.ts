
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { foods, planEntries, childProfile } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Analyze current food preferences
    const safeFoods = foods.filter((f: any) => f.is_safe).map((f: any) => f.name);
    const tryBiteFoods = foods.filter((f: any) => f.is_try_bite).map((f: any) => f.name);
    
    // Get eating history
    const successfulFoods = planEntries
      .filter((p: any) => p.result === 'ate')
      .map((p: any) => {
        const food = foods.find((f: any) => f.id === p.food_id);
        return food?.name;
      })
      .filter(Boolean);

    // Build comprehensive child profile context
    const profileContext = childProfile ? `
Child Profile:
- Age: ${childProfile.age || 'not specified'} years old
- Allergens: ${childProfile.allergens?.join(', ') || 'none'}
- Dietary Restrictions: ${childProfile.dietary_restrictions?.join(', ') || 'none'}
- Eating Behavior: ${childProfile.eating_behavior || 'not specified'}
- Pickiness Level: ${childProfile.pickiness_level || 'not specified'}
- New Food Willingness: ${childProfile.new_food_willingness || 'not specified'}
- Texture Sensitivity: ${childProfile.texture_sensitivity_level || 'not specified'}
- Preferred Textures: ${childProfile.texture_preferences?.join(', ') || 'not specified'}
- Disliked Textures: ${childProfile.texture_dislikes?.join(', ') || 'not specified'}
- Flavor Preferences: ${childProfile.flavor_preferences?.join(', ') || 'not specified'}
- Preferred Preparations: ${childProfile.preferred_preparations?.join(', ') || 'not specified'}
- Always Eats: ${childProfile.always_eats_foods?.join(', ') || 'not specified'}
- Favorite Foods: ${childProfile.favorite_foods?.join(', ') || 'not specified'}
- Foods to Avoid: ${childProfile.disliked_foods?.join(', ') || 'not specified'}
- Health Goals: ${childProfile.health_goals?.join(', ') || 'none'}
- Nutrition Concerns: ${childProfile.nutrition_concerns?.join(', ') || 'none'}
` : '';

    const prompt = `Based on a child's detailed profile, current safe foods, and eating history, suggest 5 new foods they might try.

${profileContext}

Current Food Status:
- Safe foods they already enjoy: ${safeFoods.join(', ')}
- Current try bite foods: ${tryBiteFoods.join(', ')}
- Foods they've eaten successfully: ${successfulFoods.join(', ')}

Please suggest 5 new foods that:
1. Respect all allergens and dietary restrictions (CRITICAL - never suggest foods containing their allergens)
2. Match their texture preferences and avoid disliked textures
3. Align with their flavor preferences
4. Are appropriate for their eating behavior and pickiness level
5. Use their preferred preparation methods when possible
6. Consider their new food willingness level
7. Support their health goals and address nutrition concerns
8. Are similar to foods they already enjoy
9. Include a variety of food categories (protein, carb, fruit, vegetable, dairy, snack)

For each suggestion, provide:
- name: the food name
- category: one of [protein, carb, fruit, vegetable, dairy, snack]
- reason: a brief explanation of why this food is a good choice based on their specific profile

Respond in JSON format with an array called "suggestions".`;

    console.log('Calling Lovable AI with prompt');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that suggests new foods for picky eaters. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limits exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log('AI response:', content);
    
    // Parse the JSON response
    let suggestions;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        suggestions = parsed.suggestions || [];
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback to default suggestions
      suggestions = [
        { name: 'Turkey Slices', category: 'protein', reason: 'Similar to other mild proteins' },
        { name: 'Sweet Potato Fries', category: 'vegetable', reason: 'Naturally sweet and familiar shape' },
        { name: 'Cucumber Slices', category: 'vegetable', reason: 'Mild flavor and crunchy texture' },
        { name: 'Blueberries', category: 'fruit', reason: 'Sweet and bite-sized' },
        { name: 'Whole Wheat Crackers', category: 'snack', reason: 'Similar to crackers they enjoy' },
      ];
    }

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in suggest-foods function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
