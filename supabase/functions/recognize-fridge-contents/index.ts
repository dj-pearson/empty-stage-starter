import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * US-238: recognize-fridge-contents
 *
 * Accepts a base64-encoded JPEG of a fridge interior, sends it to a
 * vision-capable model (Anthropic Claude by default; OpenAI fallback if
 * `OPENAI_API_KEY` is set), and returns a normalised list of detected
 * ingredients with confidence scores.
 *
 * The iOS client (FridgeRecognitionService) compresses to ~768px before
 * upload so the base64 payload stays under the 1MB function limit.
 *
 * Auth: requires the standard Supabase user JWT (anon key + Bearer token
 * forwarded by the iOS client). Per-user rate limiting + monthly quota
 * checks should layer in via the existing `ai-quota` middleware once
 * available.
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

async function callAnthropic(imageBase64: string): Promise<DetectedItem[]> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic ${response.status}: ${body}`);
  }

  const json = await response.json();
  const text = json?.content?.[0]?.text ?? "";
  return parseItems(text);
}

async function callOpenAI(imageBase64: string): Promise<DetectedItem[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI ${response.status}: ${body}`);
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  return parseItems(text);
}

/**
 * Strict-parse the model's JSON response into the iOS-facing schema.
 * Defensive: models occasionally wrap their output in ```json fences,
 * so we strip those before parsing.
 */
function parseItems(rawText: string): DetectedItem[] {
  if (!rawText) return [];

  // Strip ```json fences if present.
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse model JSON:", cleaned.slice(0, 200));
    throw new Error("Model returned malformed JSON");
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

    // Prefer Anthropic; fall back to OpenAI if Anthropic key isn't set.
    // Both providers ship in this codebase already (parse-recipe uses
    // either via the aiModel param) so we follow the same convention.
    const hasAnthropic = !!Deno.env.get("ANTHROPIC_API_KEY");
    const items = hasAnthropic
      ? await callAnthropic(imageBase64)
      : await callOpenAI(imageBase64);

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
