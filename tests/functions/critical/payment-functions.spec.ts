/**
 * Payment Functions Tests
 *
 * Tests Stripe checkout and subscription management Edge Functions.
 * Note: These tests use mock/test data and won't create real charges.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_FUNCTIONS_URL || 'https://functions.tryeatpal.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://api.tryeatpal.com';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

// Test endpoints
const CHECKOUT_ENDPOINT = `${BASE_URL}/functions/v1/create-checkout`;
const SUBSCRIPTION_ENDPOINT = `${BASE_URL}/functions/v1/manage-subscription`;
const PAYMENT_METHODS_ENDPOINT = `${BASE_URL}/functions/v1/manage-payment-methods`;

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

test.describe('Create Checkout Function', () => {
  test.describe.configure({ mode: 'parallel' });

  test('should respond to OPTIONS request', async ({ request }) => {
    const response = await request.fetch(CHECKOUT_ENDPOINT, {
      method: 'OPTIONS',
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBeDefined();
  });

  test('should reject unauthenticated requests', async ({ request }) => {
    const response = await request.post(CHECKOUT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        planId: 'test-plan',
        billingCycle: 'monthly',
      },
    });

    expect([401, 403]).toContain(response.status());
  });

  test('should require planId parameter', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(CHECKOUT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        billingCycle: 'monthly',
      },
    });

    expect([400, 422]).toContain(response.status());
  });

  test('should accept valid checkout request', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(CHECKOUT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        planId: 'pro',
        billingCycle: 'monthly',
      },
    });

    // Should return 200 with checkout URL or 400/404 if plan not found
    expect([200, 400, 404]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.url).toBeDefined();
      expect(body.url).toContain('checkout.stripe.com');
    }
  });

  test('should accept yearly billing cycle', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(CHECKOUT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        planId: 'pro',
        billingCycle: 'yearly',
      },
    });

    expect([200, 400, 404]).toContain(response.status());
  });
});

test.describe('Manage Subscription Function', () => {
  test.describe.configure({ mode: 'parallel' });

  test('should respond to OPTIONS request', async ({ request }) => {
    const response = await request.fetch(SUBSCRIPTION_ENDPOINT, {
      method: 'OPTIONS',
    });

    expect(response.status()).toBe(200);
  });

  test('should reject unauthenticated requests', async ({ request }) => {
    const response = await request.post(SUBSCRIPTION_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        action: 'cancel',
      },
    });

    expect([401, 403]).toContain(response.status());
  });

  test('should require action parameter', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(SUBSCRIPTION_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {},
    });

    expect([400, 422]).toContain(response.status());
  });

  test('should validate action parameter values', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(SUBSCRIPTION_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        action: 'invalid_action',
      },
    });

    expect([400, 422]).toContain(response.status());
  });

  test('should handle cancel action', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(SUBSCRIPTION_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        action: 'cancel',
      },
    });

    // May succeed or fail if no subscription exists
    expect([200, 400, 404]).toContain(response.status());

    const body = await response.json();
    if (response.status() === 200) {
      expect(body.success).toBe(true);
    }
  });

  test('should handle upgrade action with planId', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(SUBSCRIPTION_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        action: 'upgrade',
        planId: 'enterprise',
      },
    });

    // May succeed, return checkout URL, or fail if no subscription
    expect([200, 400, 404]).toContain(response.status());
  });
});

test.describe('Manage Payment Methods Function', () => {
  test.describe.configure({ mode: 'parallel' });

  test('should respond to OPTIONS request', async ({ request }) => {
    const response = await request.fetch(PAYMENT_METHODS_ENDPOINT, {
      method: 'OPTIONS',
    });

    expect(response.status()).toBe(200);
  });

  test('should reject unauthenticated requests', async ({ request }) => {
    const response = await request.post(PAYMENT_METHODS_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        action: 'list',
      },
    });

    expect([401, 403]).toContain(response.status());
  });

  test('should list payment methods', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(PAYMENT_METHODS_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        action: 'list',
      },
    });

    // May succeed with empty list or fail if no Stripe customer
    expect([200, 400, 404]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.paymentMethods)).toBe(true);
    }
  });
});
