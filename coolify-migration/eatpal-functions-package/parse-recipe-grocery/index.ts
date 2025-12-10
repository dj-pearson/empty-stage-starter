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
    const { url, imageBase64 } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    let recipeContent = "";
    
    // Handle image-based recipe parsing
    if (imageBase64) {
      console.log('Parsing recipe from image using AI...');
      const visionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all ingredients from this recipe image. Include the recipe title if visible. List each ingredient with its quantity and unit. Format as plain text.'
                },
                {
                  type: 'image_url',
                  image_url: { url: imageBase64 }
                }
              ]
            }
          ]
        })
      });

      if (!visionResponse.ok) {
        const errorText = await visionResponse.text();
        console.error('Vision API error:', errorText);
        
        if (visionResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (visionResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: 'AI credits required. Please add credits to continue.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        throw new Error('Failed to analyze recipe image');
      }

      const visionData = await visionResponse.json();
      recipeContent = visionData.choices[0].message.content;
    }
    // Handle URL-based recipe parsing
    else if (url) {
      console.log('Fetching recipe from URL:', url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch recipe from URL');
      }
      const html = await response.text();
      recipeContent = html.slice(0, 10000); // Limit HTML size
    } else {
      throw new Error('Either url or imageBase64 must be provided');
    }

    // Parse with structured output using tool calling
    console.log('Parsing recipe content with AI...');
    const parseResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: 'You are a recipe parser that extracts structured ingredient information.'
          },
          {
            role: 'user',
            content: imageBase64 
              ? `Parse this recipe text:\n\n${recipeContent}`
              : `Parse this recipe HTML and extract ingredients:\n\n${recipeContent}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'parse_recipe',
              description: 'Extract recipe title, servings, and ingredients with quantities',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Recipe title' },
                  servings: { type: 'number', description: 'Number of servings (if available)' },
                  ingredients: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: 'Ingredient name' },
                        quantity: { type: 'number', description: 'Quantity amount' },
                        unit: { type: 'string', description: 'Unit of measurement (e.g., cups, tbsp, items)' },
                        category: { 
                          type: 'string', 
                          enum: ['protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack'],
                          description: 'Food category'
                        },
                        notes: { type: 'string', description: 'Optional notes (e.g., diced, chopped)' }
                      },
                      required: ['name', 'quantity', 'unit', 'category']
                    }
                  }
                },
                required: ['title', 'ingredients']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'parse_recipe' } }
      })
    });

    if (!parseResponse.ok) {
      const errorText = await parseResponse.text();
      console.error('Parse API error:', errorText);
      
      if (parseResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (parseResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits required. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('Failed to parse recipe');
    }

    const parseData = await parseResponse.json();
    const toolCall = parseData.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No recipe data extracted');
    }

    const recipe = JSON.parse(toolCall.function.arguments);
    
    return new Response(
      JSON.stringify({ recipe }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in parse-recipe-grocery function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to parse recipe' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
