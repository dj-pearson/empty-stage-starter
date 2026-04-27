import { AIServiceV2 } from '../_shared/ai-service-v2.ts';

/**
 * US-238: recognize-fridge-contents
 *
 * Accepts a base64-encoded JPEG of a fridge interior, sends it to a
 * vision-capable model via AIServiceV2 (the same shared service the rest
 * of the codebase uses), and returns a normalised list of detected
 * ingredients with confidence scores.
 *
 * The iOS client (FridgeRecognitionService) compresses to ~768px before
 * upload so the base64 payload stays under the 1MB function limit.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  imageBase64: string;
}

interface DetectedItem {
  id: string;
  name: string;
  category?: string;
  confidence: number;
}

const PROMPT = `You are a kitchen-vision assistant for a kid-meal-planning app.
Look at this fridge photo and list the food ingredients you can identify.

Respond ONLY with strict JSON in this exact shape, no prose:
{
  "items": [
    { "name": "<short noun, lowercase singular>", "category": "<protein|carb|dairy|fruit|vegetable|snack>", "confidence": <0..1> }
  ]
}

Rules:
- Use simple, parent-friendly names ("milk", "broccoli", "chicken thighs"), not brand names.
- Skip non-food items (jars of cleaning supplies, tupperware).
- Skip items you can't identify with at least 0.4 confidence.
- Cap the list at 25 items — pick the most prominent.
- If you can't see any food, return {"items": []}.`;

function detectMediaType(base64: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("R0lG")) return "image/gif";
  if (base64.startsWith("UklG")) return "image/webp";
  return "image/jpeg";
}

/**
 * Strict-parse the model's JSON response into the iOS-facing schema.
 * Defensive: models occasionally wrap their output in ```json fences,
 * so we strip those before parsing.
 */
function parseItems(rawText: string): DetectedItem[] {
  if (!rawText) return [];

  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fall back to first {...} block in case there's prose around it.
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!objMatch) {
      console.error("Failed to parse model JSON:", cleaned.slice(0, 200));
      throw new Error("Model returned malformed JSON");
    }
    try {
      parsed = JSON.parse(objMatch[0]);
    } catch {
      console.error("Failed to parse model JSON:", cleaned.slice(0, 200));
      throw new Error("Model returned malformed JSON");
    }
  }

  const itemsRaw = (parsed as { items?: unknown[] })?.items;
  if (!Array.isArray(itemsRaw)) return [];

  const validCategories = new Set([
    "protein",
    "carb",
    "dairy",
    "fruit",
    "vegetable",
    "snack",
  ]);

  return itemsRaw
    .map((raw, idx): DetectedItem | null => {
      if (typeof raw !== "object" || raw === null) return null;
      const obj = raw as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      if (!name) return null;
      const conf = typeof obj.confidence === "number" ? obj.confidence : 0.5;
      const cat = typeof obj.category === "string"
        ? obj.category.toLowerCase()
        : undefined;
      return {
        id: `fridge-${idx}-${name.replace(/\s+/g, "-")}`,
        name,
        category: cat && validCategories.has(cat) ? cat : undefined,
        confidence: Math.max(0, Math.min(1, conf)),
      };
    })
    .filter((x): x is DetectedItem => x !== null)
    .slice(0, 25);
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = (await req.json()) as RequestBody;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "imageBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    const mediaType = detectMediaType(rawBase64);

    const aiService = new AIServiceV2();
    const aiResponse = await aiService.generateContent({
      messages: [
        {
          role: "user",
          content: PROMPT,
          images: [{ type: "base64", media_type: mediaType, data: rawBase64 }],
        },
      ],
      maxTokens: 1024,
    }, "standard");

    if (!aiResponse?.content) {
      return new Response(
        JSON.stringify({ error: "No content returned from vision model" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const items = parseItems(aiResponse.content);

    return new Response(
      JSON.stringify({ items }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("recognize-fridge-contents error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
};
