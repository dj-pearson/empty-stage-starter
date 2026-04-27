import { AIServiceV2 } from '../_shared/ai-service-v2.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

const SYSTEM_PROMPT = `You are a recipe parser. Extract recipe information from the provided content and return it as JSON.

Return a JSON object with this exact structure:
{
  "name": "Recipe name",
  "description": "Brief description",
  "image_url": "Direct URL to the main recipe image, if present",
  "ingredients": ["ingredient1", "ingredient2"],
  "instructions": "Step-by-step cooking instructions",
  "prep_time": "X min",
  "cook_time": "X min",
  "servings": "X",
  "additional_ingredients": "Common pantry items like salt, pepper, etc.",
  "tips": "Tips for picky eaters or variations"
}

Extract all available information. If something is missing, use an empty string or empty array. Use snake_case keys exactly as shown.`;

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url, text, aiModel } = await req.json();

    let content: string = text ?? '';
    let imageFromPage: string | null = null;

    if (url) {
      console.log('Fetching content from URL:', url);
      try {
        const response = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' });
        if (!response.ok) {
          throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
        }
        const html = await response.text();
        const extracted = extractFromHtml(html);
        content = extracted.content;
        imageFromPage = extracted.imageUrl;
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

    const userPrompt = `Parse this recipe content:\n\n${content.slice(0, 8000)}`;
    let recipeText = '';

    if (aiModel) {
      // Legacy path: the web client passes a row from the `ai_settings` table.
      const apiKey = Deno.env.get(aiModel.api_key_env_var);
      if (!apiKey) {
        console.error(`API key not found: ${aiModel.api_key_env_var}`);
        return new Response(
          JSON.stringify({ error: 'AI API key not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const requestBody: Record<string, unknown> = {
        model: aiModel.model_name,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      };
      if (aiModel.temperature !== null) requestBody.temperature = aiModel.temperature;
      if (aiModel.max_tokens !== null) requestBody.max_tokens = aiModel.max_tokens;
      if (aiModel.additional_params) Object.assign(requestBody, aiModel.additional_params);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (aiModel.auth_type === 'bearer') headers['Authorization'] = `Bearer ${apiKey}`;
      else if (aiModel.auth_type === 'api_key') headers['x-api-key'] = apiKey;

      console.log('Calling AI API:', aiModel.endpoint_url);
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
      recipeText = aiData.choices?.[0]?.message?.content || '';
    } else {
      // Server-side path used by the iOS app and share extension. No client config.
      console.log('Using server-side AIServiceV2');
      const aiService = new AIServiceV2();
      const aiResponse = await aiService.generateContent({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }, 'lightweight');
      recipeText = aiResponse?.content ?? '';
      if (!recipeText) {
        return new Response(
          JSON.stringify({ error: 'No recipe data extracted' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const recipe = normalizeRecipe(parseRecipeJson(recipeText), imageFromPage);

    return new Response(
      JSON.stringify({ recipe }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error in parse-recipe function:', error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

function extractFromHtml(html: string): { content: string; imageUrl: string | null } {
  let content = '';
  let imageUrl: string | null = null;

  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    for (const script of jsonLdMatches) {
      const jsonText = script.replace(/<script[^>]*>|<\/script>/gi, '').trim();
      try {
        const json = JSON.parse(jsonText);
        const schemas = Array.isArray(json) ? json : (json['@graph'] || [json]);
        const recipeSchema = schemas.find((s: any) => {
          const t = s?.['@type'];
          return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
        });
        if (recipeSchema) {
          content = JSON.stringify(recipeSchema, null, 2);
          imageUrl = pickImageFromSchema(recipeSchema.image);
          break;
        }
      } catch {
        // try next script
      }
    }
  }

  if (!imageUrl) {
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
            || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (og) imageUrl = og[1];
  }

  if (!content) {
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const textContent = cleaned
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    content = textContent.slice(0, 15000);
  }

  return { content, imageUrl };
}

function pickImageFromSchema(image: unknown): string | null {
  if (!image) return null;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) {
    for (const entry of image) {
      const picked = pickImageFromSchema(entry);
      if (picked) return picked;
    }
    return null;
  }
  if (typeof image === 'object') {
    const url = (image as Record<string, unknown>).url;
    if (typeof url === 'string') return url;
  }
  return null;
}

function parseRecipeJson(raw: string): Record<string, unknown> {
  try {
    const fenced = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (fenced) return JSON.parse(fenced[1]);
    const obj = raw.match(/\{[\s\S]*\}/);
    if (obj) return JSON.parse(obj[0]);
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse AI response as JSON:', e);
    return {
      name: 'Imported Recipe',
      description: '',
      ingredients: [],
      instructions: raw,
      prep_time: '',
      cook_time: '',
      servings: '',
      additional_ingredients: '',
      tips: '',
    };
  }
}

function normalizeRecipe(recipe: Record<string, unknown>, imageFromPage: string | null) {
  const ingredients = Array.isArray(recipe.ingredients)
    ? (recipe.ingredients as unknown[]).map((i) => {
        if (typeof i === 'string') return i;
        if (i && typeof i === 'object') {
          const obj = i as Record<string, unknown>;
          const parts = [obj.quantity, obj.unit, obj.name].filter((p) => p != null && p !== '').map(String);
          return parts.join(' ').trim() || String(obj.name ?? '');
        }
        return String(i);
      }).filter((s) => s.length > 0)
    : [];

  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = recipe[k];
      if (v != null && v !== '') return typeof v === 'string' ? v : String(v);
    }
    return '';
  };

  return {
    name: pick('name', 'title') || 'Imported Recipe',
    description: pick('description'),
    image_url: pick('image_url', 'imageUrl', 'image') || imageFromPage || null,
    ingredients,
    instructions: pick('instructions'),
    prep_time: pick('prep_time', 'prepTime'),
    cook_time: pick('cook_time', 'cookTime'),
    servings: pick('servings'),
    additional_ingredients: pick('additional_ingredients', 'additionalIngredients'),
    tips: pick('tips'),
  };
}
