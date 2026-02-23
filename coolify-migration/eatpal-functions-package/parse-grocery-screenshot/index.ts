
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GroceryListItem {
  name: string;
  quantity: number;
  unit: string;
  category: 'protein' | 'carb' | 'dairy' | 'fruit' | 'vegetable' | 'snack';
  notes?: string;
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, textContent } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build the prompt for parsing grocery lists
    const systemPrompt = `You are a grocery list parser. Extract grocery/shopping list items from the provided content.

Return a JSON object with:
- items: array of objects, each with:
  - name: string (the grocery item name, cleaned up and normalized, e.g. "Whole Milk" not "milk - whole")
  - quantity: number (default 1 if not specified)
  - unit: string (e.g. "lbs", "oz", "gallon", "bunch", "bag", "box", "can", "pack", "dozen", "each". Default "each" if not specified)
  - category: one of "protein", "carb", "dairy", "fruit", "vegetable", "snack" (best guess based on the item)
  - notes: string or null (any extra detail like brand preference, size, or special instructions)

Rules:
- Parse ALL items you can find, even partial or abbreviated ones
- Handle common abbreviations (doz = dozen, lb/lbs = pounds, oz = ounces, gal = gallon, pkg = package)
- If an item has a checkmark or strikethrough, still include it but add "already purchased" in notes
- Ignore non-grocery text (headers, dates, store names, totals, prices)
- If quantity is a range like "2-3", use the lower number
- Combine duplicate items when possible
- For items like "apples (Gala)" put the variety in the name: "Gala Apples"

Only respond with valid JSON, no other text.`;

    let messages: any[];

    if (imageBase64) {
      // Image-based parsing (screenshot)
      const imageDataUrl = typeof imageBase64 === 'string' && imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;

      console.log('Parsing grocery list from screenshot...');

      messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            {
              type: 'image_url',
              image_url: { url: imageDataUrl },
            },
          ],
        },
      ];
    } else if (textContent) {
      // Text-based parsing (shared text from Notes, URLs, etc.)
      console.log('Parsing grocery list from text...');

      messages = [
        {
          role: 'user',
          content: `${systemPrompt}\n\nHere is the text to parse:\n\n${textContent}`,
        },
      ];
    } else {
      throw new Error('Either imageBase64 or textContent is required');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required, please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response
    const cleanContent = content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const parsed = JSON.parse(cleanContent);

    // Validate the response structure
    if (!parsed.items || !Array.isArray(parsed.items)) {
      throw new Error('Invalid response format: missing items array');
    }

    // Normalize and validate each item
    const validCategories = ['protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack'];
    const items: GroceryListItem[] = parsed.items
      .filter((item: any) => item.name && typeof item.name === 'string')
      .map((item: any) => ({
        name: String(item.name).trim(),
        quantity: Math.max(1, parseInt(item.quantity) || 1),
        unit: String(item.unit || 'each').trim(),
        category: validCategories.includes(item.category) ? item.category : 'snack',
        notes: item.notes ? String(item.notes).trim() : undefined,
      }));

    console.log(`Parsed ${items.length} grocery items`);

    return new Response(
      JSON.stringify({ success: true, items }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error parsing grocery screenshot:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse grocery list',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};
