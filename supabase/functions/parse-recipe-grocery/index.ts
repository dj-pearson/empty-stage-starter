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
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        redirect: 'follow',
      });
      if (!response.ok) {
        console.error(`URL fetch failed: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch recipe from URL (HTTP ${response.status})`);
      }
      const html = await response.text();
      
      // Try to extract JSON-LD recipe schema first (most reliable)
      const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      let recipeSchema = null;
      
      if (jsonLdMatch) {
        for (const script of jsonLdMatch) {
          const jsonText = script.replace(/<script[^>]*>|<\/script>/gi, '');
          try {
            const json = JSON.parse(jsonText);
            // Handle both single objects and arrays (JSON-LD can have @graph)
            const schemas = Array.isArray(json) ? json : (json['@graph'] || [json]);
            recipeSchema = schemas.find(s => s['@type'] === 'Recipe' || s['@type']?.includes('Recipe'));
            if (recipeSchema) {
              console.log('Found Recipe JSON-LD schema');
              recipeContent = JSON.stringify(recipeSchema, null, 2);
              break;
            }
          } catch (e) {
            // Continue to next script tag
          }
        }
      }
      
      // Fallback to HTML parsing - strip junk and extract readable text
      if (!recipeSchema) {
        console.log('No JSON-LD found, parsing HTML content');

        // Strip non-content elements first
        let cleaned = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[\s\S]*?<\/header>/gi, '')
          .replace(/<aside[\s\S]*?<\/aside>/gi, '')
          .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '');

        // Try to find recipe-specific sections
        const recipeBlock = cleaned.match(/<[^>]*class="[^"]*(?:recipe-card|wprm-recipe|tasty-recipe|recipe-content|recipe-body|entry-content)[^"]*"[^>]*>[\s\S]*?(?=<\/(?:div|article|section)>)/i);

        if (recipeBlock) {
          cleaned = recipeBlock[0];
        }

        // Strip all remaining HTML tags to get plain text
        const textContent = cleaned
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#\d+;/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (textContent.length < 100) {
          throw new Error('Could not extract recipe content from this URL. Try a direct recipe page, not a recipe list or roundup.');
        }

        recipeContent = textContent.slice(0, 15000);
        console.log('Extracted text content length:', recipeContent.length);
      }
    } else {
      throw new Error('Either url or imageBase64 must be provided');
    }

    // Parse with structured output
    console.log('Parsing recipe content with AI...');
    const jsonTemplate = `{
  "title": "Recipe Title",
  "description": "Brief description of the recipe",
  "servings": 4,
  "prepTime": "15 min",
  "cookTime": "30 min",
  "difficulty": "easy",
  "tags": ["dinner", "healthy"],
  "ingredients": [{"name": "flour", "quantity": 2, "unit": "cups", "category": "carb", "notes": "all-purpose"}],
  "instructions": "1. First step\\n2. Second step\\n3. Third step"
}`;
    const parsePrompt = imageBase64
      ? `Parse this recipe text and extract structured data:\n\n${recipeContent}\n\nProvide JSON with this structure:\n${jsonTemplate}`
      : `Parse this recipe HTML and extract all recipe information:\n\n${recipeContent}\n\nProvide JSON with this structure:\n${jsonTemplate}\n\nExtract the full step-by-step instructions, prep/cook times, difficulty (easy/medium/hard), and relevant tags. For ingredients, use categories: protein, carb, vegetable, fruit, dairy, grain, fat, seasoning, condiment, other.`;
    
    const aiResponse = await aiService.generateContent({
      messages: [
        {
          role: 'system',
          content: 'You are a recipe parser that extracts structured ingredient information. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: parsePrompt
        }
      ]
    }, 'lightweight'); // Fast parsing
    
    if (!aiResponse || !aiResponse.content) {
      throw new Error('No recipe data extracted');
    }

    console.log('AI Response:', aiResponse.content.substring(0, 500));

    // Parse JSON response - handle markdown code blocks and other formatting
    let jsonText = aiResponse.content;
    
    // Remove markdown code blocks if present
    jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Try to find JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Could not find JSON in response:', aiResponse.content);
      throw new Error('No valid JSON in AI response');
    }
    
    let recipe;
    try {
      recipe = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Attempted to parse:', jsonMatch[0].substring(0, 500));
      throw new Error(`Failed to parse JSON: ${parseError.message}`);
    }
    
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
