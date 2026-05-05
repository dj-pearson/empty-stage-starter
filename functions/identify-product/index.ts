/**
 * US-273: Identify Product Edge Function
 *
 * Single-product vision identification — different from
 * `parse-grocery-image` which OCRs a list. Given a photo of one
 * grocery item (label, packaging, fresh produce), returns the
 * structured attributes the iOS Quick Add flow needs to pre-fill the
 * form: name, brand, package size + unit, FoodCategory, GroceryAisle,
 * and a confidence score the UI uses to decide whether to ask the
 * user to confirm before saving.
 *
 * POST /identify-product
 * Body: { "imageBase64": "base64-encoded-image-data" }
 *
 * Response (200):
 * {
 *   "name": "Chicken Breast",
 *   "brand": "Tyson",
 *   "packageSize": 1.5,
 *   "packageUnit": "lb",
 *   "category": "protein",
 *   "aisleSection": "meat_deli",
 *   "confidence": 0.86
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';

// Mirrors FoodCategory.swift / FoodCategory web type. Keep in sync.
const VALID_CATEGORIES = ['protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack'];

// Mirrors GroceryAisle.rawValue (32 values). Keep in sync with
// ios/EatPal/EatPal/Models/GroceryAisle.swift.
const VALID_AISLES = [
  'produce', 'bakery', 'bread', 'meat_deli', 'seafood', 'dairy', 'eggs',
  'refrigerated', 'frozen_meals', 'frozen_veg', 'frozen_treats', 'canned',
  'dry_soups', 'pasta', 'rice_grains', 'condiments', 'baking', 'breakfast',
  'snacks', 'crackers', 'candy', 'beverages', 'alcohol', 'ethnic_mexican',
  'ethnic_asian', 'ethnic_european', 'household', 'paper_goods', 'cleaning',
  'personal_care', 'baby', 'pet', 'other',
];

// Common package units the model is allowed to return. Anything else
// gets clamped to "count" so the iOS unit picker is never confused.
const VALID_UNITS = [
  'count', 'oz', 'lb', 'g', 'kg', 'cups', 'tbsp', 'tsp', 'ml', 'l',
  'pack', 'box', 'bag', 'bottle', 'can', 'jar',
];

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const { imageBase64 } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return new Response(
        JSON.stringify({ error: 'imageBase64 is required and must be a string' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const systemPrompt = `You are a grocery product identification assistant. Given a single photo of one grocery item (label, packaging, or fresh produce), extract the product's attributes.

Return ONLY valid JSON in this exact shape:
{
  "name": "common product name (no brand prefix)",
  "brand": "brand name or null",
  "packageSize": numeric quantity printed on the package or null,
  "packageUnit": one of ${JSON.stringify(VALID_UNITS)} or null,
  "category": one of ${JSON.stringify(VALID_CATEGORIES)},
  "aisleSection": one of ${JSON.stringify(VALID_AISLES)},
  "confidence": 0.0-1.0
}

Rules:
- "name" is the generic item name a shopper would say ("Chicken Breast", "Whole Milk", "Avocado"), not the brand-prefixed marketing name
- "brand" is null when the photo shows fresh produce or no brand is visible
- "packageSize" + "packageUnit" come from the label (e.g. "1.5 lb", "16 oz", "1 gal"); both null for fresh produce
- "aisleSection" must use the exact lowercase rawValue list above ("meat_deli" not "Meat Deli")
- "confidence" reflects how sure you are about ALL fields combined. Use < 0.7 when the photo is blurry, the label is partially obscured, or you're guessing on aisle/category
- If you cannot identify a product at all, return { "name": "", ..., "confidence": 0.0 } and the caller will show an error`;

    let mediaType = 'image/jpeg';
    if (imageBase64.startsWith('iVBOR')) mediaType = 'image/png';
    else if (imageBase64.startsWith('UklGR')) mediaType = 'image/webp';

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mediaType};base64,${imageBase64}`, detail: 'high' },
              },
              { type: 'text', text: 'Identify this single product.' },
            ],
          },
        ],
        max_tokens: 400,
        temperature: 0.1,
        // gpt-4o-mini supports JSON-mode for stable structured output.
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to process image with AI' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const result = await openaiResponse.json();
    const content = result.choices?.[0]?.message?.content ?? '{}';

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('Failed to parse OpenAI response:', content);
      return new Response(
        JSON.stringify({ error: 'AI returned malformed JSON' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Sanitize. Untrusted fields get clamped to known-good values so the
    // iOS client can decode without defensive parsing.
    const name = String(parsed.name ?? '').trim();
    const brand = parsed.brand ? String(parsed.brand).trim() : null;
    const rawCategory = String(parsed.category ?? '').toLowerCase();
    const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : 'snack';
    const rawAisle = String(parsed.aisleSection ?? '').toLowerCase();
    const aisleSection = VALID_AISLES.includes(rawAisle) ? rawAisle : 'other';
    const rawUnit = String(parsed.packageUnit ?? '').toLowerCase();
    const packageUnit = VALID_UNITS.includes(rawUnit) ? rawUnit : null;
    const packageSize = typeof parsed.packageSize === 'number' && parsed.packageSize > 0
      ? parsed.packageSize
      : null;
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;

    if (!name) {
      return new Response(
        JSON.stringify({ error: 'Could not identify a product in that photo.' }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({
        name,
        brand,
        packageSize,
        packageUnit,
        category,
        aisleSection,
        confidence,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('identify-product error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
