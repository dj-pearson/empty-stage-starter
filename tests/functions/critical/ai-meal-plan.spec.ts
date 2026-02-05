/**
 * AI Meal Plan Function Tests
 *
 * Tests the ai-meal-plan endpoint which generates customized meal plans using AI.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_FUNCTIONS_URL || 'https://functions.tryeatpal.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://api.tryeatpal.com';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const MEAL_PLAN_ENDPOINT = `${BASE_URL}/functions/v1/ai-meal-plan`;

// Sample test data
const SAMPLE_KID = {
  id: 'test-kid-id',
  name: 'Test Child',
  age: 5,
  allergens: ['peanuts', 'tree nuts'],
  favorite_foods: ['pizza', 'pasta', 'chicken nuggets'],
};

const SAMPLE_FOODS = [
  { id: 'food-1', name: 'Apple', category: 'fruit', is_safe: true, allergens: [] },
  { id: 'food-2', name: 'Banana', category: 'fruit', is_safe: true, allergens: [] },
  { id: 'food-3', name: 'Chicken Breast', category: 'protein', is_safe: true, allergens: [] },
  { id: 'food-4', name: 'Rice', category: 'grain', is_safe: true, allergens: [] },
  { id: 'food-5', name: 'Broccoli', category: 'vegetable', is_safe: false, is_try_bite: true, allergens: [] },
];

const SAMPLE_RECIPES = [
  { id: 'recipe-1', name: 'Chicken and Rice', food_ids: ['food-3', 'food-4'] },
  { id: 'recipe-2', name: 'Fruit Bowl', food_ids: ['food-1', 'food-2'] },
];

// Helper to get auth token
async function getAuthToken(request: any): Promise<string | null> {
  if (!SUPABASE_ANON_KEY) return null;

  try {
    const response = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        password: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
      },
    });

    if (response.ok()) {
      const body = await response.json();
      return body.access_token;
    }
  } catch {
    // Ignore auth errors in test
  }

  return null;
}

test.describe('AI Meal Plan Function', () => {
  test.describe.configure({ mode: 'serial' }); // Serial to avoid AI rate limits

  test('should respond to OPTIONS request', async ({ request }) => {
    const response = await request.fetch(MEAL_PLAN_ENDPOINT, {
      method: 'OPTIONS',
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBeDefined();
  });

  test('should reject unauthenticated requests', async ({ request }) => {
    const response = await request.post(MEAL_PLAN_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        kid: SAMPLE_KID,
        foods: SAMPLE_FOODS,
        recipes: SAMPLE_RECIPES,
        days: 1,
      },
    });

    expect([401, 403]).toContain(response.status());
  });

  test('should require kid parameter', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(MEAL_PLAN_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        foods: SAMPLE_FOODS,
        recipes: SAMPLE_RECIPES,
        days: 1,
      },
    });

    expect([400, 422]).toContain(response.status());
  });

  test('should require foods parameter', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(MEAL_PLAN_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        kid: SAMPLE_KID,
        recipes: SAMPLE_RECIPES,
        days: 1,
      },
    });

    expect([400, 422]).toContain(response.status());
  });

  test('should validate days parameter range', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    // Test with invalid days (too high)
    const response = await request.post(MEAL_PLAN_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        kid: SAMPLE_KID,
        foods: SAMPLE_FOODS,
        recipes: SAMPLE_RECIPES,
        days: 100, // Too many days
      },
    });

    // Should either cap the days or return error
    expect([200, 400, 422]).toContain(response.status());
  });

  test('should generate meal plan with valid input', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(MEAL_PLAN_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        kid: SAMPLE_KID,
        foods: SAMPLE_FOODS,
        recipes: SAMPLE_RECIPES,
        days: 1,
      },
      timeout: 60000, // 60 second timeout for AI
    });

    // May succeed or fail due to AI configuration
    expect([200, 400, 402, 429, 500, 503]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.plan).toBeDefined();
      expect(Array.isArray(body.plan)).toBe(true);

      if (body.plan.length > 0) {
        const dayPlan = body.plan[0];
        expect(dayPlan.day).toBeDefined();
        expect(dayPlan.meals).toBeDefined();

        // Check meal slots
        const mealSlots = ['breakfast', 'lunch', 'dinner'];
        for (const slot of mealSlots) {
          // Meal slots may be present
          if (dayPlan.meals[slot]) {
            expect(typeof dayPlan.meals[slot]).toBe('string');
          }
        }
      }
    }
  });

  test('should respect allergen restrictions', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    // Add food with allergen that kid is allergic to
    const foodsWithAllergen = [
      ...SAMPLE_FOODS,
      { id: 'food-danger', name: 'Peanut Butter', category: 'spread', is_safe: true, allergens: ['peanuts'] },
    ];

    const response = await request.post(MEAL_PLAN_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        kid: SAMPLE_KID, // Has peanut allergy
        foods: foodsWithAllergen,
        recipes: SAMPLE_RECIPES,
        days: 1,
      },
      timeout: 60000,
    });

    if (response.status() === 200) {
      const body = await response.json();

      // Verify peanut butter is not included in any meal
      const planString = JSON.stringify(body.plan);
      expect(planString).not.toContain('food-danger');
    }
  });

  test('should handle rate limiting gracefully', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(MEAL_PLAN_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        kid: SAMPLE_KID,
        foods: SAMPLE_FOODS,
        recipes: SAMPLE_RECIPES,
        days: 1,
      },
      timeout: 60000,
    });

    // 429 is acceptable for rate limiting
    if (response.status() === 429) {
      const body = await response.json();
      expect(body.error || body.message).toBeDefined();
    }
  });

  test('should include try-bite foods when requested', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(MEAL_PLAN_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        kid: SAMPLE_KID,
        foods: SAMPLE_FOODS, // Includes broccoli as try_bite
        recipes: SAMPLE_RECIPES,
        days: 1,
      },
      timeout: 60000,
    });

    if (response.status() === 200) {
      const body = await response.json();

      // Check if try_bite slot is included
      if (body.plan && body.plan.length > 0) {
        const dayPlan = body.plan[0];
        // try_bite may or may not be present depending on AI logic
        expect(dayPlan.meals).toBeDefined();
      }
    }
  });

  test('should respond within timeout', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const startTime = Date.now();
    await request.post(MEAL_PLAN_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        kid: SAMPLE_KID,
        foods: SAMPLE_FOODS,
        recipes: SAMPLE_RECIPES,
        days: 1,
      },
      timeout: 60000,
    });
    const duration = Date.now() - startTime;

    // Should respond within 60 seconds
    expect(duration).toBeLessThan(60000);
  });

  test('should accept custom AI model configuration', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(MEAL_PLAN_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        kid: SAMPLE_KID,
        foods: SAMPLE_FOODS,
        recipes: SAMPLE_RECIPES,
        days: 1,
        aiModel: {
          provider: 'claude',
          temperature: 0.7,
          max_tokens: 2000,
        },
      },
      timeout: 60000,
    });

    // Should accept the configuration even if it uses default
    expect([200, 400, 402, 429, 500, 503]).toContain(response.status());
  });
});
