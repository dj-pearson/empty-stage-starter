import { AIServiceV2 } from '../_shared/ai-service-v2.ts';
import { getCorsHeaders, noCacheHeaders } from '../common/headers.ts';

/**
 * US-311: identify-product
 *
 * Single-product vision identification for the iOS Quick-Add camera flow.
 * The native `ProductPhotoIdentifier` (ProductPhotoIdentifier.swift) points
 * the camera at ONE grocery item and expects back a structured product
 * descriptor it can drop straight into Quick Add.
 *
 * Contract (must match ProductPhotoIdentifier.swift exactly):
 *   Request:  { imageBase64: string }
 *   Response: {
 *     name: string,
 *     brand?: string,
 *     packageSize?: number,
 *     packageUnit?: string,
 *     category: string,
 *     aisleSection: string,
 *     confidence: number   // 0-1
 *   }
 *
 * On an unidentifiable photo we return HTTP 422 with an error body; the
 * Swift layer maps 422 -> `.unidentifiable` and shows the "try a clearer
 * shot" copy. Anything else surfaces as `.network`.
 *
 * Distinct from `identify-food-image` (different, vision-less legacy shape)
 * and `recognize-fridge-contents` (whole-fridge multi-item scan).
 */

interface RequestBody {
  imageBase64: string;
}

interface IdentifiedProduct {
  name: string;
  brand?: string;
  packageSize?: number;
  packageUnit?: string;
  category: string;
  aisleSection: string;
  confidence: number;
}

/**
 * Category enum mirrors the iOS `FoodCategory` raw values. We constrain the
 * model to this set so `FoodCategory(rawValue:)` on the client never falls
 * back to `.other` unexpectedly.
 */
const VALID_CATEGORIES = [
  'protein',
  'carb',
  'dairy',
  'fruit',
  'vegetable',
  'snack',
] as const;

/**
 * Aisle taxonomy mirrors the iOS `GroceryAisle` raw values. Keep this in
 * sync with StoreLayoutService.swift; an unknown value maps to `.other`
 * client-side, so a mismatch degrades gracefully rather than crashing.
 */
const VALID_AISLES = [
  'produce',
  'dairy',
  'meat',
  'seafood',
  'bakery',
  'frozen',
  'pantry',
  'canned',
  'condiments',
  'snacks',
  'beverages',
  'breakfast',
  'baking',
  'deli',
  'household',
  'other',
] as const;

const PROMPT = `You are a grocery-product identification assistant. Look at this single product photo (a label, package, or piece of produce) and identify the one most prominent product.

Respond ONLY with strict JSON in this exact shape, no prose, no markdown fences:
{
  "name": "<short product name, e.g. 'Whole Milk' or 'Bananas'>",
  "brand": "<brand if clearly printed, else omit>",
  "packageSize": <numeric package size if printed, e.g. 64, else omit>,
  "packageUnit": "<unit for packageSize, e.g. 'oz','fl oz','g','count', else omit>",
  "category": "<one of: protein, carb, dairy, fruit, vegetable, snack>",
  "aisleSection": "<one of: produce, dairy, meat, seafood, bakery, frozen, pantry, canned, condiments, snacks, beverages, breakfast, baking, deli, household, other>",
  "confidence": <number between 0 and 1>
}

Rules:
- "name" must be a parent-friendly noun, not a marketing tagline.
- Use the closest category and aisleSection from the allowed lists. Never invent new values.
- If you genuinely cannot identify the product, return {"name": "", "confidence": 0}.
- Set confidence honestly: 0.9+ only when the label/product is unambiguous.`;

function detectMediaType(
  base64: string,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lG')) return 'image/gif';
  if (base64.startsWith('UklG')) return 'image/webp';
  return 'image/jpeg';
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function parseProduct(rawText: string): IdentifiedProduct | null {
  if (!rawText) return null;

  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!objMatch) return null;
    try {
      parsed = JSON.parse(objMatch[0]);
    } catch {
      return null;
    }
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name) return null;

  const category = typeof obj.category === 'string' ? obj.category.toLowerCase() : '';
  const aisleSection = typeof obj.aisleSection === 'string'
    ? obj.aisleSection.toLowerCase()
    : '';

  const result: IdentifiedProduct = {
    name,
    category: (VALID_CATEGORIES as readonly string[]).includes(category)
      ? category
      : 'snack',
    aisleSection: (VALID_AISLES as readonly string[]).includes(aisleSection)
      ? aisleSection
      : 'other',
    confidence: clamp01(obj.confidence),
  };

  if (typeof obj.brand === 'string' && obj.brand.trim()) {
    result.brand = obj.brand.trim();
  }
  const size = typeof obj.packageSize === 'number'
    ? obj.packageSize
    : Number(obj.packageSize);
  if (Number.isFinite(size) && size > 0) {
    result.packageSize = size;
  }
  if (typeof obj.packageUnit === 'string' && obj.packageUnit.trim()) {
    result.packageUnit = obj.packageUnit.trim();
  }

  return result;
}

export default async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = (await req.json()) as RequestBody;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return new Response(
        JSON.stringify({ error: 'imageBase64 is required' }),
        { status: 400, headers: noCacheHeaders() },
      );
    }

    const rawBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const mediaType = detectMediaType(rawBase64);

    const aiService = new AIServiceV2();
    const aiResponse = await aiService.generateContent({
      messages: [
        {
          role: 'user',
          content: PROMPT,
          images: [{ type: 'base64', media_type: mediaType, data: rawBase64 }],
        },
      ],
      maxTokens: 512,
    }, 'standard');

    if (!aiResponse?.content) {
      return new Response(
        JSON.stringify({ error: 'No content returned from vision model' }),
        { status: 502, headers: noCacheHeaders() },
      );
    }

    const product = parseProduct(aiResponse.content);

    // Empty name or zero confidence => unidentifiable. Swift maps 422 to
    // `.unidentifiable` and shows the "clearer shot" copy.
    if (!product || product.confidence <= 0) {
      return new Response(
        JSON.stringify({ error: 'Could not identify the product' }),
        { status: 422, headers: noCacheHeaders() },
      );
    }

    return new Response(JSON.stringify(product), { headers: noCacheHeaders() });
  } catch (err) {
    console.error('identify-product error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: noCacheHeaders() },
    );
  }
};
