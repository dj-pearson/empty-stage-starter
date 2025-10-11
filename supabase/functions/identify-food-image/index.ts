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
    const { imageBase64 } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Normalize image to a data URL if needed
    const imageDataUrl = typeof imageBase64 === 'string' && imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    console.log('Analyzing food image with AI...');

    // Use Gemini Flash for vision + reasoning
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
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Identify the food item(s) in this image. Return a JSON response with:\n- name: The specific food name (e.g., "Orange", "Apple", "Chicken Breast")\n- variety: The specific variety if identifiable (e.g., "Gala", "Fuji", "Granny Smith" for apples, "Navel", "Valencia" for oranges). Leave empty if variety cannot be determined or doesn\'t apply.\n- varietyOptions: Array of common varieties for this food type (e.g., ["Gala", "Fuji", "Honeycrisp", "Granny Smith", "Red Delicious"] for apples). Leave empty if varieties don\'t apply.\n- category: one of: protein, carb, dairy, fruit, vegetable, snack\n- confidence: a number 0-100 indicating identification confidence\n- description: brief description of what you see\n- servingSize: estimated typical serving size (e.g., "1 medium", "1 cup")\n- quantity: number of items visible in the image (count them carefully)\n- servingSizeOptions: array of common serving size options for this food (e.g., ["1 small", "1 medium", "1 large"] for oranges, or ["1 cuties", "1 small", "1 medium", "1 large"] for oranges that could be different sizes)\n\nIf multiple food items are visible, identify the most prominent type and count how many of that type are shown.\nOnly respond with valid JSON, no other text.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ]
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required, please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response from AI
    const cleanContent = content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const foodData = JSON.parse(cleanContent);

    console.log('Food identified:', foodData);

    return new Response(
      JSON.stringify({ success: true, foodData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error identifying food:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to identify food' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
