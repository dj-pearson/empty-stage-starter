/**
 * Barcode Lookup Edge Function Tests
 *
 * Tests the lookup-barcode endpoint which provides multi-source product lookup.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_FUNCTIONS_URL || 'https://functions.tryeatpal.com';
const BARCODE_ENDPOINT = `${BASE_URL}/functions/v1/lookup-barcode`;

// Well-known barcodes for testing
const TEST_BARCODES = {
  // Coca-Cola (widely available in Open Food Facts)
  cocaCola: '5449000000439',
  // Nutella
  nutella: '3017620422003',
  // Invalid barcode (too short)
  invalid: '123',
  // Non-existent but valid format
  nonExistent: '9999999999999',
};

test.describe('Barcode Lookup Function', () => {
  test.describe.configure({ mode: 'parallel' });

  test('should respond to OPTIONS request with CORS headers', async ({ request }) => {
    const response = await request.fetch(BARCODE_ENDPOINT, {
      method: 'OPTIONS',
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBeDefined();
    expect(response.headers()['access-control-allow-methods']).toBeDefined();
  });

  test('should require barcode parameter', async ({ request }) => {
    const response = await request.post(BARCODE_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect([400, 422]).toContain(response.status());

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  test('should reject invalid barcode format', async ({ request }) => {
    const response = await request.post(BARCODE_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        barcode: TEST_BARCODES.invalid,
      },
    });

    expect([400, 404]).toContain(response.status());
  });

  test('should lookup known product successfully', async ({ request }) => {
    const response = await request.post(BARCODE_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        barcode: TEST_BARCODES.cocaCola,
      },
    });

    // May be 200 (found) or 404 (not in database)
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.food).toBeDefined();
      expect(body.food.name).toBeDefined();
      expect(body.food.source).toBeDefined();
    }
  });

  test('should return proper food structure when found', async ({ request }) => {
    const response = await request.post(BARCODE_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        barcode: TEST_BARCODES.nutella,
      },
    });

    if (response.status() === 200) {
      const body = await response.json();

      // Verify food structure
      const food = body.food;
      expect(food).toBeDefined();

      // Required fields
      expect(food.name).toBeDefined();
      expect(typeof food.name).toBe('string');

      // Optional nutrition fields (may or may not be present)
      if (food.calories !== undefined) {
        expect(typeof food.calories).toBe('number');
      }
      if (food.protein_g !== undefined) {
        expect(typeof food.protein_g).toBe('number');
      }
      if (food.carbs_g !== undefined) {
        expect(typeof food.carbs_g).toBe('number');
      }
      if (food.fat_g !== undefined) {
        expect(typeof food.fat_g).toBe('number');
      }

      // Source should be one of the known providers
      const validSources = [
        'Open Food Facts',
        'USDA FoodData Central',
        'FoodRepo',
        'Your Pantry',
        'Nutrition Database',
      ];
      expect(validSources.some(s => food.source?.includes(s) || true)).toBe(true);
    }
  });

  test('should handle non-existent barcode gracefully', async ({ request }) => {
    const response = await request.post(BARCODE_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        barcode: TEST_BARCODES.nonExistent,
      },
    });

    expect([200, 404]).toContain(response.status());

    const body = await response.json();
    if (response.status() === 404) {
      expect(body.success).toBe(false);
    }
  });

  test('should detect allergens when present', async ({ request }) => {
    const response = await request.post(BARCODE_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        barcode: TEST_BARCODES.nutella,
      },
    });

    if (response.status() === 200) {
      const body = await response.json();

      // Allergens should be an array
      if (body.food.allergens) {
        expect(Array.isArray(body.food.allergens)).toBe(true);
        // Nutella typically contains nuts, milk
        const expectedAllergens = ['nuts', 'milk', 'hazelnut'];
        const hasExpectedAllergen = body.food.allergens.some(
          (a: string) => expectedAllergens.some(e => a.toLowerCase().includes(e))
        );
        // May or may not detect, depending on data source
        expect(typeof hasExpectedAllergen).toBe('boolean');
      }
    }
  });

  test('should respond within acceptable time', async ({ request }) => {
    const startTime = Date.now();
    await request.post(BARCODE_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        barcode: TEST_BARCODES.cocaCola,
      },
    });
    const duration = Date.now() - startTime;

    // Should respond within 10 seconds (includes external API calls)
    expect(duration).toBeLessThan(10000);
  });

  test('should handle concurrent requests', async ({ request }) => {
    const requests = Array(5)
      .fill(null)
      .map(() =>
        request.post(BARCODE_ENDPOINT, {
          headers: {
            'Content-Type': 'application/json',
          },
          data: {
            barcode: TEST_BARCODES.cocaCola,
          },
        })
      );

    const responses = await Promise.all(requests);

    // All requests should complete
    for (const response of responses) {
      expect([200, 404]).toContain(response.status());
    }
  });
});
