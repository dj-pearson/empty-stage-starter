import { AIServiceV2 } from '../_shared/ai-service-v2.ts';
import { requireUser } from '../_shared/require-admin.ts';
import { fetchRecipePage } from '../_shared/url-validator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  // Authenticated users only: paid AI call + fetches arbitrary user URLs (SSRF surface).
  const gate = await requireUser(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error ?? 'Unauthorized' }), {
      status: gate.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // US-709: read only url and text. Any other key in the body -- aiModel
    // in particular -- is ignored rather than honoured.
    const { url, text } = await req.json();

    let content: string = text ?? '';
    let imageFromPage: string | null = null;

    if (url) {
      console.log('Fetching content from URL:', url);
      // US-710: https-only, no private or metadata address, redirects followed
      // manually and re-validated, 10s per hop, 2 MB body cap.
      const page = await fetchRecipePage(url);
      if (!page.ok) {
        console.error('Refused or failed URL fetch:', page.status, page.error);
        return new Response(
          JSON.stringify({ error: page.error }),
          { status: page.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const extracted = extractFromHtml(page.html);
      content = extracted.content;
      imageFromPage = extracted.imageUrl;
    }

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'Either URL or text content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userPrompt = `Parse this recipe content:\n\n${content.slice(0, 8000)}`;

    // US-709: the model is resolved server-side. There is no client-supplied
    // endpoint or API-key env var to name, so a signed-in caller cannot make
    // this function read an arbitrary secret out of the function environment.
    console.log('Using server-side AIServiceV2');
    const aiService = new AIServiceV2();
    const aiResponse = await aiService.generateContent({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }, 'lightweight');
    const recipeText = aiResponse?.content ?? '';
    if (!recipeText) {
      return new Response(
        JSON.stringify({ error: 'No recipe data extracted' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
