import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../common/headers.ts';
import { AIServiceV2 } from '../_shared/ai-service-v2.ts';

interface SuggestionRequest {
  householdId: string;
  mealSlot?: string; // Optional: specific meal slot to suggest for
  date?: string; // Optional: specific date
  count?: number; // Number of suggestions to generate (default: 5)
}

interface Recipe {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  prep_time: number;
  cook_time: number;
  servings: number;
  category: string;
  cuisine: string;
  dietary_tags: string[];
}

interface HouseholdContext {
  preferences: any;
  recentRecipes: string[];
  kidFavorites: any[];
  pantryItems: any[];
  kids: any[];
  dietaryRestrictions: string[];
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { householdId, mealSlot, date, count = 5 }: SuggestionRequest = await req.json();

    if (!householdId) {
      throw new Error('householdId is required');
    }

    console.log(`Generating ${count} meal suggestions for household ${householdId}`);

    // Gather household context
    const context = await gatherHouseholdContext(supabaseClient, householdId);

    // Get available recipes (excluding recent ones if variety is preferred)
    const recipes = await getEligibleRecipes(supabaseClient, context);

    if (recipes.length === 0) {
      throw new Error('No eligible recipes found');
    }

    console.log(`Found ${recipes.length} eligible recipes`);

    // Generate AI-powered suggestions
    const suggestions = await generateAISuggestions(
      recipes,
      context,
      count,
      mealSlot,
      date
    );

    // Save suggestions to database
    const savedSuggestions = await saveSuggestions(
      supabaseClient,
      householdId,
      suggestions,
      date || new Date().toISOString().split('T')[0]
    );

    // Update analytics
    await updateAnalytics(supabaseClient, householdId, savedSuggestions.length);

    return new Response(
      JSON.stringify({
        suggestions: savedSuggestions,
        count: savedSuggestions.length,
        context: {
          totalRecipes: recipes.length,
          recentRecipesExcluded: context.recentRecipes.length,
          kidFavoritesAvailable: context.kidFavorites.length,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
};

async function gatherHouseholdContext(
  supabase: any,
  householdId: string
): Promise<HouseholdContext> {
  // Get preferences
  const { data: preferences } = await supabase
    .from('suggestion_preferences')
    .select('*')
    .eq('household_id', householdId)
    .single();

  // Get recent recipes (last 14 days by default)
  const daysBack = preferences?.recent_recipe_window_days || 14;
  const { data: recentRecipes } = await supabase.rpc('get_recent_recipe_ids', {
    p_household_id: householdId,
    p_days_back: daysBack,
  });

  // Get kid favorites
  const minApproval = preferences?.min_kid_approval || 70;
  const { data: kidFavorites } = await supabase.rpc('get_kid_favorite_recipes', {
    p_household_id: householdId,
    p_min_approval: minApproval,
  });

  // Get pantry items
  const { data: pantryItems } = await supabase
    .from('foods')
    .select('id, name, category, quantity')
    .eq('household_id', householdId)
    .gt('quantity', 0);

  // Get kids
  const { data: kids } = await supabase
    .from('kids')
    .select('id, name, age, dietary_restrictions')
    .eq('household_id', householdId);

  // Extract dietary restrictions
  const dietaryRestrictions = new Set<string>();
  kids?.forEach((kid: any) => {
    if (kid.dietary_restrictions) {
      kid.dietary_restrictions.forEach((restriction: string) =>
        dietaryRestrictions.add(restriction)
      );
    }
  });

  if (preferences?.dietary_restrictions) {
    preferences.dietary_restrictions.forEach((restriction: string) =>
      dietaryRestrictions.add(restriction)
    );
  }

  return {
    preferences: preferences || {},
    recentRecipes: recentRecipes || [],
    kidFavorites: kidFavorites || [],
    pantryItems: pantryItems || [],
    kids: kids || [],
    dietaryRestrictions: Array.from(dietaryRestrictions),
  };
}

async function getEligibleRecipes(
  supabase: any,
  context: HouseholdContext
): Promise<Recipe[]> {
  let query = supabase
    .from('recipes')
    .select('*');

  // Filter by dietary restrictions
  if (context.dietaryRestrictions.length > 0) {
    // This would need a proper JSONB query for dietary_tags
    // For now, we'll filter in memory
  }

  // Filter by difficulty if preferences exist
  if (context.preferences.preferred_difficulty) {
    query = query.in('difficulty', context.preferences.preferred_difficulty);
  }

  // Filter by prep time if max is set
  if (context.preferences.max_prep_time) {
    query = query.lte('prep_time', context.preferences.max_prep_time);
  }

  // Filter by cook time if max is set
  if (context.preferences.max_cook_time) {
    query = query.lte('cook_time', context.preferences.max_cook_time);
  }

  const { data: recipes, error } = await query.limit(100);

  if (error) throw error;

  if (!recipes) return [];

  // Exclude recent recipes if preference is set
  let filtered = recipes;
  if (context.preferences.avoid_recent_recipes && context.recentRecipes.length > 0) {
    filtered = recipes.filter((r: Recipe) => !context.recentRecipes.includes(r.id));
  }

  // Filter by dietary restrictions in memory
  if (context.dietaryRestrictions.length > 0) {
    filtered = filtered.filter((r: Recipe) => {
      if (!r.dietary_tags) return true;
      // Check if recipe accommodates all dietary restrictions
      return context.dietaryRestrictions.every((restriction: string) =>
        r.dietary_tags.includes(restriction)
      );
    });
  }

  return filtered;
}

async function generateAISuggestions(
  recipes: Recipe[],
  context: HouseholdContext,
  count: number,
  mealSlot?: string,
  date?: string
): Promise<any[]> {
  // Use AI service or fallback to smart ranking algorithm
  try {
    return await generateAIWithService(recipes, context, count, mealSlot);
  } catch (error) {
    console.warn('AI service unavailable, falling back to smart ranking:', error);
    return await generateSmartRanking(recipes, context, count, mealSlot, date);
  }
}

async function generateAIWithService(
  recipes: Recipe[],
  context: HouseholdContext,
  count: number,
  mealSlot?: string
): Promise<any[]> {
  const aiService = new AIServiceV2();

  // Prepare context for AI
  const contextPrompt = `
You are a helpful meal planning assistant. Analyze the following household context and recommend ${count} meals from the available recipes.

HOUSEHOLD CONTEXT:
- Number of kids: ${context.kids.length}
- Kid ages: ${context.kids.map((k: any) => k.age).join(', ')}
- Dietary restrictions: ${context.dietaryRestrictions.join(', ') || 'None'}
- Recently used recipes (to avoid): ${context.recentRecipes.length} recipes
- Kid favorite recipes: ${context.kidFavorites.length} recipes with approval >70%
- Available pantry items: ${context.pantryItems.length} items

PREFERENCES:
- Max prep time: ${context.preferences.max_prep_time || 'No limit'} minutes
- Max cook time: ${context.preferences.max_cook_time || 'No limit'} minutes
- Preferred difficulty: ${context.preferences.preferred_difficulty?.join(', ') || 'Any'}
- Prefer quick meals: ${context.preferences.prefer_quick_meals ? 'Yes' : 'No'}
- Prioritize kid favorites: ${context.preferences.prioritize_kid_favorites ? 'Yes' : 'No'}
- Use pantry items: ${context.preferences.use_pantry_items ? 'Yes' : 'No'}

${mealSlot ? `Suggest specifically for: ${mealSlot}` : 'Suggest for any meal'}

AVAILABLE RECIPES (sample of ${Math.min(recipes.length, 20)}):
${recipes.slice(0, 20).map((r: Recipe, i: number) => `
${i + 1}. ${r.name} (ID: ${r.id})
   - Description: ${r.description}
   - Difficulty: ${r.difficulty}
   - Prep: ${r.prep_time}min, Cook: ${r.cook_time}min
   - Category: ${r.category}
   - Cuisine: ${r.cuisine || 'Not specified'}
`).join('')}

Please recommend ${count} recipes and for each provide:
1. Recipe ID
2. Brief reasoning (why this is a good fit for this household)
3. Confidence score (0-100)
4. Predicted kid approval (0-100)
5. Key match factors (array of reasons: e.g., "kid_favorite", "quick", "uses_pantry", "variety")

Respond in JSON format:
{
  "suggestions": [
    {
      "recipe_id": "uuid",
      "reasoning": "string",
      "confidence_score": number,
      "predicted_kid_approval": number,
      "match_factors": ["factor1", "factor2"]
    }
  ]
}
`;

  try {
    const content = await aiService.generateContent(contextPrompt, {
      taskType: 'standard', // Meal planning requires smart analysis
    });

    console.log('AI response:', content);

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.suggestions;
    }

    throw new Error('Failed to parse AI response');
  } catch (error) {
    console.error('AI suggestion error, falling back to smart ranking:', error);
    return await generateSmartRanking(recipes, context, count, mealSlot);
  }
}

async function generateSmartRanking(
  recipes: Recipe[],
  context: HouseholdContext,
  count: number,
  mealSlot?: string,
  date?: string
): Promise<any[]> {
  // Smart scoring algorithm without AI
  const scoredRecipes = recipes.map((recipe: Recipe) => {
    let score = 50; // Base score
    const matchFactors: string[] = [];

    // Kid favorites boost
    const isFavorite = context.kidFavorites.some((f: any) => f.recipe_id === recipe.id);
    if (isFavorite) {
      score += 30;
      matchFactors.push('kid_favorite');
    }

    // Quick meal boost
    const totalTime = recipe.prep_time + recipe.cook_time;
    if (totalTime <= 30) {
      score += 15;
      matchFactors.push('quick');
    }

    // Easy difficulty boost
    if (recipe.difficulty === 'easy') {
      score += 10;
      matchFactors.push('easy_to_make');
    }

    // Variety boost (not recently used)
    if (!context.recentRecipes.includes(recipe.id)) {
      score += 10;
      matchFactors.push('variety');
    }

    // Category-based scoring for meal slot
    if (mealSlot) {
      if (mealSlot === 'breakfast' && recipe.category?.toLowerCase().includes('breakfast')) {
        score += 20;
        matchFactors.push('perfect_timing');
      } else if (mealSlot === 'dinner' && recipe.category?.toLowerCase().includes('main')) {
        score += 15;
        matchFactors.push('perfect_timing');
      }
    }

    // Predicted kid approval (simplified)
    let predictedApproval = 70;
    if (isFavorite) {
      const favorite = context.kidFavorites.find((f: any) => f.recipe_id === recipe.id);
      predictedApproval = favorite?.approval_score || 85;
    }

    return {
      recipe_id: recipe.id,
      reasoning: generateReasoning(recipe, matchFactors, context),
      confidence_score: Math.min(score, 95),
      predicted_kid_approval: predictedApproval,
      match_factors: matchFactors,
      recipe,
    };
  });

  // Sort by score and return top N
  scoredRecipes.sort((a, b) => b.confidence_score - a.confidence_score);

  return scoredRecipes.slice(0, count);
}

function generateReasoning(recipe: Recipe, factors: string[], context: HouseholdContext): string {
  const reasons: string[] = [];

  if (factors.includes('kid_favorite')) {
    reasons.push('Kids love this meal based on past votes');
  }
  if (factors.includes('quick')) {
    const time = recipe.prep_time + recipe.cook_time;
    reasons.push(`Quick ${time}-minute meal`);
  }
  if (factors.includes('easy_to_make')) {
    reasons.push('Easy to prepare');
  }
  if (factors.includes('variety')) {
    reasons.push("Haven't had this recently");
  }
  if (factors.includes('perfect_timing')) {
    reasons.push('Perfect for this meal time');
  }

  if (reasons.length === 0) {
    reasons.push('Good match for your household');
  }

  return reasons.join('. ') + '.';
}

async function saveSuggestions(
  supabase: any,
  householdId: string,
  suggestions: any[],
  date: string
): Promise<any[]> {
  const records = suggestions.map((s) => ({
    household_id: householdId,
    recipe_id: s.recipe_id,
    suggested_for_date: date,
    reasoning: s.reasoning,
    confidence_score: s.confidence_score,
    predicted_kid_approval: s.predicted_kid_approval,
    match_factors: s.match_factors,
    estimated_prep_time: s.recipe?.prep_time,
    estimated_cook_time: s.recipe?.cook_time,
    difficulty: s.recipe?.difficulty,
    status: 'pending',
  }));

  const { data, error } = await supabase
    .from('meal_suggestions')
    .insert(records)
    .select();

  if (error) throw error;

  return data;
}

async function updateAnalytics(
  supabase: any,
  householdId: string,
  count: number
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  await supabase.rpc('upsert_suggestion_analytics', {
    p_household_id: householdId,
    p_date: today,
    p_suggestions_generated: count,
  }).catch((err: any) => {
    // If function doesn't exist, insert directly
    supabase
      .from('suggestion_analytics')
      .upsert({
        household_id: householdId,
        date: today,
        suggestions_generated: count,
      })
      .catch(console.error);
  });
}
