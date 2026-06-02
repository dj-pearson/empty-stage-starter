import { AIServiceV2 } from '../_shared/ai-service-v2.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * US-321: identify-food-image now performs real vision identification.
 *
 * Previously this sent only a text prompt with a placeholder note ("vision
 * not yet supported") AND called generateContent() with a bare string, so
 * every result was a blind guess. AIServiceV2 supports image messages
 * (AIMessage.images), so we attach the base64 JPEG/PNG as an image part the
 * same way recognize-fridge-contents does.
 *
 * Response shape is intentionally unchanged — { success, foodData } with the
 * variety/varietyOptions/servingSizeOptions fields the existing web + iOS
 * callers already decode. This is distinct from identify-product (US-311),
 * which returns a flat product/aisle shape for Quick Add.
 */

const PROMPT = 'Identify the food item(s) in this image. Return a JSON response with:\n- name: The specific food name (e.g., "Orange", "Apple", "Chicken Breast")\n- variety: The specific variety if identifiable (e.g., "Gala", "Fuji", "Granny Smith" for apples, "Navel", "Valencia" for oranges). Leave empty if variety cannot be determined or doesn\'t apply.\n- varietyOptions: Array of common varieties for this food type (e.g., ["Gala", "Fuji", "Honeycrisp", "Granny Smith", "Red Delicious"] for apples). Leave empty if varieties don\'t apply.\n- category: one of: protein, carb, dairy, fruit, vegetable, snack\n- confidence: a number 0-100 indicating identification confidence\n- description: brief description of what you see\n- servingSize: estimated typical serving size (e.g., "1 medium", "1 cup")\n- quantity: number of items visible in the image (count them carefully)\n- servingSizeOptions: array of common serving size options for this food (e.g., ["1 small", "1 medium", "1 large"] for oranges, or ["1 cuties", "1 small", "1 medium", "1 large"] for oranges that could be different sizes)\n\nIf multiple food items are visible, identify the most prominent type and count how many of that type are shown.\nOnly respond with valid JSON, no other text.';

function detectMediaType(
  base64: string,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lG')) return 'image/gif';
  if (base64.startsWith('UklG')) return 'image/webp';
  return 'image/jpeg';
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'imageBase64 is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const rawBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const mediaType = detectMediaType(rawBase64);

    const aiService = new AIServiceV2();

    console.log('Analyzing food image with AI vision...');

    // Pass the image as a real vision part instead of the old placeholder
    // text. Standard model — vision needs the more capable tier.
    const aiResponse = await aiService.generateContent(
      {
        messages: [
          {
            role: 'user',
            content: PROMPT,
            images: [{ type: 'base64', media_type: mediaType, data: rawBase64 }],
          },
        ],
        maxTokens: 1024,
      },
      'standard',
    );

    const content = aiResponse?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response from AI (strip ```json fences if present)
    const cleanContent = content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const foodData = JSON.parse(cleanContent);

    console.log('Food identified:', foodData);

    return new Response(
      JSON.stringify({ success: true, foodData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error identifying food:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to identify food'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
