import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url, text, aiModel } = await req.json();

    if (!aiModel) {
      return new Response(
        JSON.stringify({ error: 'AI model configuration is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let content = text;

    // If URL provided, fetch the content
    if (url) {
      console.log('Fetching content from URL:', url);
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; EatPal/1.0; +https://tryeatpal.com)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
        }
        content = await response.text();
      } catch (error) {
        console.error('Error fetching URL:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch content from URL' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'Either URL or text content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API key from environment
    const apiKey = Deno.env.get(aiModel.api_key_env_var);
    if (!apiKey) {
      console.error(`API key not found: ${aiModel.api_key_env_var}`);
      return new Response(
        JSON.stringify({ error: 'AI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare the prompt
    const systemPrompt = `You are a recipe parser. Extract recipe information from the provided content and return it as JSON.

Return a JSON object with this exact structure:
{
  "name": "Recipe name",
  "description": "Brief description",
  "ingredients": ["ingredient1", "ingredient2"],
  "instructions": "Step-by-step cooking instructions",
  "prepTime": "X min",
  "cookTime": "X min",
  "servings": "X",
  "additionalIngredients": "Common pantry items like salt, pepper, etc.",
  "tips": "Tips for picky eaters or variations"
}

Extract all available information. If something is missing, use an empty string or empty array.`;

    const userPrompt = `Parse this recipe content:\n\n${content.slice(0, 8000)}`;

    // Build request body based on AI model
    const requestBody: any = {
      model: aiModel.model_name,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
    };

    if (aiModel.temperature !== null) {
      requestBody.temperature = aiModel.temperature;
    }
    if (aiModel.max_tokens !== null) {
      requestBody.max_tokens = aiModel.max_tokens;
    }
    if (aiModel.additional_params) {
      Object.assign(requestBody, aiModel.additional_params);
    }

    console.log('Calling AI API:', aiModel.endpoint_url);

    // Set up headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (aiModel.auth_type === 'bearer') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (aiModel.auth_type === 'api_key') {
      headers['x-api-key'] = apiKey;
    }

    const aiResponse = await fetch(aiModel.endpoint_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'AI API rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI API error: ${aiResponse.statusText}` }),
        { status: aiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    console.log('AI response received');

    const recipeText = aiData.choices?.[0]?.message?.content || '';

    // Try to extract JSON from the response
    let recipe;
    try {
      // Remove markdown code blocks if present
      const jsonMatch = recipeText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        recipe = JSON.parse(jsonMatch[1]);
      } else {
        // Try to parse the entire response as JSON
        recipe = JSON.parse(recipeText);
      }
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', e);
      // Fallback: return basic structure with the content
      recipe = {
        name: "Imported Recipe",
        description: "",
        ingredients: [],
        instructions: recipeText,
        prepTime: "",
        cookTime: "",
        servings: "",
        additionalIngredients: "",
        tips: ""
      };
    }

    return new Response(
      JSON.stringify({ recipe }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in parse-recipe function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
