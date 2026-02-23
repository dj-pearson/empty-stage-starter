import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge function: parse-grocery-screenshot
 *
 * Accepts either:
 *  - { imageBase64: string } — a base64-encoded image (screenshot, photo)
 *  - { text: string }        — raw text to parse into grocery items
 *
 * Returns:
 *  { success: true, items: ParsedGroceryItem[] }
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageBase64, text } = await req.json();

    if (!imageBase64 && !text) {
      return new Response(
        JSON.stringify({ error: "Either imageBase64 or text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const systemPrompt = `You are a grocery list parser. Your job is to extract individual grocery items from user input (text or images of grocery lists, notes, reminders, recipes, etc.).

For each item, determine:
- name: The item name (normalized, e.g. "chicken breast" not "Chicken Breast 2 lbs")
- quantity: Numeric quantity (default 1 if unclear)
- unit: Unit of measurement (e.g. "lbs", "oz", "dozen", "items", "bunch", "bag", "box", "gallon", "can"). Default "items" if unclear.
- category: One of "protein", "carb", "dairy", "fruit", "vegetable", "snack" — pick the best fit
- notes: Any brand preference, specific variety, or extra detail (optional)

Rules:
- Parse intelligently: "2 dozen eggs" → name: "Eggs", quantity: 2, unit: "dozen"
- "Milk (2%)" → name: "Milk", quantity: 1, unit: "gallon", notes: "2%"
- "Chicken breast 2 lbs" → name: "Chicken breast", quantity: 2, unit: "lbs"
- "Bananas x6" → name: "Bananas", quantity: 6, unit: "items"
- If an item has a checkmark/strikethrough, skip it (already purchased)
- Ignore headers like "Grocery List", "Shopping List", dates, store names
- Ignore non-food items unless they're clearly household grocery items (paper towels, dish soap, etc. → category "snack")
- Deduplicate items that appear to be the same thing
- Return items in the order they appear

Respond ONLY with valid JSON in this exact format:
{
  "items": [
    { "name": "...", "quantity": 1, "unit": "items", "category": "...", "notes": "" }
  ]
}`;

    let messages: any[];

    if (imageBase64) {
      // Strip data URL prefix if present
      const base64Data = imageBase64.includes(",")
        ? imageBase64.split(",")[1]
        : imageBase64;

      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Parse this grocery list image and extract all items. Return only JSON.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Data}`,
                detail: "high",
              },
            },
          ],
        },
      ];
    } else {
      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Parse this grocery list text and extract all items. Return only JSON.\n\n${text}`,
        },
      ];
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: imageBase64 ? "gpt-4o" : "gpt-4o-mini",
        messages,
        max_tokens: 4096,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("OpenAI API error:", errorBody);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI model");
    }

    const parsed = JSON.parse(content);
    const items = parsed.items || [];

    // Validate and sanitize items
    const validCategories = new Set([
      "protein",
      "carb",
      "dairy",
      "fruit",
      "vegetable",
      "snack",
    ]);

    const validatedItems = items
      .filter((item: any) => item.name && typeof item.name === "string")
      .map((item: any) => ({
        name: String(item.name).trim(),
        quantity: Math.max(1, parseInt(item.quantity) || 1),
        unit: String(item.unit || "items").trim(),
        category: validCategories.has(item.category) ? item.category : "snack",
        notes: item.notes ? String(item.notes).trim() : undefined,
      }));

    return new Response(
      JSON.stringify({ success: true, items: validatedItems }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in parse-grocery-screenshot:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to parse grocery list",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
