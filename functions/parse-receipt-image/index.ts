/**
 * Parse Receipt Image Edge Function (US-294)
 *
 * Uses OpenAI gpt-4o-mini vision to extract structured line items from a
 * grocery receipt photo. Returns merchant, purchase date, currency, and a
 * list of line items with quantity, unit, price, category, and confidence.
 *
 * POST /parse-receipt-image
 * Body: { "imageBase64": "base64-encoded-image-data" }
 *
 * Response (200):
 * {
 *   "merchant": "Whole Foods Market" | null,
 *   "purchasedAt": "2026-05-08" | null,
 *   "currency": "USD",
 *   "lineItems": [
 *     {
 *       "rawText": "ORG BANANAS 1.32LB",
 *       "parsedName": "Bananas",
 *       "qty": 1.32,
 *       "unit": "lb",
 *       "unitPrice": 0.79,
 *       "lineTotal": 1.04,
 *       "category": "fruit",
 *       "confidence": 0.92
 *     }
 *   ]
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';

const VALID_CATEGORIES = [
  'protein',
  'carb',
  'dairy',
  'fruit',
  'vegetable',
  'snack',
  'beverage',
  'pantry',
  'frozen',
  'household',
  'other',
];

const KNOWN_MERCHANTS = [
  'Whole Foods',
  'Aldi',
  'Walmart',
  "Trader Joe's",
  'Costco',
  'Target',
  'Kroger',
  'Safeway',
  'Publix',
  'Wegmans',
  'H-E-B',
  'Sprouts',
];

interface LineItem {
  rawText: string;
  parsedName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  category: string;
  confidence: number;
}

function detectMediaType(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  return 'image/jpeg';
}

function clamp01(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function sanitizeLineItem(raw: any): LineItem | null {
  const parsedName = String(raw?.parsedName || raw?.name || '').trim();
  if (parsedName.length === 0) return null;
  const qty =
    typeof raw?.qty === 'number' && raw.qty > 0
      ? raw.qty
      : typeof raw?.quantity === 'number' && raw.quantity > 0
        ? raw.quantity
        : 1;
  const unitPrice =
    typeof raw?.unitPrice === 'number' && raw.unitPrice >= 0 ? raw.unitPrice : 0;
  const lineTotal =
    typeof raw?.lineTotal === 'number' && raw.lineTotal >= 0
      ? raw.lineTotal
      : unitPrice * qty;
  return {
    rawText: String(raw?.rawText || '').trim(),
    parsedName,
    qty,
    unit: String(raw?.unit || '').trim().toLowerCase(),
    unitPrice,
    lineTotal,
    category: VALID_CATEGORIES.includes(raw?.category) ? raw.category : 'other',
    confidence: clamp01(typeof raw?.confidence === 'number' ? raw.confidence : 0.6),
  };
}

function normalizeMerchant(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const lower = trimmed.toLowerCase();
  for (const known of KNOWN_MERCHANTS) {
    if (lower.includes(known.toLowerCase())) return known;
  }
  return trimmed.slice(0, 80);
}

function normalizePurchasedAt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return trimmed;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { imageBase64 } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return new Response(
        JSON.stringify({ error: 'imageBase64 is required and must be a string' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const systemPrompt = `You are a grocery receipt extraction assistant. Given a photo of a grocery receipt, extract every line item with the highest fidelity you can.

Return ONLY valid JSON in this exact format (no surrounding prose, no markdown):
{
  "merchant": "Whole Foods Market",
  "purchasedAt": "2026-05-08",
  "currency": "USD",
  "lineItems": [
    {
      "rawText": "ORG BANANAS 1.32LB",
      "parsedName": "Bananas",
      "qty": 1.32,
      "unit": "lb",
      "unitPrice": 0.79,
      "lineTotal": 1.04,
      "category": "fruit",
      "confidence": 0.92
    }
  ]
}

Rules:
- "category" MUST be one of: "protein", "carb", "dairy", "fruit", "vegetable", "snack", "beverage", "pantry", "frozen", "household", "other"
- "qty" is a positive number; if a weighed item shows total weight, use that weight as qty (e.g. 1.32 for 1.32 LB)
- "unit" is lowercase: "lb", "oz", "kg", "g", "ml", "l", "ea", "ct", "pack", "bag", "box", "jar", "can", or empty string
- "unitPrice" is the per-unit price as printed; "lineTotal" is the total paid for the line. Both in major currency units (e.g. dollars, not cents)
- "confidence" is your 0..1 self-rated certainty; below 0.5 means the line was hard to read
- "purchasedAt" must be ISO YYYY-MM-DD or null if not visible
- "merchant" should be the store name as printed; null if not legible
- "currency" defaults to "USD" unless clearly otherwise (look for €, £, ¥, CAD, etc.)
- SKIP non-item lines: subtotals, tax, totals, change, loyalty messages, "thank you" lines, store address. These are NOT lineItems.
- Discounts that are tied to a specific item should be subtracted from that item's lineTotal; standalone coupon lines are skipped.
- Return an empty lineItems array if no items are legible.`;

    const mediaType = detectMediaType(imageBase64);

    const openaiResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
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
                  text: 'Extract every line item from this receipt.',
                },
              ],
            },
          ],
          max_tokens: 4000,
          temperature: 0.1,
        }),
      },
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to process receipt with AI' }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const result = await openaiResponse.json();
    const content: string = result.choices?.[0]?.message?.content ?? '';

    let parsed: any;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [
        null,
        content,
      ];
      parsed = JSON.parse(jsonMatch[1] || content);
    } catch {
      console.error('Failed to parse OpenAI receipt response:', content);
      return new Response(
        JSON.stringify({
          merchant: null,
          purchasedAt: null,
          currency: 'USD',
          lineItems: [],
          error: 'Failed to parse AI response',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const lineItems: LineItem[] = (Array.isArray(parsed?.lineItems)
      ? parsed.lineItems
      : []
    )
      .map(sanitizeLineItem)
      .filter((x: LineItem | null): x is LineItem => x !== null);

    const merchant = normalizeMerchant(parsed?.merchant);
    const purchasedAt = normalizePurchasedAt(parsed?.purchasedAt);
    const currency =
      typeof parsed?.currency === 'string' && parsed.currency.length <= 4
        ? parsed.currency.toUpperCase()
        : 'USD';

    return new Response(
      JSON.stringify({ merchant, purchasedAt, currency, lineItems }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error) {
    console.error('parse-receipt-image error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
