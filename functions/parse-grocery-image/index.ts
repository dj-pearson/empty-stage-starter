/**
 * Parse Grocery Image Edge Function
 *
 * Uses OpenAI gpt-4o-mini vision to extract grocery items from a screenshot.
 *
 * POST /parse-grocery-image
 * Body: { "imageBase64": "base64-encoded-image-data" }
 *
 * Response (200):
 * {
 *   "items": [{ "name": "...", "quantity": 1, "unit": "...", "category": "protein" }],
 *   "raw_text": "..."
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';

const VALID_CATEGORIES = ['protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack'];

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  // Authenticate request
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const body = await req.json();
    const { imageBase64 } = body;

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

    const systemPrompt = `You are a grocery list extraction assistant. Given an image of a grocery list, handwritten note, screenshot from a notes app, or similar, extract every grocery item visible.

Return ONLY valid JSON in this exact format:
{
  "items": [
    { "name": "item name", "quantity": 1, "unit": "lbs", "category": "protein" }
  ],
  "raw_text": "the raw text you can read from the image"
}

Rules:
- "category" MUST be one of: "protein", "carb", "dairy", "fruit", "vegetable", "snack"
- "quantity" must be a positive number (default 1 if unclear)
- "unit" should be a common unit (lbs, oz, bags, cans, boxes, etc.) or empty string if not specified
- Include ALL items you can read, even if partially visible
- For ambiguous items, use your best judgment for category
- Return empty items array if no grocery items are found`;

    // Detect image type from base64 prefix or default to jpeg
    let mediaType = 'image/jpeg';
    if (imageBase64.startsWith('/9j/')) mediaType = 'image/jpeg';
    else if (imageBase64.startsWith('iVBOR')) mediaType = 'image/png';
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
                image_url: {
                  url: `data:${mediaType};base64,${imageBase64}`,
                  detail: 'high',
                },
              },
              {
                type: 'text',
                text: 'Extract all grocery items from this image.',
              },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.2,
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
    const content = result.choices?.[0]?.message?.content ?? '';

    let parsed: { items: any[]; raw_text: string };
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      parsed = JSON.parse(jsonMatch[1] || content);
    } catch {
      console.error('Failed to parse OpenAI response:', content);
      return new Response(
        JSON.stringify({ items: [], raw_text: content, error: 'Failed to parse AI response' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Sanitize items
    const items = (parsed.items || []).map((item: any) => ({
      name: String(item.name || '').trim(),
      quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
      unit: String(item.unit || '').trim(),
      category: VALID_CATEGORIES.includes(item.category) ? item.category : 'snack',
    })).filter((item: any) => item.name.length > 0);

    return new Response(
      JSON.stringify({
        items,
        raw_text: parsed.raw_text || '',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('parse-grocery-image error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
