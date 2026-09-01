import { withStandingLimits } from "../_shared/safety.ts";
import { AIServiceV2 } from "../_shared/ai-service-v2.ts";
import { requireUser } from "../_shared/require-admin.ts";


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticated users only: paid AI call, same gate as parse-recipe.
  const gate = await requireUser(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error ?? 'Unauthorized' }), {
      status: gate.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // US-709: read only the recipe inputs. aiModel used to arrive from the
    // client and named both the endpoint to POST to and the env var holding
    // the key, which handed any signed-in user a server secret. The model is
    // now resolved server-side by AIServiceV2.
    const { selectedFoodNames, childProfile } = await req.json();

    if (!selectedFoodNames || selectedFoodNames.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No foods selected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build child profile context
    const profileContext = childProfile ? `
Important Child Profile Information:
- Age: ${childProfile.age || 'not specified'} years old
- ALLERGENS (NEVER include these): ${childProfile.allergens?.join(', ') || 'none'}
- Dietary Restrictions: ${childProfile.dietary_restrictions?.join(', ') || 'none'}
- Eating Behavior: ${childProfile.eating_behavior || 'not specified'}
- Pickiness Level: ${childProfile.pickiness_level || 'not specified'}
- Texture Sensitivity: ${childProfile.texture_sensitivity_level || 'not specified'}
- Preferred Textures: ${childProfile.texture_preferences?.join(', ') || 'not specified'}
- Disliked Textures: ${childProfile.texture_dislikes?.join(', ') || 'not specified'}
- Flavor Preferences: ${childProfile.flavor_preferences?.join(', ') || 'not specified'}
- Preferred Preparations: ${childProfile.preferred_preparations?.join(', ') || 'not specified'}
- Foods to Avoid: ${childProfile.disliked_foods?.join(', ') || 'not specified'}
- Health Goals: ${childProfile.health_goals?.join(', ') || 'none'}
` : '';

    const systemPrompt = `You are a creative chef assistant helping parents create recipes for picky eaters. 
${profileContext}

Create a complete, detailed recipe using the provided ingredients. CRITICAL REQUIREMENTS:
- NEVER include any allergens listed in the child's profile
- Respect all dietary restrictions
- Use preferred textures and avoid disliked textures
- Use preferred preparation methods when possible
- Consider their eating behavior and pickiness level
- Support their health goals
- Make the recipe appealing to their flavor preferences

Include:
- A creative, kid-friendly recipe name
- A brief description (2-3 sentences)
- Detailed cooking instructions (numbered steps)
- Prep time and cook time estimates
- Any additional common ingredients needed (keep it simple and allergen-free!)
- Tips for making it appealing to this specific child

Format your response as JSON with these exact fields:
{
  "name": "Recipe Name",
  "description": "Brief description",
  "instructions": "Detailed numbered cooking instructions",
  "prepTime": "X minutes",
  "cookTime": "X minutes", 
  "servings": "X servings",
  "additionalIngredients": ["ingredient1", "ingredient2"],
  "tips": "Tips tailored to this child's profile"
}`;

    const userPrompt = `Create a recipe using these ingredients: ${selectedFoodNames.join(', ')}`;

    const aiService = new AIServiceV2();
    const aiResponse = await aiService.generateContent({
      messages: [
        { role: 'system', content: withStandingLimits(systemPrompt) },
        { role: 'user', content: userPrompt },
      ],
    }, 'standard');

    const recipeText = aiResponse?.content ?? '';
    if (!recipeText) {
      return new Response(
        JSON.stringify({ error: 'No recipe data generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to parse as JSON
    let recipe;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = recipeText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       recipeText.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : recipeText;
      recipe = JSON.parse(jsonStr);
    } catch (e) {
      console.log('Failed to parse as JSON, using text response');
      recipe = {
        name: 'AI Generated Recipe',
        description: recipeText.substring(0, 200),
        instructions: recipeText,
        prepTime: 'N/A',
        cookTime: 'N/A',
        servings: 'N/A',
        additionalIngredients: [],
        tips: ''
      };
    }

    return new Response(
      JSON.stringify({ recipe }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in suggest-recipe function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
