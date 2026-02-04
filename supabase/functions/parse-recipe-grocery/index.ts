import { AIServiceV2 } from '../_shared/ai-service-v2.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, imageBase64 } = await req.json();
    
    // Initialize AI service
    const aiService = new AIServiceV2();

    let recipeContent = "";
    
    // Handle image-based recipe parsing
    if (imageBase64) {
      console.log('Parsing recipe from image using AI...');
      // Note: Vision API requires Claude Sonnet or similar - use standard task type
      recipeContent = await aiService.generateContent(
        'Extract all ingredients from this recipe image. Include the recipe title if visible. List each ingredient with its quantity and unit. Format as plain text.',
        {
          taskType: 'standard', // Vision requires more capable model
          // TODO: Add vision support to AIServiceV2 if Claude supports it
        }
      );
      
      if (!recipeContent) {
        throw new Error('Failed to analyze recipe image');
      }
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

    // Parse with structured output
    console.log('Parsing recipe content with AI...');
    const parsePrompt = imageBase64 
      ? `Parse this recipe text and extract structured data:\n\n${recipeContent}\n\nProvide JSON with: {"title": "Recipe Title", "servings": 4, "ingredients": [{"name": "flour", "quantity": 2, "unit": "cups", "category": "carb", "notes": "all-purpose"}]}`
      : `Parse this recipe HTML and extract ingredients:\n\n${recipeContent}\n\nProvide JSON with: {"title": "Recipe Title", "servings": 4, "ingredients": [{"name": "flour", "quantity": 2, "unit": "cups", "category": "carb", "notes": "all-purpose"}]}`;
    
    const recipeJson = await aiService.generateContent(parsePrompt, {
      systemPrompt: 'You are a recipe parser that extracts structured ingredient information. Always respond with valid JSON only.',
      taskType: 'lightweight', // Fast parsing
    });
    
    if (!recipeJson) {
      throw new Error('No recipe data extracted');
    }

    // Parse JSON response
    const jsonMatch = recipeJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in AI response');
    }
    const recipe = JSON.parse(jsonMatch[0]);
    
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
};
