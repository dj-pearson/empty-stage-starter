
import { AIServiceV2 } from '../_shared/ai-service-v2.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    
    // Initialize AI service
    const aiService = new AIServiceV2();

    console.log('Analyzing food image with AI...');

    // Use standard model for vision tasks
    const promptText = 'Identify the food item(s) in this image. Return a JSON response with:\n- name: The specific food name (e.g., "Orange", "Apple", "Chicken Breast")\n- variety: The specific variety if identifiable (e.g., "Gala", "Fuji", "Granny Smith" for apples, "Navel", "Valencia" for oranges). Leave empty if variety cannot be determined or doesn\'t apply.\n- varietyOptions: Array of common varieties for this food type (e.g., ["Gala", "Fuji", "Honeycrisp", "Granny Smith", "Red Delicious"] for apples). Leave empty if varieties don\'t apply.\n- category: one of: protein, carb, dairy, fruit, vegetable, snack\n- confidence: a number 0-100 indicating identification confidence\n- description: brief description of what you see\n- servingSize: estimated typical serving size (e.g., "1 medium", "1 cup")\n- quantity: number of items visible in the image (count them carefully)\n- servingSizeOptions: array of common serving size options for this food (e.g., ["1 small", "1 medium", "1 large"] for oranges, or ["1 cuties", "1 small", "1 medium", "1 large"] for oranges that could be different sizes)\n\nIf multiple food items are visible, identify the most prominent type and count how many of that type are shown.\nOnly respond with valid JSON, no other text.';
    
    // TODO: Add vision support to AIServiceV2 - for now just use text prompt
    const content = await aiService.generateContent(promptText + '\n\n[Image data: base64 provided but vision not yet supported in AIServiceV2]', {
      taskType: 'standard', // Vision requires capable model
    });
    
    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response from AI
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
