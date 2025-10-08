import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { selectedFoodNames, aiModel } = await req.json();
    
    if (!selectedFoodNames || selectedFoodNames.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No foods selected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get AI settings from the request
    const apiKey = Deno.env.get(aiModel.api_key_env_var);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `API key ${aiModel.api_key_env_var} not configured` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are a creative chef assistant helping parents create recipes for picky eaters. 
Create a complete, detailed recipe using the provided ingredients. Include:
- A creative, kid-friendly recipe name
- A brief description (2-3 sentences)
- Detailed cooking instructions (numbered steps)
- Prep time and cook time estimates
- Any additional common ingredients needed (keep it simple!)
- Tips for making it appealing to picky eaters

Format your response as JSON with these exact fields:
{
  "name": "Recipe Name",
  "description": "Brief description",
  "instructions": "Detailed numbered cooking instructions",
  "prepTime": "X minutes",
  "cookTime": "X minutes", 
  "servings": "X servings",
  "additionalIngredients": ["ingredient1", "ingredient2"],
  "tips": "Tips for picky eaters"
}`;

    const userPrompt = `Create a recipe using these ingredients: ${selectedFoodNames.join(', ')}`;

    // Prepare the request body
    const requestBody: any = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };

    // Add model-specific parameters
    if (aiModel.model_name) {
      requestBody.model = aiModel.model_name;
    }
    if (aiModel.temperature !== null && aiModel.temperature !== undefined) {
      requestBody.temperature = aiModel.temperature;
    }
    if (aiModel.max_tokens) {
      requestBody.max_tokens = aiModel.max_tokens;
    }
    if (aiModel.additional_params) {
      Object.assign(requestBody, aiModel.additional_params);
    }

    // Prepare authorization header based on auth type
    const authHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (aiModel.auth_type === 'bearer') {
      authHeaders['Authorization'] = `Bearer ${apiKey}`;
    } else if (aiModel.auth_type === 'api_key') {
      authHeaders['x-api-key'] = apiKey;
    }

    console.log('Calling AI endpoint:', aiModel.endpoint_url);
    
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
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please check your AI service credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'AI service error', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AI response received');

    // Extract the recipe from the AI response
    let recipeText = '';
    if (data.choices && data.choices[0]?.message?.content) {
      recipeText = data.choices[0].message.content;
    } else if (data.content) {
      recipeText = data.content;
    } else {
      throw new Error('Unexpected AI response format');
    }

    // Try to parse as JSON
    let recipe;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = recipeText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       recipeText.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : recipeText;
      recipe = JSON.parse(jsonStr);
    } catch (e) {
      console.log('Failed to parse as JSON, using text response');
      recipe = {
        name: 'AI Generated Recipe',
        description: recipeText.substring(0, 200),
        instructions: recipeText,
        prepTime: 'N/A',
        cookTime: 'N/A',
        servings: 'N/A',
        additionalIngredients: [],
        tips: ''
      };
    }

    return new Response(
      JSON.stringify({ recipe }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in suggest-recipe function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
