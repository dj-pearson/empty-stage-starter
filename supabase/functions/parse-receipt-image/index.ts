import { AIServiceV2 } from '../_shared/ai-service-v2.ts';
import { getCorsHeaders, noCacheHeaders } from '../common/headers.ts';

/**
 * US-310: parse-receipt-image
 *
 * Grocery-receipt OCR + parse for the iOS Pantry import flow. The native
 * `ReceiptScanService` (ReceiptScanService.swift) hands a base64 JPEG of a
 * receipt and expects a structured `Receipt` back so PantryView can review
 * and bulk-add line items instead of hand-typing.
 *
 * Contract (must match ReceiptScanService.swift exactly):
 *   Request:  { imageBase64: string }
 *   Response (Receipt):
 *   {
 *     merchant: string | null,
 *     purchasedAt: string | null,   // ISO-8601 if legible, else null
 *     currency: string,             // ISO 4217, default "USD"
 *     lineItems: [{
 *       rawText: string,
 *       parsedName: string,
 *       qty: number,
 *       unit: string,
 *       unitPrice: number,
 *       lineTotal: number,
 *       category: string,
 *       confidence: number          // 0-1
 *     }]
 *   }
 *
 * The Swift layer throws `.empty` on zero line items and `.lowConfidence`
 * when the average confidence < 0.4, so we always emit numeric confidence
 * per item and never fabricate items we can't read.
 */

interface RequestBody {
  imageBase64: string;
}

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

interface Receipt {
  merchant: string | null;
  purchasedAt: string | null;
  currency: string;
  lineItems: LineItem[];
}

const VALID_CATEGORIES = [
  'protein',
  'carb',
  'dairy',
  'fruit',
  'vegetable',
  'snack',
] as const;

const PROMPT =
  `You are a grocery-receipt parser. Read this receipt photo and extract every grocery line item. Ignore subtotals, tax, totals, loyalty lines, payment lines, and store metadata.

Respond ONLY with strict JSON in this exact shape, no prose, no markdown fences:
{
  "merchant": "<store name if legible, else null>",
  "purchasedAt": "<ISO-8601 date or datetime if legible, else null>",
  "currency": "<ISO 4217 code, default 'USD'>",
  "lineItems": [
    {
      "rawText": "<the raw line exactly as printed>",
      "parsedName": "<clean human-friendly item name>",
      "qty": <quantity as a number, default 1>,
      "unit": "<unit such as 'count','lb','oz','ea', default 'count'>",
      "unitPrice": <price per unit as a number, 0 if unknown>,
      "lineTotal": <line total as a number, 0 if unknown>,
      "category": "<one of: protein, carb, dairy, fruit, vegetable, snack>",
      "confidence": <number between 0 and 1 for how sure you are of this line>
    }
  ]
}

Rules:
- Only include real grocery products. Skip anything that is not a purchasable food/household item.
- "parsedName" should expand common receipt abbreviations (e.g. "GV WHL MLK" -> "Whole Milk").
- Use the closest category from the allowed list. Never invent new category values.
- Set per-item confidence honestly based on legibility.
- If the receipt is unreadable or has no grocery items, return {"merchant": null, "purchasedAt": null, "currency": "USD", "lineItems": []}.`;

function detectMediaType(
  base64: string,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lG')) return 'image/gif';
  if (base64.startsWith('UklG')) return 'image/webp';
  return 'image/jpeg';
}

function num(value: unknown, fallback = 0): number {
  const v = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(v) ? v : fallback;
}

function clamp01(value: unknown): number {
  const v = num(value, 0);
  return Math.max(0, Math.min(1, v));
}

function parseReceipt(rawText: string): Receipt {
  const empty: Receipt = {
    merchant: null,
    purchasedAt: null,
    currency: 'USD',
    lineItems: [],
  };
  if (!rawText) return empty;

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
    if (!objMatch) return empty;
    try {
      parsed = JSON.parse(objMatch[0]);
    } catch {
      return empty;
    }
  }

  if (typeof parsed !== 'object' || parsed === null) return empty;
  const obj = parsed as Record<string, unknown>;

  const itemsRaw = Array.isArray(obj.lineItems) ? obj.lineItems : [];
  const lineItems: LineItem[] = itemsRaw
    .map((raw): LineItem | null => {
      if (typeof raw !== 'object' || raw === null) return null;
      const r = raw as Record<string, unknown>;
      const parsedName = typeof r.parsedName === 'string' ? r.parsedName.trim() : '';
      const rawLine = typeof r.rawText === 'string' ? r.rawText.trim() : parsedName;
      if (!parsedName && !rawLine) return null;
      const category = typeof r.category === 'string' ? r.category.toLowerCase() : '';
      const qty = num(r.qty, 1);
      const unitPrice = num(r.unitPrice, 0);
      const lineTotal = num(r.lineTotal, unitPrice * qty);
      return {
        rawText: rawLine || parsedName,
        parsedName: parsedName || rawLine,
        qty: qty > 0 ? qty : 1,
        unit: typeof r.unit === 'string' && r.unit.trim() ? r.unit.trim() : 'count',
        unitPrice: Math.max(0, unitPrice),
        lineTotal: Math.max(0, lineTotal),
        category: (VALID_CATEGORIES as readonly string[]).includes(category)
          ? category
          : 'snack',
        confidence: clamp01(r.confidence),
      };
    })
    .filter((x): x is LineItem => x !== null);

  return {
    merchant: typeof obj.merchant === 'string' && obj.merchant.trim()
      ? obj.merchant.trim()
      : null,
    purchasedAt: typeof obj.purchasedAt === 'string' && obj.purchasedAt.trim()
      ? obj.purchasedAt.trim()
      : null,
    currency: typeof obj.currency === 'string' && obj.currency.trim()
      ? obj.currency.trim().toUpperCase()
      : 'USD',
    lineItems,
  };
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
      // Receipts can be long; give the model room for many line items.
      maxTokens: 2048,
    }, 'standard');

    if (!aiResponse?.content) {
      return new Response(
        JSON.stringify({ error: 'No content returned from vision model' }),
        { status: 502, headers: noCacheHeaders() },
      );
    }

    const receipt = parseReceipt(aiResponse.content);

    // Always 200 with a well-formed Receipt — the Swift layer decides
    // .empty / .lowConfidence from the structured fields rather than from
    // the HTTP status, so an unreadable receipt is a valid (empty) result.
    return new Response(JSON.stringify(receipt), { headers: noCacheHeaders() });
  } catch (err) {
    console.error('parse-receipt-image error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: noCacheHeaders() },
    );
  }
};
