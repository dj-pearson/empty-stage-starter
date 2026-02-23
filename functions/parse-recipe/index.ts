/**
 * Parse Recipe Edge Function
 *
 * Extracts recipe data from a URL by parsing JSON-LD structured data
 * or falling back to HTML parsing.
 *
 * POST /parse-recipe
 * Body: { "url": "https://example.com/recipe/..." }
 * Auth: No JWT required (public)
 *
 * Response (200):
 * {
 *   "recipe": {
 *     "name": "...",
 *     "ingredients": [...],
 *     "instructions": [...],
 *     "servings": 4,
 *     "nutrition": { ... },
 *     "image_url": "...",
 *     "source_url": "..."
 *   }
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedRecipe {
  name: string;
  ingredients: string[];
  instructions: string[];
  servings: number | null;
  prep_time: string | null;
  cook_time: string | null;
  total_time: string | null;
  nutrition: Record<string, string | number> | null;
  image_url: string | null;
  source_url: string;
}

/** Extract JSON-LD recipe data from HTML */
function extractJsonLd(html: string): Record<string, unknown> | null {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const jsonData = JSON.parse(match[1]);

      // Handle @graph arrays
      if (jsonData['@graph']) {
        const recipe = jsonData['@graph'].find(
          (item: Record<string, unknown>) => item['@type'] === 'Recipe',
        );
        if (recipe) return recipe;
      }

      // Direct Recipe type
      if (jsonData['@type'] === 'Recipe') {
        return jsonData;
      }

      // Array of schemas
      if (Array.isArray(jsonData)) {
        const recipe = jsonData.find((item) => item['@type'] === 'Recipe');
        if (recipe) return recipe;
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return null;
}

/** Parse recipe from JSON-LD structured data */
function parseFromJsonLd(data: Record<string, unknown>, url: string): ParsedRecipe {
  const ingredients: string[] = [];
  if (Array.isArray(data.recipeIngredient)) {
    for (const ing of data.recipeIngredient) {
      if (typeof ing === 'string') {
        ingredients.push(ing.trim());
      }
    }
  }

  const instructions: string[] = [];
  if (Array.isArray(data.recipeInstructions)) {
    for (const step of data.recipeInstructions) {
      if (typeof step === 'string') {
        instructions.push(step.trim());
      } else if (step && typeof step === 'object' && 'text' in step) {
        instructions.push(String(step.text).trim());
      }
    }
  }

  let nutrition: Record<string, string | number> | null = null;
  if (data.nutrition && typeof data.nutrition === 'object') {
    const n = data.nutrition as Record<string, unknown>;
    nutrition = {};
    if (n.calories) nutrition.calories = String(n.calories);
    if (n.proteinContent) nutrition.protein = String(n.proteinContent);
    if (n.carbohydrateContent) nutrition.carbohydrates = String(n.carbohydrateContent);
    if (n.fatContent) nutrition.fat = String(n.fatContent);
    if (n.fiberContent) nutrition.fiber = String(n.fiberContent);
    if (n.sodiumContent) nutrition.sodium = String(n.sodiumContent);
    if (n.sugarContent) nutrition.sugar = String(n.sugarContent);
  }

  let servings: number | null = null;
  if (data.recipeYield) {
    const yieldStr = Array.isArray(data.recipeYield)
      ? data.recipeYield[0]
      : data.recipeYield;
    const parsed = parseInt(String(yieldStr));
    if (!isNaN(parsed)) servings = parsed;
  }

  let imageUrl: string | null = null;
  if (data.image) {
    if (typeof data.image === 'string') {
      imageUrl = data.image;
    } else if (Array.isArray(data.image)) {
      imageUrl = typeof data.image[0] === 'string' ? data.image[0] : null;
    } else if (typeof data.image === 'object' && data.image !== null && 'url' in data.image) {
      imageUrl = String((data.image as Record<string, unknown>).url);
    }
  }

  return {
    name: String(data.name ?? 'Untitled Recipe'),
    ingredients,
    instructions,
    servings,
    prep_time: data.prepTime ? String(data.prepTime) : null,
    cook_time: data.cookTime ? String(data.cookTime) : null,
    total_time: data.totalTime ? String(data.totalTime) : null,
    nutrition,
    image_url: imageUrl,
    source_url: url,
  };
}

/** Fallback: extract recipe data from HTML meta tags and content */
function parseFromHtml(html: string, url: string): ParsedRecipe {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const name = ogTitleMatch?.[1] ?? titleMatch?.[1] ?? 'Untitled Recipe';

  // Extract image
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  const imageUrl = ogImageMatch?.[1] ?? null;

  return {
    name: name.replace(/ - .*$/, '').trim(),
    ingredients: [],
    instructions: [],
    servings: null,
    prep_time: null,
    cook_time: null,
    total_time: null,
    nutrition: null,
    image_url: imageUrl,
    source_url: url,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({ error: 'url is required and must be a string' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL. Must be an HTTP or HTTPS URL.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch the recipe page
    const pageResponse = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'EatPal Recipe Parser/1.0',
        'Accept': 'text/html',
      },
    });

    if (!pageResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch URL: HTTP ${pageResponse.status}` }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const html = await pageResponse.text();

    // Try JSON-LD first, then fallback to HTML parsing
    const jsonLdData = extractJsonLd(html);
    let recipe: ParsedRecipe;
    let parseMethod: string;

    if (jsonLdData) {
      recipe = parseFromJsonLd(jsonLdData, url);
      parseMethod = 'json-ld';
    } else {
      recipe = parseFromHtml(html, url);
      parseMethod = 'html-fallback';
    }

    return new Response(
      JSON.stringify({ recipe, parse_method: parseMethod }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('parse-recipe error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
