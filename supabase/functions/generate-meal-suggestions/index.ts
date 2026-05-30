import { getCorsHeaders, securityHeaders, noCacheHeaders } from '../common/headers.ts';
import { AIServiceV2 } from '../_shared/ai-service-v2.ts';

/**
 * generate-meal-suggestions
 *
 * Per-kid, single-day meal suggestions for the native iOS (Swift) and
 * Android (Kotlin) clients. The client gathers the kid's profile, pantry
 * (safe / try-bite foods), recent meals, and rating signals, and we return
 * one suggestion per meal slot.
 *
 * CONTRACT — must stay in sync with:
 *   ios/EatPal/EatPal/Services/AIMealService.swift
 *   android-native/.../data/remote/AIMealService.kt
 *
 * Both clients send snake_case fields and decode the response as a BARE
 * top-level JSON array (not wrapped in an object). Changing the shape below
 * breaks both shipped apps — they fall back to a random local shuffle.
 *
 * Request body:
 *   {
 *     kid_id: string,
 *     date: string,                         // ISO yyyy-MM-dd
 *     safe_foods: [{ id, name, category }],
 *     try_bite_foods: [{ id, name, category }],
 *     recent_meals: [{ date, slot, food_name, result? }],
 *     preferences: { name, age?, pickiness_level?, allergens?,
 *                    texture_preferences?, flavor_preferences? },
 *     prefer_ingredients?: string[],        // expiring soon — use these up
 *     loved_meals?: string[],               // rated 4-5 stars
 *     refused_meals?: [{ name, note? }],     // rated 1-2 stars
 *     weekly_budget?: number,
 *     available_ingredients?: string[]      // confirmed on hand
 *   }
 *
 * Response body (BARE ARRAY):
 *   [{ id, meal_slot, food_name, food_id?, reasoning, nutrition_note? }]
 */

interface FoodSummary {
  id: string;
  name: string;
  category?: string;
}

interface KidPreferences {
  name?: string;
  age?: number;
  pickiness_level?: string;
  allergens?: string[];
  texture_preferences?: string[];
  flavor_preferences?: string[];
}

interface SuggestionRequest {
  kid_id?: string;
  date?: string;
  safe_foods?: FoodSummary[];
  try_bite_foods?: FoodSummary[];
  recent_meals?: { date: string; slot: string; food_name: string; result?: string }[];
  preferences?: KidPreferences;
  prefer_ingredients?: string[];
  loved_meals?: string[];
  refused_meals?: { name: string; note?: string }[];
  weekly_budget?: number;
  available_ingredients?: string[];
}

interface MealSuggestion {
  id: string;
  meal_slot: string;
  food_name: string;
  food_id: string | null;
  reasoning: string;
  nutrition_note: string | null;
}

// The slots the clients render. Matches MealSlot on both apps.
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'try_bite'];

export default async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = {
    ...corsHeaders,
    ...securityHeaders,
    ...noCacheHeaders(),
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: SuggestionRequest = await req.json().catch(() => ({} as SuggestionRequest));

    const safeFoods = Array.isArray(body.safe_foods) ? body.safe_foods : [];
    const tryBiteFoods = Array.isArray(body.try_bite_foods) ? body.try_bite_foods : [];
    const prefs = body.preferences ?? {};
    const allergens = Array.isArray(prefs.allergens) ? prefs.allergens : [];

    // Without any pantry foods there's nothing safe to suggest from; return an
    // empty array (the client then shows its own empty/fallback state) rather
    // than letting the model invent foods the family doesn't have.
    if (safeFoods.length === 0 && tryBiteFoods.length === 0) {
      return new Response(JSON.stringify([]), { status: 200, headers: jsonHeaders });
    }

    const recentMeals = (body.recent_meals ?? []).slice(0, 21);
    const lovedMeals = body.loved_meals ?? [];
    const refusedMeals = body.refused_meals ?? [];
    const preferIngredients = body.prefer_ingredients ?? [];
    const availableIngredients = body.available_ingredients ?? [];

    const fmtFoods = (foods: FoodSummary[]) =>
      foods.map((f) => `- ${f.name}${f.category ? ` (${f.category})` : ''}`).join('\n') || '- (none)';

    const systemPrompt = `You are a pediatric nutrition assistant who plans meals for picky eaters.
Suggest ONE food for each of these meal slots: ${MEAL_SLOTS.join(', ')}.

Rules:
1. ONLY suggest foods from the "Safe foods" or "Try-bite foods" lists below — never invent foods the family doesn't have.
2. The "try_bite" slot MUST come from the Try-bite list; all other slots should prefer Safe foods.
3. NEVER suggest anything containing the child's allergens: ${allergens.join(', ') || 'none'}.
4. Avoid repeating foods the child ate recently or that were refused.
5. Prefer foods that are expiring soon or confirmed on hand when sensible.
6. Keep "reasoning" to one short, warm sentence a parent would find helpful.
7. "nutrition_note" is optional — a brief nutrition highlight or null.

Return ONLY a valid JSON array (no markdown, no prose) shaped exactly like:
[
  { "meal_slot": "breakfast", "food_name": "<exact name from a list>", "reasoning": "<one sentence>", "nutrition_note": "<short note or null>" }
]`;

    const userPrompt = `Child: ${prefs.name ?? 'the child'}${prefs.age != null ? `, age ${prefs.age}` : ''}
Pickiness: ${prefs.pickiness_level ?? 'unknown'}
Texture preferences: ${(prefs.texture_preferences ?? []).join(', ') || 'none specified'}
Flavor preferences: ${(prefs.flavor_preferences ?? []).join(', ') || 'none specified'}

Safe foods:
${fmtFoods(safeFoods)}

Try-bite foods:
${fmtFoods(tryBiteFoods)}

Recently eaten (avoid repeats): ${recentMeals.map((m) => m.food_name).join(', ') || 'none'}
Loved meals (favor these): ${lovedMeals.join(', ') || 'none'}
Refused meals (avoid these): ${refusedMeals.map((r) => r.name + (r.note ? ` (${r.note})` : '')).join(', ') || 'none'}
Expiring soon (use up): ${preferIngredients.join(', ') || 'none'}
Confirmed on hand: ${availableIngredients.join(', ') || 'none'}
${body.weekly_budget ? `Weekly budget is limited — prefer economical choices.` : ''}

Plan suggestions for ${body.date ?? 'today'}.`;

    const aiService = new AIServiceV2();
    const response = await aiService.generateContent(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: 1500,
        temperature: 0.7,
      },
      'standard'
    );

    // Extract the JSON array from the model output (tolerate code fences).
    const text = response.content ?? '';
    const match =
      text.match(/```json\s*([\s\S]*?)\s*```/) ||
      text.match(/```\s*([\s\S]*?)\s*```/) ||
      text.match(/(\[[\s\S]*\])/);

    if (!match) {
      throw new Error('No JSON array found in AI response');
    }

    const parsed = JSON.parse(match[1] || match[0]) as Array<{
      meal_slot?: string;
      food_name?: string;
      reasoning?: string;
      nutrition_note?: string | null;
    }>;

    // Map each suggested food name back to a known food id (case-insensitive),
    // and synthesize a stable id. Drop anything we can't tie to a real food
    // so the client never receives a hallucinated item.
    const byName = new Map<string, string>();
    for (const f of [...safeFoods, ...tryBiteFoods]) {
      byName.set(f.name.toLowerCase().trim(), f.id);
    }

    const suggestions: MealSuggestion[] = (Array.isArray(parsed) ? parsed : [])
      .filter((s) => s && typeof s.food_name === 'string' && typeof s.meal_slot === 'string')
      .map((s) => {
        const foodId = byName.get((s.food_name as string).toLowerCase().trim()) ?? null;
        return {
          id: crypto.randomUUID(),
          meal_slot: s.meal_slot as string,
          food_name: s.food_name as string,
          food_id: foodId,
          reasoning: s.reasoning ?? `A good pick for ${prefs.name ?? 'your child'}.`,
          nutrition_note: s.nutrition_note ?? null,
        };
      })
      // Only keep suggestions that resolved to a real pantry food.
      .filter((s) => s.food_id !== null);

    return new Response(JSON.stringify(suggestions), { status: 200, headers: jsonHeaders });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    // Return an empty array (not a 500) so the clients degrade to their local
    // fallback cleanly instead of surfacing a hard error.
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: jsonHeaders,
    });
  }
};
